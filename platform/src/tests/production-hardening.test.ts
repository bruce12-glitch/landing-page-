import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as metricsHandler } from '../app/api/metrics/route';
import { metrics, recordVendorTier, recordL2Commitment, recordDispute, recordVerificationDuration } from '../lib/telemetry/metrics';
import {
  checkSlidingWindowRateLimit,
  resolveCorrelationIds,
  makeCorrelationId,
  resetRateLimitStore,
  type RateLimitPolicy,
} from '../lib/security/middleware-guard';
import nextConfig from '../../next.config.mjs';

describe('Production Hardening: Observability, Security & Rate Limiting (Phase 5)', () => {
  beforeEach(() => {
    metrics.reset();
    resetRateLimitStore();
  });

  // --- Test 1: Prometheus /api/metrics valid text exposition ---
  it('GET /api/metrics emits valid Prometheus text format with correct gauge/counter values', async () => {
    recordVendorTier('TIER_1_CRITICAL');
    recordVendorTier('TIER_2_STANDARD');
    recordL2Commitment('USD');
    recordL2Commitment('INR');
    recordDispute('USD');
    recordVerificationDuration(0.12, 'TIER_1_CRITICAL');

    const res = await metricsHandler(new NextRequest('http://localhost/api/metrics'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain; version=0.0.4');

    const body = await res.text();
    // TYPE + gauge lines
    expect(body).toContain('# TYPE vendorchain_vendors_total gauge');
    expect(body).toMatch(/vendorchain_vendors_total\{tier="TIER_1_CRITICAL"\} 1/);
    expect(body).toMatch(/vendorchain_vendors_total\{tier="TIER_2_STANDARD"\} 1/);
    // counters
    expect(body).toContain('# TYPE vendorchain_l2_commitments_total counter');
    expect(body).toMatch(/vendorchain_l2_commitments_total\{currency="USD"\} 1/);
    expect(body).toMatch(/vendorchain_l2_commitments_total\{currency="INR"\} 1/);
    expect(body).toMatch(/vendorchain_disputes_total\{currency="USD"\} 1/);
    // histogram family + count/sum
    expect(body).toContain('# TYPE vendorchain_verification_duration_seconds histogram');
    expect(body).toContain('vendorchain_verification_duration_seconds_count{tier="TIER_1_CRITICAL"} 1');
    expect(body).toContain('vendorchain_verification_duration_seconds_sum{tier="TIER_1_CRITICAL"}');
  });

  // --- Test 2: Rate limiter triggers 429 on burst threshold exceed ---
  it('Sliding-window rate limiter returns 429 when burst threshold is exceeded', () => {
    const policy: RateLimitPolicy = { route: 'vendors', max: 3, windowMs: 60_000, burst: 1 };
    // effective max = 3 + 1 = 4
    expect(checkSlidingWindowRateLimit('ip-a', policy).allowed).toBe(true); // 1
    expect(checkSlidingWindowRateLimit('ip-a', policy).allowed).toBe(true); // 2
    expect(checkSlidingWindowRateLimit('ip-a', policy).allowed).toBe(true); // 3
    expect(checkSlidingWindowRateLimit('ip-a', policy).allowed).toBe(true); // 4 (burst)
    const fifth = checkSlidingWindowRateLimit('ip-a', policy);
    expect(fifth.allowed).toBe(false);
    expect(fifth.status).toBe(429);
    expect(fifth.retryAfterMs).toBeGreaterThan(0);
  });

  // --- Test 3: Correlation ID generated and propagated across headers ---
  it('Generates and propagates a correlation ID across request headers', () => {
    const req = new NextRequest('http://localhost/api/vendors', { headers: { 'x-forwarded-for': '9.9.9.9' } });
    const ids = resolveCorrelationIds(req.headers);
    expect(ids.correlationId).toBeTruthy();
    expect(ids.correlationId.startsWith('cid-')).toBe(true);
    expect(ids.requestId).toBeTruthy();

    // Propagation: an inbound x-correlation-id is preserved (not overwritten).
    const inbound = 'cid-inbound-1234';
    const req2 = new NextRequest('http://localhost/api/vendors', {
      headers: { 'x-correlation-id': inbound },
    });
    const ids2 = resolveCorrelationIds(req2.headers);
    expect(ids2.correlationId).toBe(inbound);

    // Unique per call.
    expect(makeCorrelationId()).not.toBe(makeCorrelationId());
  });

  // --- Test 4: Enterprise security headers are configured for all responses ---
  it('next.config.mjs configures enterprise/OWASP security headers on all routes', () => {
    const headerCfg = (nextConfig as any).headers;
    expect(typeof headerCfg).toBe('function');

    // The headers() function returns a config array; resolve it statically by
    // invoking as a plain async function with no args.
    const configs = (headerCfg as () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>)();
    return configs.then((configs) => {
      expect(configs.length).toBeGreaterThanOrEqual(1);
      const first = configs[0]!;
      expect(first.source).toBe('/:path*');
      const keys = first.headers.map((h) => h.key.toLowerCase());
      expect(keys).toContain('strict-transport-security');
      expect(keys).toContain('x-content-type-options');
      expect(keys).toContain('x-frame-options');
      expect(keys).toContain('referrer-policy');
      expect(keys).toContain('permissions-policy');
      expect(keys).toContain('x-xss-protection');
    });
  });

  // --- Test 5: Security headers carry hardened values ---
  it('Security header values are hardened (HSTS, X-Frame DENY, COEP)', async () => {
    const headerCfg = (nextConfig as any).headers as () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
    const configs = await headerCfg();
    const map = new Map(configs[0]!.headers.map((h) => [h.key.toLowerCase(), h.value]));

    expect(map.get('strict-transport-security')).toContain('max-age=63072000');
    expect(map.get('strict-transport-security')).toContain('includeSubDomains');
    expect(map.get('x-frame-options')).toBe('DENY');
    expect(map.get('x-content-type-options')).toBe('nosniff');
    expect(map.get('cross-origin-embedder-policy')).toBe('require-corp');
  });

  // --- Test 6: Rate limiter allows requests under the cap and tracks remaining ---
  it('Rate limiter allows requests under the cap and reports remaining budget', () => {
    const policy: RateLimitPolicy = { route: 'verify', max: 5, windowMs: 60_000, burst: 0 };
    const first = checkSlidingWindowRateLimit('ip-b', policy);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(4);
    const second = checkSlidingWindowRateLimit('ip-b', policy);
    expect(second.remaining).toBe(3);
  });
});
