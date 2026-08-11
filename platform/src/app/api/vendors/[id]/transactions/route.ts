import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { computeTransactionStateHash } from '@/lib/ledger/hasher';
import { anchorStateCommitment } from '@/lib/ledger/polygon-anchor';
import { recordL2Commitment } from '@/lib/telemetry/metrics';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateTransactionSchema = z.object({
  invoiceRef: z.string().min(1).max(64),
  amountCents: z.number().int().min(1).max(100_000_000_000), // up to $1B
  currency: z.enum(['USD', 'EUR', 'INR', 'GBP', 'SGD']),
});

export async function POST(
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

  const auth = authenticateRequest(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid x-admin-key header', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }
  const actor = auth.actor || 'admin:default';

  try {
    const vendor = await db.findVendorById(params.id);
    if (!vendor) {
      return NextResponse.json(
        { error: `Vendor with ID '${params.id}' not found`, code: 'VENDOR_NOT_FOUND' },
        { status: 404 }
      );
    }

    let payload: z.infer<typeof CreateTransactionSchema>;
    try {
      const raw = await req.text();
      payload = CreateTransactionSchema.parse(JSON.parse(raw));
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_REQUEST_BODY', details: err },
        { status: 400 }
      );
    }

    // --- REPLAY PROTECTION: duplicate invoiceRef → 409 Conflict ---
    const existing = await db.findTransactionByInvoiceRef(vendor.id, payload.invoiceRef);
    if (existing) {
      return NextResponse.json(
        {
          error: `Transaction with invoiceRef '${payload.invoiceRef}' already recorded for this vendor`,
          code: 'DUPLICATE_TRANSACTION',
          existingId: existing.id,
        },
        { status: 409 }
      );
    }

    // --- Deterministic SHA-256 state commitment (commercial confidentiality) ---
    const commitment = computeTransactionStateHash({
      vendorId: vendor.id,
      invoiceRef: payload.invoiceRef,
      amountCents: payload.amountCents,
      currency: payload.currency,
    });
    const { stateHash, nonce, timestamp } = commitment;

    // --- Anchor commitment to the Polygon L2 ledger ---
    const receipt = await anchorStateCommitment(stateHash, vendor.id);

    // --- Persist the transaction as COMMITTED_L2 ---
    const tx = await db.createVendorTransaction({
      vendorId: vendor.id,
      invoiceRef: payload.invoiceRef,
      amountCents: payload.amountCents,
      currency: payload.currency,
      stateHash,
      nonce,
      anchorTimestamp: timestamp,
      l2TxHash: receipt.l2TxHash,
      l2BlockNumber: receipt.l2BlockNumber,
      status: 'COMMITTED_L2',
    });

    // --- Telemetry: L2 commitment counter ---
    recordL2Commitment(payload.currency);

    // --- Append an immutable, actor-stamped audit event ---
    await db.createVerificationEvent({
      vendorId: vendor.id,
      actor,
      fromStatus: vendor.status,
      toStatus: vendor.status,
      reason: `TRANSACTION_RECORDED tx=${tx.id} invoiceRef=${payload.invoiceRef} stateHash=${stateHash.slice(0, 16)}… status=COMMITTED_L2`,
    });

    return NextResponse.json(
      {
        id: tx.id,
        vendorId: vendor.id,
        invoiceRef: tx.invoiceRef,
        amountCents: tx.amountCents,
        currency: tx.currency,
        status: tx.status,
        stateHash: tx.stateHash,
        nonce: tx.nonce,
        anchorTimestamp: tx.anchorTimestamp,
        l2: {
          txHash: receipt.l2TxHash,
          blockNumber: receipt.l2BlockNumber,
          anchoredAt: receipt.anchoredAt,
        },
        note: 'COMMERCIAL CONFIDENTIALITY: only the SHA-256 commitment is anchored — amount & terms are never written on-chain.',
        createdAt: tx.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id }, 'Error recording transaction');
    return NextResponse.json(
      { error: 'Internal server error recording transaction', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/vendors/:id/transactions — paginated history with state hashes + L2 receipts
// ---------------------------------------------------------------------------
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

  if (!authenticateRequest(req).authorized) {
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

    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

    const txs = await db.findTransactionsByVendorId(vendor.id, limit, offset);
    const all = await db.findTransactionsByVendorId(vendor.id, 100000, 0);

    return NextResponse.json(
      {
        vendorId: vendor.id,
        pagination: { limit, offset, total: all.length },
        transactions: txs.map((t) => ({
          id: t.id,
          invoiceRef: t.invoiceRef,
          amountCents: t.amountCents,
          currency: t.currency,
          status: t.status,
          stateHash: t.stateHash,
          l2TxHash: t.l2TxHash,
          l2BlockNumber: t.l2BlockNumber,
          disputeReason: t.disputeReason,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id }, 'Error listing transactions');
    return NextResponse.json(
      { error: 'Internal server error listing transactions', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
