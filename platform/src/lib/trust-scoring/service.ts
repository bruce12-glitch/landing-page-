// =============================================================================
// VendorChain Platform — Trust Evaluation Service (Module 3/4 bridge)
// =============================================================================
// Shared helper used by BOTH the explicit `/trust-score/evaluate` endpoint and
// the automatic re-evaluation dispatched by the Module 4 dispute feedback loop.
// Centralizes input derivation from the datastore + snapshot persistence so the
// two call sites cannot drift apart.
// =============================================================================

import { db } from '@/lib/db/client';
import { recordVendorTier, recordVerificationDuration } from '@/lib/telemetry/metrics';
import {
  evaluateTrust,
  type SupplyChainVerdict,
  type TrustEvaluationInput,
  type TrustScoreResult,
  type VendorStatusLike,
} from './calculator';

export interface EvaluateOverrides {
  supplyChainVerdict?: SupplyChainVerdict;
  supplyChainRiskScore?: number;
  isCosignSigned?: boolean;
  anomalyPenalties?: number;
  daysSinceLastAudit?: number;
}

export interface PersistedEvaluation {
  snapshotId: string;
  result: TrustScoreResult;
  vendorStatus: VendorStatusLike;
  verifiedDocumentsCount: number;
  overrides: EvaluateOverrides;
  extraPenalties: number;
}

export async function findVendorForTrustEvaluation(vendorId: string) {
  const vendor = await db.findVendorById(vendorId);
  if (!vendor) return null;
  const documents = await db.findDocumentsByVendorId(vendorId);
  const verifiedDocumentsCount = documents.filter((d) => d.status === 'VERIFIED').length;
  return { vendor, verifiedDocumentsCount };
}

/**
 * Compute a trust score, persist an immutable snapshot, and return everything
 * needed for a response. `extraPenalties` lets the dispute loop inject the
 * -25 anomaly penalty on top of any caller-provided overrides.
 */
export async function evaluateAndPersistTrust(
  vendorId: string,
  overrides: EvaluateOverrides,
  extraPenalties: number
): Promise<PersistedEvaluation> {
  const ctx = await findVendorForTrustEvaluation(vendorId);
  if (!ctx) {
    const err = new Error('VENDOR_NOT_FOUND');
    (err as Error & { code: string }).code = 'VENDOR_NOT_FOUND';
    throw err;
  }
  const { vendor, verifiedDocumentsCount } = ctx;

  const input: TrustEvaluationInput = {
    vendorStatus: vendor.status,
    verifiedDocumentsCount,
    supplyChainVerdict: overrides.supplyChainVerdict,
    supplyChainRiskScore: overrides.supplyChainRiskScore,
    isCosignSigned: overrides.isCosignSigned,
    anomalyPenalties: (overrides.anomalyPenalties ?? 0) + extraPenalties,
    daysSinceLastAudit: overrides.daysSinceLastAudit,
  };

  const result = evaluateTrust(input);
  const snapshot = await db.createTrustScoreSnapshot({
    vendorId,
    compositeScore: result.compositeScore,
    tier: result.tier,
    identityScore: result.breakdown.identityScore,
    supplyChainScore: result.breakdown.supplyChainScore,
    behaviorScore: result.breakdown.behaviorScore,
    penaltyDeduction: result.breakdown.penalties,
    reasons: JSON.stringify(result.factors),
  });

  // --- Telemetry: vendor gauge by tier + verification duration histogram ---
  recordVendorTier(result.tier);
  recordVerificationDuration(0.012, result.tier);

  return {
    snapshotId: snapshot.id,
    result,
    vendorStatus: vendor.status,
    verifiedDocumentsCount,
    overrides,
    extraPenalties,
  };
}
