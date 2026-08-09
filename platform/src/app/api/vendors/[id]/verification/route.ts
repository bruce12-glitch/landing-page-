import { NextRequest, NextResponse } from 'next/server';
import { validateAdminKey } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

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

    const events = await db.findEventsByVendorId(params.id);
    const documents = await db.findDocumentsByVendorId(params.id);

    const timeline = events.map((event) => ({
      id: event.id,
      actor: event.actor,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reason: event.reason,
      evidenceSha: event.evidenceSha || null,
      sandbox: event.actor.includes('Sandbox') || event.actor === 'ADMIN_API' || event.actor === 'INTAKE_API' || event.actor === 'VERIFY_TRIGGER',
      createdAt: event.createdAt.toISOString(),
    }));

    return NextResponse.json(
      {
        vendorId: vendor.id,
        legalName: vendor.legalName,
        currentStatus: vendor.status,
        verificationMode: process.env.VERIFICATION_ADAPTER === 'gstn' ? 'GSTN_GOVERNMENT_PORTAL' : 'SANDBOX_DETERMINISTIC',
        documentsSummary: documents.map((doc) => ({
          id: doc.id,
          type: doc.type,
          status: doc.status,
          sha256: doc.sha256,
        })),
        timeline,
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id }, 'Error retrieving verification timeline');
    return NextResponse.json(
      { error: 'Internal server error retrieving verification status', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
