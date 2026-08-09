import { NextRequest, NextResponse } from 'next/server';
import { validateAdminKey } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { CreateVendorSchema } from '@/lib/validation/vendor';
import { encryptPan, maskPan } from '@/lib/crypto/pan-encryption';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const KEK_MASTER_KEY =
  process.env.KEK_MASTER_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // Guard: Authenticate via x-admin-key header
  if (!validateAdminKey(req)) {
    logger.warn({ ip }, 'Unauthorized vendor registration attempt');
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid x-admin-key header', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  try {
    const rawBody: unknown = await req.json();
    const parseResult = CreateVendorSchema.safeParse(rawBody);

    if (!parseResult.success) {
      const errorDetails = parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'INVALID_REQUEST_BODY',
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { legalName, gstNumber, panNumber } = parseResult.data;

    // Check duplicate GST
    const existingVendor = await db.findVendorByGst(gstNumber);
    if (existingVendor) {
      return NextResponse.json(
        {
          error: `Vendor with GST number '${gstNumber}' is already registered`,
          code: 'DUPLICATE_GST_NUMBER',
        },
        { status: 409 }
      );
    }

    // Encrypt PAN using AES-256-GCM Envelope Key before persistence
    const panEncrypted = encryptPan(panNumber, KEK_MASTER_KEY);

    // Persist Vendor with default UNVERIFIED state
    const vendor = await db.createVendor({
      legalName,
      gstNumber,
      panEncrypted,
      status: 'UNVERIFIED',
    });

    // Record append-only VerificationEvent audit trail
    await db.createVerificationEvent({
      vendorId: vendor.id,
      actor: 'ADMIN_API',
      fromStatus: 'UNVERIFIED',
      toStatus: 'UNVERIFIED',
      reason: 'Initial vendor registration completed. Awaiting identity document intake.',
    });

    logger.info(
      { vendorId: vendor.id, status: vendor.status },
      'Vendor successfully registered'
    );

    return NextResponse.json(
      {
        id: vendor.id,
        legalName: vendor.legalName,
        gstNumber: vendor.gstNumber,
        panMasked: maskPan(panNumber),
        status: vendor.status,
        createdAt: vendor.createdAt.toISOString(),
        updatedAt: vendor.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error({ err }, 'Error during vendor registration');
    return NextResponse.json(
      { error: 'Internal server error processing vendor registration', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
