import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { evaluateTrust, type TrustEvaluationInput } from '../lib/trust-scoring/calculator';
import { POST as registerVendor } from '../app/api/vendors/route';
import { GET as getTrustScore } from '../app/api/vendors/[id]/trust-score/route';
import { POST as evaluateTrustScore } from '../app/api/vendors/[id]/trust-score/evaluate/route';
import { db } from '../lib/db/client';

const ADMIN_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';
const TEST_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const PRISTINE: TrustEvaluationInput = {
  vendorStatus: 'VERIFIED',
  verifiedDocumentsCount: 3,
  supplyChainVerdict: 'PASS',
  supplyChainRiskScore: 0,
  isCosignSigned: true,
  anomalyPenalties: 0,
  daysSinceLastAudit: 0,
};

describe('Continuous Behavioral Trust Scoring Engine (Module 3, Slice 1)', () => {
  beforeEach(async () => {
    await db.reset();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.KEK_MASTER_KEY = TEST_KEK;
  });

  // --- Test 1: Pristine vendor scores TIER_1_CRITICAL (>= 85) ---
  it('Pristine VERIFIED vendor with clean signed SBOM scores >= 85 → TIER_1_CRITICAL', () => {
    const result = evaluateTrust(PRISTINE);
    expect(result.compositeScore).toBeGreaterThanOrEqual(85);
    expect(result.tier).toBe('TIER_1_CRITICAL');
    expect(result.breakdown.identityScore).toBe(100);
    expect(result.breakdown.supplyChainScore).toBe(100);
    expect(result.breakdown.behaviorScore).toBe(100);
    expect(result.breakdown.penalties).toBe(0);
  });

  // --- Test 2: Cliff drop — BLOCK supply chain fails closed to TIER_4 ---
  it('Valid docs + BLOCK supply chain fails-closed to TIER_4_SUSPENDED (score <= 30)', () => {
    const result = evaluateTrust({
      vendorStatus: 'VERIFIED',
      verifiedDocumentsCount: 3,
      supplyChainVerdict: 'BLOCK',
      supplyChainRiskScore: 95,
      isCosignSigned: true,
      anomalyPenalties: 0,
      daysSinceLastAudit: 0,
    });
    expect(result.tier).toBe('TIER_4_SUSPENDED');
    expect(result.compositeScore).toBeLessThanOrEqual(30);
    expect(result.breakdown.supplyChainScore).toBe(0);
    expect(result.factors.some((f) => f.includes('HARD OVERRIDE'))).toBe(true);
  });

  // --- Test 3: Unsigned artifact caps supply chain score at 40 ---
  it('Unsigned artifact caps supply chain score at 40', () => {
    const result = evaluateTrust({
      vendorStatus: 'VERIFIED',
      verifiedDocumentsCount: 3,
      supplyChainVerdict: 'PASS',
      supplyChainRiskScore: 0,
      isCosignSigned: false,
      anomalyPenalties: 0,
      daysSinceLastAudit: 0,
    });
    expect(result.breakdown.supplyChainScore).toBe(40);
  });

  // --- Test 4: Document age decay reduces identity points over time ---
  it('Document age decay reduces identity points over time (−5 per 180 days)', () => {
    const result = evaluateTrust({
      ...PRISTINE,
      daysSinceLastAudit: 365, // 2 decay steps
    });
    expect(result.breakdown.identityScore).toBe(100 - 10);
  });

  // --- Test 5: E2E evaluation API persists snapshot + VerificationEvent ---
  it('E2E POST /evaluate persists a snapshot and appends an actor-stamped event', async () => {
    const regRes = await registerVendor(
      new NextRequest('http://localhost/api/vendors', {
        method: 'POST',
        body: JSON.stringify({
          legalName: 'Meridian Logistics Pvt Ltd',
          gstNumber: '27ABCDE1234F1Z5',
          panNumber: 'ABCDE1234F',
        }),
        headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      })
    );
    expect(regRes.status).toBe(201);
    const vendor = await regRes.json();

    const evalRes = await evaluateTrustScore(
      new NextRequest(`http://localhost/api/vendors/${vendor.id}/trust-score/evaluate`, {
        method: 'POST',
        body: JSON.stringify({
          supplyChainVerdict: 'BLOCK',
          supplyChainRiskScore: 95,
          isCosignSigned: false,
          anomalyPenalties: 10,
        }),
        headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      }),
      { params: { id: vendor.id } }
    );
    expect(evalRes.status).toBe(200);
    const body = await evalRes.json();
    expect(body.snapshotId).toBeDefined();
    expect(body.compositeScore).toBeLessThanOrEqual(30);
    expect(body.tier).toBe('TIER_4_SUSPENDED');
    expect(body.actor).toBe('admin:default');
    expect(Array.isArray(body.remediation)).toBe(true);

    // Snapshot persisted in store
    const snapshots = await db.findTrustSnapshotsByVendorId(vendor.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.tier).toBe('TIER_4_SUSPENDED');

    // Actor-stamped VerificationEvent appended
    const events = await db.findEventsByVendorId(vendor.id);
    const evalEvent = events.find((e) => e.reason.includes('TRUST_SCORE_EVALUATED'));
    expect(evalEvent).toBeDefined();
    expect(evalEvent?.actor).toBe('admin:default');
    expect(evalEvent?.reason).toContain('TIER_4_SUSPENDED');
  });

  // --- Test 6: FLAGGED vendor hard-overrides to TIER_4 regardless of clean input ---
  it('FLAGGED vendor status hard-overrides to TIER_4_SUSPENDED', () => {
    const result = evaluateTrust({
      ...PRISTINE,
      vendorStatus: 'FLAGGED',
    });
    expect(result.tier).toBe('TIER_4_SUSPENDED');
    expect(result.compositeScore).toBeLessThanOrEqual(30);
    expect(result.breakdown.identityScore).toBe(0);
  });

  // --- Test 7: BLOCKED vendor status hard-overrides to TIER_4 ---
  it('BLOCKED vendor status hard-overrides to TIER_4_SUSPENDED', () => {
    const result = evaluateTrust({ ...PRISTINE, vendorStatus: 'BLOCKED' });
    expect(result.tier).toBe('TIER_4_SUSPENDED');
    expect(result.compositeScore).toBeLessThanOrEqual(30);
  });

  // --- Test 8: WARN + elevated risk lands in TIER_2/3, not hard-overridden ---
  it('WARN verdict with elevated risk is not hard-overridden', () => {
    const result = evaluateTrust({
      ...PRISTINE,
      supplyChainVerdict: 'WARN',
      supplyChainRiskScore: 50,
    });
    expect(result.tier).not.toBe('TIER_4_SUSPENDED');
    expect(result.breakdown.supplyChainScore).toBe(50);
  });

  // --- Test 9: Tier boundary mapping ---
  it('Maps composite scores to TIER_2_STANDARD within the 65-84 band', () => {
    const r = evaluateTrust({ ...PRISTINE, supplyChainRiskScore: 40 }); // S=60
    expect(r.breakdown.supplyChainScore).toBe(60);
    expect(r.compositeScore).toBe(Math.round(0.35 * 100 + 0.45 * 60 + 0.2 * 100));
    expect(r.compositeScore).toBeGreaterThanOrEqual(65);
    expect(r.compositeScore).toBeLessThanOrEqual(84);
    expect(r.tier).toBe('TIER_2_STANDARD');
  });

  // --- Test 10: E2E GET returns latest snapshot + 30-day trend ---
  it('E2E GET /trust-score returns latest snapshot and trend', async () => {
    const regRes = await registerVendor(
      new NextRequest('http://localhost/api/vendors', {
        method: 'POST',
        body: JSON.stringify({
          legalName: 'Vertex Pharma',
          gstNumber: '27ABCDE1234F1Z5',
          panNumber: 'ABCDE1234F',
        }),
        headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      })
    );
    const vendor = await regRes.json();

    await evaluateTrustScore(
      new NextRequest(`http://localhost/api/vendors/${vendor.id}/trust-score/evaluate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      }),
      { params: { id: vendor.id } }
    );

    const getRes = await getTrustScore(
      new NextRequest(`http://localhost/api/vendors/${vendor.id}/trust-score`, {
        headers: { 'x-admin-key': ADMIN_KEY },
      }),
      { params: { id: vendor.id } }
    );
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.vendorId).toBe(vendor.id);
    expect(body.latestSnapshot).not.toBeNull();
    expect(body.latestSnapshot.compositeScore).toBeGreaterThanOrEqual(0);
    expect(body.latestSnapshot.compositeScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(body.trendThirtyDays)).toBe(true);
    expect(body.trendThirtyDays).toHaveLength(1);
    expect(Array.isArray(body.tierDefinitions)).toBe(true);
    expect(body.tierDefinitions.length).toBe(4);
  });

  // --- Test 11: GET returns 401 without admin key ---
  it('GET /trust-score rejects unauthenticated requests with 401', async () => {
    const res = await getTrustScore(
      new NextRequest('http://localhost/api/vendors/nonexistent/trust-score'),
      { params: { id: 'nonexistent' } }
    );
    expect(res.status).toBe(401);
  });

  // --- Test 12: GET returns 404 for unknown vendor (authenticated) ---
  it('GET /trust-score returns 404 for unknown vendor', async () => {
    const res = await getTrustScore(
      new NextRequest('http://localhost/api/vendors/nope/trust-score', {
        headers: { 'x-admin-key': ADMIN_KEY },
      }),
      { params: { id: 'nope' } }
    );
    expect(res.status).toBe(404);
  });
});
