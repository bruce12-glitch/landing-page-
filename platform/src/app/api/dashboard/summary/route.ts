import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';
import { computeDashboardSummary } from '@/lib/dashboard/summary';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    );
  }

  if (!authenticateRequest(req).authorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid x-admin-key header', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  try {
    const summary = await computeDashboardSummary();
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    logger.error({ err }, 'Error computing dashboard summary');
    return NextResponse.json(
      { error: 'Internal server error computing dashboard summary', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
