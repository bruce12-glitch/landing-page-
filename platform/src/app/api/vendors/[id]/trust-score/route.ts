import { NextRequest, NextResponse } from 'next/server';
import { validateAdminKey } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { TIER_DEFINITIONS } from '@/lib/trust-scoring/calculator';

export const dynamic = 'force-dynamic';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function safeParseReasons(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

    const snapshots = await db.findTrustSnapshotsByVendorId(params.id);
    const latest = snapshots.length ? snapshots[0] : null;

    const now = Date.now();
    const trend = snapshots
      .filter((s) => now - s.calculatedAt.getTime() <= THIRTY_DAYS_MS)
      .sort((a, b) => a.calculatedAt.getTime() - b.calculatedAt.getTime())
      .map((s) => ({
        id: s.id,
        compositeScore: s.compositeScore,
        tier: s.tier,
        calculatedAt: s.calculatedAt.toISOString(),
      }));

    return NextResponse.json(
      {
        vendorId: vendor.id,
        legalName: vendor.legalName,
        vendorStatus: vendor.status,
        latestSnapshot: latest
          ? {
              id: latest.id,
              compositeScore: latest.compositeScore,
              tier: latest.tier,
              identityScore: latest.identityScore,
              supplyChainScore: latest.supplyChainScore,
              behaviorScore: latest.behaviorScore,
              penaltyDeduction: latest.penaltyDeduction,
              reasons: safeParseReasons(latest.reasons),
              calculatedAt: latest.calculatedAt.toISOString(),
            }
          : null,
        trendThirtyDays: trend,
        tierDefinitions: Object.entries(TIER_DEFINITIONS).map(([key, def]) => ({
          tier: key,
          ...def,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id }, 'Error retrieving trust score snapshot');
    return NextResponse.json(
      { error: 'Internal server error retrieving trust score', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
