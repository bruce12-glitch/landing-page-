import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  computeTransactionStateHash,
  verifyTransactionStateHash,
} from '../lib/ledger/hasher';
import { derivePolygonL2Receipt } from '../lib/ledger/polygon-anchor';
import { computeGstChecksumChar } from '../lib/verification/gst-checksum';
import { POST as registerVendor } from '../app/api/vendors/route';
import { POST as createTransaction, GET as listTransactions } from '../app/api/vendors/[id]/transactions/route';
import { POST as flagDispute } from '../app/api/vendors/[id]/transactions/[txId]/dispute/route';
import { POST as evaluateTrustScore } from '../app/api/vendors/[id]/trust-score/evaluate/route';
import { db } from '../lib/db/client';

const ADMIN_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';
const TEST_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const FIXED_NONCE = 'aabbccddeeff00112233445566778899';
const FIXED_TS = '2026-08-11T00:00:00.000Z';

// Build a valid GSTIN from a PAN (5 letters, 4 digits, 1 letter) by computing
// the official mod-36 checksum character so registration passes Zod + checksum.
function makeGst(pan: string, state = '27', entity = '1'): string {
  const prefix = `${state}${pan}${entity}Z`; // 14 chars
  return prefix + computeGstChecksumChar(prefix);
}

async function registerVendorHelper(legalName: string, pan: string) {
  const gst = makeGst(pan);
  const res = await registerVendor(
    new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify({ legalName, gstNumber: gst, panNumber: pan }),
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    })
  );
  if (res.status !== 201) {
    throw new Error(`registerVendorHelper failed with ${res.status}: ${JSON.stringify(await res.json())}`);
  }
  return (await res.json()) as { id: string };
}

function txPost(url: string, body: object) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
  });
}

