import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { db } from '@/lib/db/client';
import { getStorageDriver } from '@/lib/storage/factory';
import { decryptDocument } from '@/lib/crypto/envelope';
import { inspectMagicBytes } from '@/lib/crypto/magic-bytes';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const KEK_MASTER_KEY =
  process.env.KEK_MASTER_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    );
  }

  // Guard: Authenticate request and resolve attributed actor name
  const auth = authenticateRequest(req);
  if (!auth.authorized || !auth.actor) {
    logger.warn({ ip, vendorId: params.id, docId: params.docId }, 'Unauthorized document byte read attempt');
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

    const doc = await db.findDocumentById(params.docId);
    if (!doc || doc.vendorId !== params.id) {
      return NextResponse.json(
        { error: `Document with ID '${params.docId}' not found for this vendor`, code: 'DOCUMENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    const storage = getStorageDriver();
    const objectExists = await storage.exists(doc.storagePath);
    if (!objectExists) {
      logger.error(
        { vendorId: params.id, docId: params.docId, storagePath: doc.storagePath },
        'Document object missing from storage driver'
      );
      return NextResponse.json(
        {
          error: 'Document ciphertext object no longer exists on storage backend',
          code: 'STORAGE_OBJECT_GONE',
        },
        { status: 410 }
      );
    }

    // 1. Read ciphertext from storage driver
    const ciphertext = await storage.read(doc.storagePath);

    // 2. Decrypt in memory
    const decryptedBuffer = decryptDocument(
      ciphertext,
      doc.dekWrapped,
      doc.iv,
      doc.authTag,
      KEK_MASTER_KEY
    );

    // 3. Inspect magic bytes for content-type
    const magic = inspectMagicBytes(decryptedBuffer);
    const contentType = magic.mimeType || 'application/octet-stream';
    const extension = magic.extension || 'bin';

    // 4. AUDITED ACT: Append immutable VerificationEvent audit trail
    await db.createVerificationEvent({
      vendorId: params.id,
      actor: auth.actor,
      fromStatus: vendor.status,
      toStatus: vendor.status,
      reason: 'ADMIN_READ',
      evidenceSha: doc.sha256,
    });

    logger.info(
      {
        vendorId: params.id,
        docId: params.docId,
        actor: auth.actor,
        docSha: doc.sha256,
      },
      'Audited document read executed'
    );

    // Stream decrypted bytes with strict Cache-Control headers
    return new NextResponse(decryptedBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="doc_${doc.type}_${doc.id}.${extension}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Document-Sha256': doc.sha256,
      },
    });
  } catch (err) {
    logger.error({ err, vendorId: params.id, docId: params.docId }, 'Error streaming decrypted document bytes');
    return NextResponse.json(
      { error: 'Internal server error decrypting document bytes', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
