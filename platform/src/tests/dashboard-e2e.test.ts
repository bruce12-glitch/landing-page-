import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { POST as registerVendor } from '../app/api/vendors/route';
import { POST as uploadDoc } from '../app/api/vendors/[id]/documents/route';
import { POST as triggerVerify } from '../app/api/vendors/[id]/documents/[docId]/verify/route';
import { POST as evaluateTrustScore } from '../app/api/vendors/[id]/trust-score/evaluate/route';
import { POST as createTransaction } from '../app/api/vendors/[id]/transactions/route';
import { POST as flagDispute } from '../app/api/vendors/[id]/transactions/[txId]/dispute/route';
import { computeDashboardSummary } from '../lib/dashboard/summary';
import { computeGstChecksumChar } from '../lib/verification/gst-checksum';
import { db } from '../lib/db/client';
import { verificationQueue } from '../lib/queue/verification-queue';
import TrustGauge from '../app/components/TrustGauge';
import VerificationStatusBadge from '../app/components/VerificationStatusBadge';
import SbomViewer from '../app/components/SbomViewer';

const ADMIN_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';
const TEST_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeGst(pan: string, state = '27', entity = '1'): string {
  const prefix = `${state}${pan}${entity}Z`;
  return prefix + computeGstChecksumChar(prefix);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function authReq(url: string, init: any = {}) {
  return new NextRequest(url, {
    ...init,
    headers: { 'x-admin-key': ADMIN_KEY, ...(init.headers as Record<string, string> | undefined) },
  });
}

async function uploadAndVerify(vendorId: string, gst: string, pan: string) {
  const docs = [
    { type: 'GST_CERT', content: `Government of India GST Certificate ${gst} ${pan} valid` },
    { type: 'PAN_CARD', content: `Income Tax PAN Card ${pan} valid` },
    { type: 'BANK_PROOF', content: `Certified Bank Proof Statement valid` },
  ];
  for (const d of docs) {
    const form = new FormData();
    form.append('type', d.type);
    form.append('file', new Blob([Buffer.from(`%PDF-1.5 ${d.content}`)], { type: 'application/pdf' }), `${d.type.toLowerCase()}.pdf`);
    const upRes = await uploadDoc(authReq(`http://localhost/api/vendors/${vendorId}/documents`, { method: 'POST', body: form }), { params: { id: vendorId } });
    expect(upRes.status).toBe(201);
    const doc = await upRes.json();
    const vRes = await triggerVerify(authReq(`http://localhost/api/vendors/${vendorId}/documents/${doc.id}/verify`, { method: 'POST' }), { params: { id: vendorId, docId: doc.id } });
    expect(vRes.status).toBe(202);
    await new Promise((r) => setTimeout(r, 420));
  }
}

describe('Control Plane Dashboard & Components (Phase 4)', () => {
  beforeEach(async () => {
    await db.reset();
    verificationQueue.reset();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.KEK_MASTER_KEY = TEST_KEK;
    process.env.STORAGE_DIR = './storage/dash_e2e_docs';
    process.env.VERIFICATION_ADAPTER = 'sandbox';
  });

  // --- Test 1: Full-stack E2E — register → 3 docs → VERIFIED → Tier 1 on dashboard ---
  it('Full-stack workflow: register, verify 3 docs, then dashboard shows Tier 1 score', async () => {
    const pan = 'ABCDE1234F';
    const gst = makeGst(pan);

    const regRes = await registerVendor(
      authReq('http://localhost/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName: 'Prime Machining Pvt Ltd', gstNumber: gst, panNumber: pan }),
      })
    );
    expect(regRes.status).toBe(201);
    const vendor = await regRes.json();

    await uploadAndVerify(vendor.id, gst, pan);

    const finalVendor = await db.findVendorById(vendor.id);
    expect(finalVendor?.status).toBe('VERIFIED');

    // Evaluate clean supply chain -> TIER_1
    const evalRes = await evaluateTrustScore(
      authReq(`http://localhost/api/vendors/${vendor.id}/trust-score/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplyChainVerdict: 'PASS', supplyChainRiskScore: 0, isCosignSigned: true }),
      }),
      { params: { id: vendor.id } }
    );
    const evalJson = await evalRes.json();
    expect(evalJson.compositeScore).toBeGreaterThanOrEqual(85);
    expect(evalJson.tier).toBe('TIER_1_CRITICAL');

    // Dashboard summary reflects the Tier 1 vendor
    const summary = await computeDashboardSummary();
    expect(summary.totalVendors).toBe(1);
    expect(summary.verificationRate).toBe(100);
    expect(summary.tierDistribution.TIER_1_CRITICAL).toBe(1);
    expect(summary.anomalyAlerts).toHaveLength(0);
  });

  // --- Test 2: Dispute E2E — badge transitions + trust gauge drops + summary ---
  it('Dispute E2E: raise dispute, dashboard shows DISPUTED + trust drop', async () => {
    const pan = 'ABCDE1234F';
    const gst = makeGst(pan);
    const regRes = await registerVendor(
      authReq('http://localhost/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName: 'Dispute Holdings', gstNumber: gst, panNumber: pan }),
      })
    );
    const vendor = await regRes.json();

    // Baseline trust snapshot
    await evaluateTrustScore(
      authReq(`http://localhost/api/vendors/${vendor.id}/trust-score/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: { id: vendor.id } }
    );

    // Create transaction + raise dispute
    const txRes = await createTransaction(
      authReq(`http://localhost/api/vendors/${vendor.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceRef: 'INV-2026-777', amountCents: 99000, currency: 'USD' }),
      }),
      { params: { id: vendor.id } }
    );
    const tx = await txRes.json();

    const disputeRes = await flagDispute(
      authReq(`http://localhost/api/vendors/${vendor.id}/transactions/${tx.id}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disputeReason: 'Deliverables not met' }),
      }),
      { params: { id: vendor.id, txId: tx.id } }
    );
    const after = await disputeRes.json();

    expect(after.transaction.status).toBe('DISPUTED');
    expect(after.trustFeedback.afterScore).toBeLessThan(after.trustFeedback.beforeScore);

    // Summary flags active dispute + anomaly (dispute dropped the vendor into
    // the suspended tier — score below the 40-point TIER_4 boundary).
    const summary = await computeDashboardSummary();
    expect(summary.activeDisputes).toBe(1);
    expect(summary.anomalyAlerts.length).toBeGreaterThanOrEqual(1);
    expect(summary.anomalyAlerts[0]?.compositeScore).toBe(35);
    expect(summary.anomalyAlerts[0]?.tier).toBe('TIER_4_SUSPENDED');
  });

  // --- Test 3: TrustGauge renders correct tier color (emerald high, crimson low) ---
  it('TrustGauge renders emerald for high score and crimson for low', () => {
    const high = renderToStaticMarkup(React.createElement(TrustGauge, { score: 92 }));
    expect(high).toContain('#34D399'); // emerald
    expect(high).toContain('TIER_1_CRITICAL');

    const low = renderToStaticMarkup(React.createElement(TrustGauge, { score: 20 }));
    expect(low).toContain('#F87171'); // crimson
    expect(low).toContain('TIER_4_SUSPENDED');
  });

  // --- Test 4: VerificationStatusBadge maps states to labels/colors ---
  it('VerificationStatusBadge maps states to distinct labels and colors', () => {
    const verified = renderToStaticMarkup(React.createElement(VerificationStatusBadge, { status: 'VERIFIED' }));
    expect(verified).toContain('Verified');
    expect(verified).toContain('#34D399');

    const disputed = renderToStaticMarkup(React.createElement(VerificationStatusBadge, { status: 'DISPUTED' }));
    expect(disputed).toContain('Disputed');
    expect(disputed).toContain('#F87171');

    const flagged = renderToStaticMarkup(React.createElement(VerificationStatusBadge, { status: 'FLAGGED' }));
    expect(flagged).toContain('Flagged');
    expect(flagged).toContain('#FBBF24');
  });

  // --- Test 5: SbomViewer renders packages with CVSS severity tags ---
  it('SbomViewer renders CycloneDX packages with severity tags', () => {
    const html = renderToStaticMarkup(
      React.createElement(SbomViewer, {
        title: 'CycloneDX SBOM',
        components: [
          { name: 'xz', version: '5.6.1', purl: 'pkg:generic/xz@5.6.1', severity: 'CRITICAL', cvssScore: 10.0 },
          { name: 'express', version: '4.19.2', severity: 'LOW', cvssScore: 2.3 },
        ],
      })
    );
    expect(html).toContain('CycloneDX SBOM');
    expect(html).toContain('xz');
    expect(html).toContain('CRITICAL');
    expect(html).toContain('10.0');
    expect(html).toContain('express');
  });

  // --- Test 6: Dashboard summary aggregates across vendors/tiers ---
  it('Dashboard summary aggregates totalVendors, rate and tier distribution', async () => {
    const empty = await computeDashboardSummary();
    expect(empty.totalVendors).toBe(0);
    expect(empty.verificationRate).toBe(0);

    // Register two vendors
    for (const [name, pan] of [['Alpha Ltd', 'ALPHA1234F'], ['Beta Ltd', 'BETAC1234F']] as const) {
      await registerVendor(
        authReq('http://localhost/api/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ legalName: name, gstNumber: makeGst(pan), panNumber: pan }),
        })
      );
    }
    const summary = await computeDashboardSummary();
    expect(summary.totalVendors).toBe(2);
    // No trust snapshots yet -> tier distribution stays empty
    expect(Object.values(summary.tierDistribution).every((c) => c === 0)).toBe(true);
  });
});
