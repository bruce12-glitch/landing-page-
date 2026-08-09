import { NextRequest, NextResponse } from 'next/server';
import { validateAdminKey } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { db } from '@/lib/db/client';
import { verificationQueue } from '@/lib/queue/verification-queue';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
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

  // Guard: Authenticate via x-admin-key header
  if (!validateAdminKey(req)) {
    logger.warn({ ip, vendorId: params.id, docId: params.docId }, 'Unauthorized verification trigger');
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

    // Enqueue verification job with idempotency key
    const jobResult = await verificationQueue.enqueue({
      vendorId: params.id,
      documentId: params.docId,
      docType: doc.type,
      sha256: doc.sha256,
    });

    const updatedVendor = await db.findVendorById(params.id);

    return NextResponse.json(
      {
        message: 'Verification job successfully enqueued',
        jobId: jobResult.jobId,
        idempotencyKey: jobResult.idempotencyKey,
        status: jobResult.status,
        vendorStatus: updatedVendor?.status || 'IN_PROGRESS',
        queuedAt: jobResult.queuedAt,
      },
      { status: 202 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id, docId: params.docId }, 'Error enqueuing verification job');
    return NextResponse.json(
      { error: 'Internal server error processing verification request', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
