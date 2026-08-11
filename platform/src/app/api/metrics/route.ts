import { NextRequest } from 'next/server';
import { metrics } from '@/lib/telemetry/metrics';

export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

/**
 * GET /api/metrics
 * Exposes the Prometheus text exposition format (text/plain; version=0.0.4).
 * Intentionally public (no auth) so that a Prometheus scraper can pull it,
 * mirroring the `/health` endpoint which is also unauthenticated.
 */
export async function GET(_req: NextRequest) {
  const body = metrics.render();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
