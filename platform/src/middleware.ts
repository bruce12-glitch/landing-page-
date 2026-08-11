// =============================================================================
// VendorChain Platform — Next.js Middleware (OWASP Layer-7)
// =============================================================================
// Runs on every request (edge runtime): injects correlation tracking headers
// (x-correlation-id, x-request-id) and applies sliding-window rate limiting to
// sensitive API routes (/api/vendors, /verify, /transactions). Returns 429 with
// a Retry-After header when a burst threshold is exceeded.
// =============================================================================
import { NextResponse, type NextRequest } from 'next/server';
import {
  checkSlidingWindowRateLimit,
  ROUTE_POLICIES,
  routeKeyForPath,
  resolveCorrelationIds,
} from '@/lib/security/middleware-guard';

export const config = {
  // Protect the sensitive API surface; skip static assets & the metrics feed.
  matcher: ['/api/vendors/:path*', '/api/verify/:path*'],
};

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // --- Correlation tracking (x-correlation-id, x-request-id) ---
  const ids = resolveCorrelationIds(req.headers);
  const responseHeaders = {
    'x-correlation-id': ids.correlationId,
    'x-request-id': ids.requestId,
  };

  // --- Rate limiting with the sliding-window guard ---
  const route = routeKeyForPath(pathname);
  const policy = ROUTE_POLICIES[route] ?? ROUTE_POLICIES.vendors;
  const clientKey = (req.headers.get('x-forwarded-for') || 'local') + ':' + route;

  const result = checkSlidingWindowRateLimit(clientKey, policy);
  if (!result.allowed) {
    return new NextResponse(
      JSON.stringify({
        error: 'Too many requests. Please slow down.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterMs: result.retryAfterMs,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
          ...responseHeaders,
        },
      }
    );
  }

  const res = NextResponse.next();
  for (const [key, value] of Object.entries(responseHeaders)) {
    res.headers.set(key, value);
  }
  res.headers.set('X-RateLimit-Limit', String(result.limit));
  res.headers.set('X-RateLimit-Remaining', String(result.remaining));
  return res;
}
