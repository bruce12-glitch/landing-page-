import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { evaluateAndPersistTrust } from '@/lib/trust-scoring/service';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// The Dispute Feedback Loop: an unresolved dispute penalizes the vendor by
// 25 trust points, closing the loop between Module 4 (transactions) and
// Module 3 (continuous trust scoring).
const DISPUTE_TRUST_PENALTY = 25;

const DisputeSchema = z.object({
  disputeReason: z.string().min(1).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; txId: string } }
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

    const tx = await db.findTransactionById(params.txId);
    if (!tx || tx.vendorId !== vendor.id) {
      return NextResponse.json(
        { error: `Transaction with ID '${params.txId}' not found for this vendor`, code: 'TRANSACTION_NOT_FOUND' },
        { status: 404 }
      );
    }

    let disputeReason: string;
    try {
      const raw = await req.text();
      disputeReason = DisputeSchema.parse(JSON.parse(raw)).disputeReason;
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body — disputeReason (string) is required', code: 'INVALID_REQUEST_BODY' },
        { status: 400 }
      );
    }

    // --- Capture pre-dispute trust state for the feedback-loop response ---
    const beforeSnapshot = await db.findLatestTrustSnapshotByVendorId(vendor.id);
    const beforeScore = beforeSnapshot?.compositeScore ?? null;

    // --- Mark the transaction DISPUTED ---
    const disputed = await db.updateTransactionStatus(tx.id, 'DISPUTED', disputeReason);
    if (!disputed) {
      return NextResponse.json(
        { error: 'Failed to update transaction', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    }

    // --- DISPUTE FEEDBACK LOOP: automatic trust re-evaluation (-25 penalty) ---
    const evaluation = await evaluateAndPersistTrust(vendor.id, {}, DISPUTE_TRUST_PENALTY);

    // --- Append an immutable, actor-stamped audit event ---
    await db.createVerificationEvent({
      vendorId: vendor.id,
      actor,
      fromStatus: vendor.status,
      toStatus: vendor.status,
      reason: `TRANSACTION_DISPUTED tx=${tx.id} invoiceRef=${tx.invoiceRef} trustPenalty=${DISPUTE_TRUST_PENALTY} newComposite=${evaluation.result.compositeScore}`,
    });

    return NextResponse.json(
      {
        transaction: {
          id: disputed.id,
          invoiceRef: disputed.invoiceRef,
          status: disputed.status,
          disputeReason: disputed.disputeReason,
          stateHash: disputed.stateHash,
          updatedAt: disputed.updatedAt.toISOString(),
        },
        trustFeedback: {
          penaltyApplied: DISPUTE_TRUST_PENALTY,
          beforeScore,
          afterScore: evaluation.result.compositeScore,
          tier: evaluation.result.tier,
          snapshotId: evaluation.snapshotId,
        },
        actor,
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id, txId: params.txId }, 'Error flagging transaction dispute');
    return NextResponse.json(
      { error: 'Internal server error flagging transaction dispute', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