describe('Transaction Management & Immutable Ledger Anchor (Module 4, Slice 1)', () => {
  beforeEach(async () => {
    await db.reset();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.KEK_MASTER_KEY = TEST_KEK;
  });

  // --- Test 1: Deterministic hash — 1-cent variance completely alters hash ---
  it('A 1-cent variance completely alters the deterministic state hash', () => {
    const base = { vendorId: 'v1', invoiceRef: 'INV-2026-001', currency: 'USD', nonce: FIXED_NONCE, timestamp: FIXED_TS };
    const h1 = computeTransactionStateHash({ ...base, amountCents: 100 });
    const h2 = computeTransactionStateHash({ ...base, amountCents: 101 });
    expect(h1.stateHash).not.toBe(h2.stateHash);
    // Deterministic: identical inputs produce identical hash.
    const h1again = computeTransactionStateHash({ ...base, amountCents: 100 });
    expect(h1again.stateHash).toBe(h1.stateHash);
    // Verifiable.
    expect(verifyTransactionStateHash({ ...base, amountCents: 100, expectedHash: h1.stateHash })).toBe(true);
    expect(verifyTransactionStateHash({ ...base, amountCents: 101, expectedHash: h1.stateHash })).toBe(false);
  });

  // --- Test 2: Ingestion & L2 anchoring returns COMMITTED_L2 with receipt ---
  it('Ingestion anchors to L2 and returns COMMITTED_L2 with receipt', async () => {
    const vendor = await registerVendorHelper('Anchor Corp', 'ABCDE1234F');
    const res = await createTransaction(
      txPost(`http://localhost/api/vendors/${vendor.id}/transactions`, {
        invoiceRef: 'INV-2026-104',
        amountCents: 1250000,
        currency: 'USD',
      }),
      { params: { id: vendor.id } }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('COMMITTED_L2');
    expect(body.invoiceRef).toBe('INV-2026-104');
    expect(body.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.l2.txHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(body.l2.blockNumber).toBeGreaterThan(0);

    // Persisted in store
    const stored = await db.findTransactionByInvoiceRef(vendor.id, 'INV-2026-104');
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('COMMITTED_L2');
    expect(stored?.stateHash).toBe(body.stateHash);
  });

  // --- Test 3: Dispute flow marks DISPUTED and logs VerificationEvent ---
  it('Dispute marks transaction DISPUTED and logs a VerificationEvent', async () => {
    const vendor = await registerVendorHelper('Dispute Co', 'DSPUT1234F');
    const created = await createTransaction(
      txPost(`http://localhost/api/vendors/${vendor.id}/transactions`, {
        invoiceRef: 'INV-2026-200',
        amountCents: 50000,
        currency: 'EUR',
      }),
      { params: { id: vendor.id } }
    );
    const tx = await created.json();

    const res = await flagDispute(
      txPost(`http://localhost/api/vendors/${vendor.id}/transactions/${tx.id}/dispute`, {
        disputeReason: 'Milestone deliverables not met',
      }),
      { params: { id: vendor.id, txId: tx.id } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transaction.status).toBe('DISPUTED');
    expect(body.transaction.disputeReason).toBe('Milestone deliverables not met');

    // VerificationEvent appended with actor stamp
    const events = await db.findEventsByVendorId(vendor.id);
    const disputeEvent = events.find((e) => e.reason.includes('TRANSACTION_DISPUTED'));
    expect(disputeEvent).toBeDefined();
    expect(disputeEvent?.actor).toBe('admin:default');
    expect(disputeEvent?.reason).toContain('INV-2026-200');
  });

  // --- Test 4: E2E — Disputed transaction triggers Module 3 score drop ---
  it('Dispute feedback loop drops the Module 3 trust score by 25 points', async () => {
    const vendor = await registerVendorHelper('Feedback Ltd', 'FDBCK1234F');

    // Baseline trust snapshot (pristine, 0 verified docs → composite 65)
    const evalRes = await evaluateTrustScore(
      txPost(`http://localhost/api/vendors/${vendor.id}/trust-score/evaluate`, {}),
      { params: { id: vendor.id } }
    );
    const before = await evalRes.json();
    expect(before.compositeScore).toBe(65);

    // Create + dispute a transaction
    const created = await createTransaction(
      txPost(`http://localhost/api/vendors/${vendor.id}/transactions`, {
        invoiceRef: 'INV-2026-300',
        amountCents: 99000,
        currency: 'INR',
      }),
      { params: { id: vendor.id } }
    );
    const tx = await created.json();

    const disputeRes = await flagDispute(
      txPost(`http://localhost/api/vendors/${vendor.id}/transactions/${tx.id}/dispute`, {
        disputeReason: 'Charged but never delivered',
      }),
      { params: { id: vendor.id, txId: tx.id } }
    );
    expect(disputeRes.status).toBe(200);
    const after = await disputeRes.json();

    expect(after.trustFeedback.penaltyApplied).toBe(25);
    expect(after.trustFeedback.beforeScore).toBe(65);
    // Per the exact composite formula, the -25 penalty is applied BOTH inside
    // the behavior pillar (100-25=75) AND as the explicit `- Penalties` term:
    //   C = 0.35·0 + 0.45·100 + 0.20·75 − 25 = 35
    expect(after.trustFeedback.afterScore).toBe(35);
    expect(after.trustFeedback.afterScore).toBeLessThan(after.trustFeedback.beforeScore);

    // A new snapshot was persisted with the penalty reflected
    const snapshots = await db.findTrustSnapshotsByVendorId(vendor.id);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.penaltyDeduction).toBe(25);
  });

  // --- Test 5: Replay protection — duplicate invoiceRef returns 409 ---
  it('Duplicate invoiceRef returns 409 Conflict (replay protection)', async () => {
    const vendor = await registerVendorHelper('Replay Co', 'REPLY1234F');
    const payload = { invoiceRef: 'INV-2026-404', amountCents: 77700, currency: 'USD' };
    const first = await createTransaction(
      txPost(`http://localhost/api/vendors/${vendor.id}/transactions`, payload),
      { params: { id: vendor.id } }
    );
    expect(first.status).toBe(201);

    const second = await createTransaction(
      txPost(`http://localhost/api/vendors/${vendor.id}/transactions`, payload),
      { params: { id: vendor.id } }
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.code).toBe('DUPLICATE_TRANSACTION');
  });

  // --- Test 6: GET returns paginated history with state hashes + L2 receipts ---
  it('GET lists paginated transaction history with state hashes and L2 receipts', async () => {
    const vendor = await registerVendorHelper('Hist Co', 'HISTO1234F');
    for (let i = 1; i <= 3; i++) {
      await createTransaction(
        txPost(`http://localhost/api/vendors/${vendor.id}/transactions`, {
          invoiceRef: `INV-2026-${900 + i}`,
          amountCents: 1000 * i,
          currency: 'USD',
        }),
        { params: { id: vendor.id } }
      );
    }
    const res = await listTransactions(
      new NextRequest(`http://localhost/api/vendors/${vendor.id}/transactions?limit=2`, {
        headers: { 'x-admin-key': ADMIN_KEY },
      }),
      { params: { id: vendor.id } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.total).toBe(3);
    expect(body.pagination.limit).toBe(2);
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0]?.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.transactions[0]?.l2TxHash).toMatch(/^0x/);
  });

  // --- Test 7: Unauthenticated transaction requests rejected with 401 ---
  it('Rejects unauthenticated transaction creation with 401', async () => {
    const res = await createTransaction(
      new NextRequest('http://localhost/api/vendors/x/transactions', { method: 'POST' }),
      { params: { id: 'x' } }
    );
    expect(res.status).toBe(401);
  });

  // --- Test 8: Invalid currency / body returns 400 ---
  it('Rejects invalid body (bad currency) with 400', async () => {
    const vendor = await registerVendorHelper('Bad Cur', 'BADCU1234F');
    const res = await createTransaction(
      txPost(`http://localhost/api/vendors/${vendor.id}/transactions`, {
        invoiceRef: 'INV-2026-500',
        amountCents: 100,
        currency: 'BITCOIN',
      }),
      { params: { id: vendor.id } }
    );
    expect(res.status).toBe(400);
  });

  // --- Test 9: Unknown vendor transaction returns 404 ---
  it('Returns 404 for transaction on an unknown vendor', async () => {
    const res = await createTransaction(
      txPost('http://localhost/api/vendors/unknown/transactions', {
        invoiceRef: 'INV-1',
        amountCents: 1,
        currency: 'USD',
      }),
      { params: { id: 'unknown' } }
    );
    expect(res.status).toBe(404);
  });

  // --- Test 10: Dispute on unknown transaction returns 404 ---
  it('Returns 404 when disputing a transaction that does not exist', async () => {
    const vendor = await registerVendorHelper('NoTx Co', 'NOTXC1234F');
    const res = await flagDispute(
      txPost(`http://localhost/api/vendors/${vendor.id}/transactions/nope/dispute`, {
        disputeReason: 'n/a',
      }),
      { params: { id: vendor.id, txId: 'nope' } }
    );
    expect(res.status).toBe(404);
  });

  // --- Test 11: Polygon anchor receipt is deterministic per stateHash ---
  it('Polygon L2 receipt is deterministic for the same stateHash', () => {
    const hash = 'deadbeef'.repeat(8); // 64 hex
    const r1 = derivePolygonL2Receipt(hash);
    const r2 = derivePolygonL2Receipt(hash);
    expect(r1.l2TxHash).toBe(r2.l2TxHash);
    expect(r1.l2BlockNumber).toBe(r2.l2BlockNumber);
    expect(r1.l2TxHash).toMatch(/^0x[a-f0-9]{64}$/);
  });
});
