import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import {
  evaluateTrust,
  remediationFor,
  type SupplyChainVerdict,
} from '@/lib/trust-scoring/calculator';

export const dynamic = 'force-dynamic';

// Optional runtime overrides so callers can reflect the latest live telemetry
// (SBOM scan, cosign status, anomaly feed). Everything else is derived from DB.
interface EvaluateBody {
  supplyChainVerdict?: SupplyChainVerdict;
  supplyChainRiskScore?: number;
  isCosignSigned?: boolean;
  anomalyPenalties?: number;
  daysSinceLastAudit?: number;
}

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

    // --- Derive trusted inputs from the datastore ---
    const documents = await db.findDocumentsByVendorId(params.id);
    const verifiedDocumentsCount = documents.filter((d) => d.status === 'VERIFIED').length;

    // Optional body overrides (default to clean / unknown-safe).
    let body: EvaluateBody = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw) as EvaluateBody;
    } catch {
      body = {};
    }

    const input = {
      vendorStatus: vendor.status,
      verifiedDocumentsCount,
      supplyChainVerdict: body.supplyChainVerdict,
      supplyChainRiskScore: body.supplyChainRiskScore,
      isCosignSigned: body.isCosignSigned,
      anomalyPenalties: body.anomalyPenalties,
      daysSinceLastAudit: body.daysSinceLastAudit,
    };

    // --- Compute + persist the immutable snapshot ---
    const result = evaluateTrust(input);
    const snapshot = await db.createTrustScoreSnapshot({
      vendorId: vendor.id,
      compositeScore: result.compositeScore,
      tier: result.tier,
      identityScore: result.breakdown.identityScore,
      supplyChainScore: result.breakdown.supplyChainScore,
      behaviorScore: result.breakdown.behaviorScore,
      penaltyDeduction: result.breakdown.penalties,
      reasons: JSON.stringify(result.factors),
    });

    // --- Append an immutable, actor-stamped audit event ---
    await db.createVerificationEvent({
      vendorId: vendor.id,
      actor,
      fromStatus: vendor.status,
      toStatus: vendor.status,
      reason: `TRUST_SCORE_EVALUATED composite=${result.compositeScore} tier=${result.tier}`,
    });

    const remediation = remediationFor(input, result);

    return NextResponse.json(
      {
        vendorId: vendor.id,
        snapshotId: snapshot.id,
        compositeScore: result.compositeScore,
        tier: result.tier,
        breakdown: result.breakdown,
        factors: result.factors,
        remediation,
        actor,
        calculatedAt: snapshot.calculatedAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error({ err, vendorId: params.id }, 'Error evaluating trust score');
    return NextResponse.json(
      { error: 'Internal server error evaluating trust score', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
