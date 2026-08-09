import { NextRequest, NextResponse } from 'next/server';
import { validateAdminKey } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { decryptPan, maskPan } from '@/lib/crypto/pan-encryption';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const KEK_MASTER_KEY =
  process.env.KEK_MASTER_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
    logger.warn({ ip, vendorId: params.id }, 'Unauthorized vendor lookup attempt');
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

    // Decrypt PAN only to produce the masked string (NEVER expose plaintext)
    let masked = '**********';
    try {
      const plaintextPan = decryptPan(vendor.panEncrypted, KEK_MASTER_KEY);
      masked = maskPan(plaintextPan);
    } catch {
      masked = '**********';
    }

    return NextResponse.json(
      {
        id: vendor.id,
        legalName: vendor.legalName,
        gstNumber: vendor.gstNumber,
        panMasked: masked,
        status: vendor.status,
        createdAt: vendor.createdAt.toISOString(),
        updatedAt: vendor.updatedAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id }, 'Error retrieving vendor profile');
    return NextResponse.json(
      { error: 'Internal server error retrieving vendor', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
