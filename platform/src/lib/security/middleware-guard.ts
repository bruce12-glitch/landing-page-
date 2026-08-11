// =============================================================================
// VendorChain Platform — OWASP Layer-7 Security & Rate Limiting (Phase 5)
// =============================================================================
// Provides:
//   1. Sliding-window rate limiter protecting sensitive API routes
//      (/api/vendors, /api/verify). Burst thresholds + per-window caps.
//   2. Correlation-ID / request-ID tracking propagated via headers
//      (x-correlation-id, x-request-id) for enterprise traceability.
// Fully deterministic, side-effect free, and edge-safe (no node:crypto) so it
// can run inside Next.js middleware as well as plain Node tests.
// =============================================================================

export interface RateLimitResult {
  allowed: boolean;
  status: 429 | 200;
  limit: number;
  remaining: number;
  retryAfterMs: number;
}

interface WindowEntry {
  timestamps: number[]; // sliding window of request times (ms)
}

const STORE = new Map<string, WindowEntry>();

export interface RateLimitPolicy {
  /** Route key this policy guards (e.g. 'vendors'). */
  route: string;
  /** Max requests allowed in the window. */
  max: number;
  /** Window length in ms. */
  windowMs: number;
  /** Optional burst allowance beyond `max` before hard-stop. */
  burst?: number;
}

export const DEFAULT_POLICY: RateLimitPolicy = {
  route: 'default',
  max: 60,
  windowMs: 60_000,
  burst: 0,
};

// Protective policies for sensitive routes. Burst allows a small spike then a
// hard 429 once the burst budget is exhausted within the window.
export const ROUTE_POLICIES: Record<string, RateLimitPolicy> = {
  vendors: { route: 'vendors', max: 30, windowMs: 60_000, burst: 10 },
  verify: { route: 'verify', max: 20, windowMs: 60_000, burst: 5 },
  transactions: { route: 'transactions', max: 40, windowMs: 60_000, burst: 10 },
};

/** Identify the guarded route from a URL path. */
export function routeKeyForPath(pathname: string): string {
  if (pathname.includes('/api/verify') || pathname.includes('/verify')) return 'verify';
  if (pathname.includes('/transactions')) return 'transactions';
  if (pathname.startsWith('/api/vendors')) return 'vendors';
  return 'default';
}

/** Edge-safe unique id — uses global crypto.randomUUID when available. */
function makeId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) {
    return `cid-${g.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Sliding-window rate limit check. Returns whether the request is allowed and
 * how long to wait (in ms) before retrying.
 */
export function checkSlidingWindowRateLimit(
  key: string,
  policy: RateLimitPolicy = DEFAULT_POLICY
): RateLimitResult {
  const now = Date.now();
  const entry = STORE.get(key);
  const burstBudget = policy.burst ?? 0;
  const effectiveMax = policy.max + burstBudget;

  // No prior entry → allow.
  if (!entry || entry.timestamps.length === 0) {
    STORE.set(key, { timestamps: [now] });
    return {
      allowed: true,
      status: 200,
      limit: effectiveMax,
      remaining: effectiveMax - 1,
      retryAfterMs: 0,
    };
  }

  // Prune timestamps outside the window (sliding).
  const cutoff = now - policy.windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  // Hard cap: once we've exceeded the effective max, block until window rolls.
  if (entry.timestamps.length >= effectiveMax) {
    const oldest = entry.timestamps[0] ?? now;
    return {
      allowed: false,
      status: 429,
      limit: effectiveMax,
      remaining: 0,
      retryAfterMs: Math.max(1, cutoff + policy.windowMs - oldest),
    };
  }

  entry.timestamps.push(now);
  STORE.set(key, entry);
  return {
    allowed: true,
    status: 200,
    limit: effectiveMax,
    remaining: effectiveMax - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

/** Return a 429 response body/status helper. */
export function rateLimitedResponse(retryAfterMs: number): { status: 429; body: unknown } {
  return {
    status: 429,
    body: {
      error: 'Too many requests. Please slow down.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfterMs,
    },
  };
}

export interface CorrelationResult {
  correlationId: string;
  requestId: string;
}

/**
 * Extract or generate correlation + request IDs. When present on the inbound
 * request they are preserved (propagated); otherwise new ones are minted.
 */
export function resolveCorrelationIds(
  headers: Headers,
  existingCorrelationId?: string
): CorrelationResult {
  const correlationId =
    existingCorrelationId ?? headers.get('x-correlation-id') ?? makeId();
  const requestId = headers.get('x-request-id') ?? makeId();
  return { correlationId, requestId };
}

export function makeCorrelationId(): string {
  return makeId();
}

/** Reset the in-memory rate-limit store (for tests). */
export function resetRateLimitStore(): void {
  STORE.clear();
}
