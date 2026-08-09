import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateAdminKey } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { DocumentTypeEnum } from '@/lib/validation/vendor';
import { inspectMagicBytes } from '@/lib/crypto/magic-bytes';
import { encryptDocument } from '@/lib/crypto/envelope';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB Strict Limit
const KEK_MASTER_KEY =
  process.env.KEK_MASTER_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const STORAGE_DIR = process.env.STORAGE_DIR || './storage/encrypted_docs';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    );
  }

  // Guard: Authenticate via x-admin-key header
  if (!validateAdminKey(req)) {
    logger.warn({ ip, vendorId: params.id }, 'Unauthorized document upload attempt');
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid x-admin-key header', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  try {
    // 1. Verify Vendor exists
    const vendor = await db.findVendorById(params.id);
    if (!vendor) {
      return NextResponse.json(
        { error: `Vendor with ID '${params.id}' not found`, code: 'VENDOR_NOT_FOUND' },
        { status: 404 }
      );
    }

    // 2. Parse Multipart Form Data
    const formData = await req.formData();
    const typeRaw = formData.get('type');
    const file = formData.get('file');

    if (!typeRaw || typeof typeRaw !== 'string') {
      return NextResponse.json(
        {
          error: "Missing required 'type' field (must be one of: GST_CERT, PAN_CARD, BANK_PROOF)",
          code: 'MISSING_DOCUMENT_TYPE',
        },
        { status: 400 }
      );
    }

    const typeParse = DocumentTypeEnum.safeParse(typeRaw);
    if (!typeParse.success) {
      return NextResponse.json(
        {
          error: `Invalid document type '${typeRaw}'. Allowed types: GST_CERT, PAN_CARD, BANK_PROOF`,
          code: 'INVALID_DOCUMENT_TYPE',
        },
        { status: 400 }
      );
    }
    const docType = typeParse.data;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing required document file in 'file' multipart field", code: 'MISSING_FILE' },
        { status: 400 }
      );
    }

    // 3. File size cap check (≤ 5MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File size exceeds 5MB maximum limit. Received: ${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          code: 'FILE_TOO_LARGE',
        },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 4. Magic byte inspection (NEVER trust extension or claimed MIME header)
    const magicCheck = inspectMagicBytes(fileBuffer);
    if (!magicCheck.valid) {
      logger.warn(
        { vendorId: params.id, error: magicCheck.error },
        'Document upload rejected by magic byte security validator'
      );
      return NextResponse.json(
        {
          error: magicCheck.error || 'File content failed magic byte inspection. Only valid PDF, PNG, and JPEG files are permitted.',
          code: 'INVALID_FILE_MAGIC_BYTES',
        },
        { status: 400 }
      );
    }

    // 5. Envelope Encryption (AES-256-GCM) with random DEK and Master KEK wrapping
    const encryptedPayload = encryptDocument(fileBuffer, KEK_MASTER_KEY);

    // 6. Write ciphertext to local storage directory
    const resolvedStorageDir = path.resolve(STORAGE_DIR);
    await fs.mkdir(resolvedStorageDir, { recursive: true });

    const filename = `vendor_${params.id}_${docType}_${Date.now()}_${encryptedPayload.sha256.slice(0, 12)}.enc`;
    const storagePath = path.join(resolvedStorageDir, filename);

    // Store ONLY ciphertext at rest
    await fs.writeFile(storagePath, encryptedPayload.ciphertext);

    // 7. Persist Document metadata in database
    const documentRecord = await db.createDocument({
      vendorId: params.id,
      type: docType,
      storagePath,
      sha256: encryptedPayload.sha256,
      dekWrapped: encryptedPayload.dekWrapped,
      iv: encryptedPayload.iv,
      authTag: encryptedPayload.authTag,
      status: 'STORED',
    });

    // 8. Advance Vendor Status to PENDING & log append-only audit event
    const oldStatus = vendor.status;
    let newStatus = vendor.status;
    if (vendor.status === 'UNVERIFIED') {
      newStatus = 'PENDING';
      await db.updateVendorStatus(params.id, 'PENDING');
    }

    await db.createVerificationEvent({
      vendorId: params.id,
      actor: 'INTAKE_API',
      fromStatus: oldStatus,
      toStatus: newStatus,
      reason: `Document intake completed for type ${docType}. SHA-256: ${encryptedPayload.sha256}`,
    });

    logger.info(
      { vendorId: params.id, documentId: documentRecord.id, type: docType },
      'Document successfully encrypted and stored'
    );

    return NextResponse.json(
      {
        id: documentRecord.id,
        vendorId: documentRecord.vendorId,
        type: documentRecord.type,
        sha256: documentRecord.sha256,
        status: documentRecord.status,
        createdAt: documentRecord.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id }, 'Error during document intake upload');
    return NextResponse.json(
      { error: 'Internal server error processing document upload', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    );
  }

  // Guard: Authenticate via x-admin-key header
  if (!validateAdminKey(req)) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid x-admin-key header', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  try {
    const vendor = await db.findVendorById(params.id);
    if (!vendor) {
      return NextResponse.json(
        { error: `Vendor with ID '${params.id}' not found`, code: 'VENDOR_NOT_FOUND' },
        { status: 404 }
      );
    }

    const documents = await db.findDocumentsByVendorId(params.id);

    // Return metadata ONLY (no byte streaming in Slice 1)
    const metadataList = documents.map((doc) => ({
      id: doc.id,
      vendorId: doc.vendorId,
      type: doc.type,
      sha256: doc.sha256,
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
    }));

    return NextResponse.json(
      {
        vendorId: params.id,
        documents: metadataList,
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id }, 'Error retrieving document list');
    return NextResponse.json(
      { error: 'Internal server error retrieving documents', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
