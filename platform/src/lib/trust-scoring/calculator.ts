// =============================================================================
// VendorChain Platform — Continuous Behavioral Trust Scoring Engine (Module 3)
// =============================================================================
// THE LAW OF ASYMMETRIC TRUST (Cliff Drop & Probation Curve):
//   Static onboarding is a dangerous illusion. Trust is computed live from three
//   pillars and collapses IMMEDIATELY to the SUSPENDED tier when a critical
//   threat appears (forged docs, FLAGGED/BLOCKED state, or a BLOCKed supply
//   chain) — while recovery must climb back gradually over time.
//
// WEIGHTS:
//   Identity & Document Integrity     35%  (I)
//   Software Supply Chain Posture     45%  (S)
//   Behavioral Anomalies & SLA         20%  (B)
//
// COMPOSITE:
//   C = clamp(0.35·I + 0.45·S + 0.20·B − Penalties, 0, 100)
//   Penalties = accumulated anomaly deductions (asymmetric-trust hammer).
// =============================================================================

export type VendorStatusLike =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'VERIFIED'
  | 'FAILED'
  | 'FLAGGED'
  | 'BLOCKED';

export type SupplyChainVerdict = 'PASS' | 'WARN' | 'BLOCK';
export type TrustTier = 'TIER_1_CRITICAL' | 'TIER_2_STANDARD' | 'TIER_3_RESTRICTED' | 'TIER_4_SUSPENDED';

export interface TrustEvaluationInput {
  vendorStatus: VendorStatusLike;
  verifiedDocumentsCount: number; // 0 to 3
  supplyChainVerdict?: SupplyChainVerdict;
  supplyChainRiskScore?: number; // 0 to 100
  isCosignSigned?: boolean;
  anomalyPenalties?: number;
  daysSinceLastAudit?: number;
}

export interface TrustScoreResult {
  compositeScore: number; // 0 to 100
  tier: TrustTier;
  breakdown: {
    identityScore: number;
    supplyChainScore: number;
    behaviorScore: number;
    penalties: number;
  };
  factors: string[];
  calculatedAt: string;
}

const DAYS_PER_DECAY_STEP = 180;
const DECAY_POINTS_PER_STEP = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tierForScore(score: number): TrustTier {
  if (score >= 85) return 'TIER_1_CRITICAL';
  if (score >= 65) return 'TIER_2_STANDARD';
  if (score >= 40) return 'TIER_3_RESTRICTED';
  return 'TIER_4_SUSPENDED';
}

/**
 * Compute the continuous trust score for a vendor from the three pillars.
 * Fully deterministic and side-effect free (no I/O) so it is trivially testable.
 */
export function evaluateTrust(input: TrustEvaluationInput): TrustScoreResult {
  const factors: string[] = [];

  // --- Identity & Document Integrity (35%) ---
  const docCount = clamp(input.verifiedDocumentsCount, 0, 3);
  let identityScore: number;
  if (docCount >= 3) identityScore = 100;
  else if (docCount === 2) identityScore = 60;
  else if (docCount === 1) identityScore = 30;
  else identityScore = 0;
  factors.push(`${docCount}/3 identity documents verified`);

  // Forged / failed identity is a hard zero.
  if (input.vendorStatus === 'FLAGGED' || input.vendorStatus === 'FAILED' || input.vendorStatus === 'BLOCKED') {
    identityScore = 0;
    factors.push('Identity compromised — FLAGGED/FAILED/BLOCKED state');
  }

  // Document age decay: −5 pts per 180 days without an audit.
  const days = input.daysSinceLastAudit ?? 0;
  const decaySteps = Math.floor(Math.max(0, days) / DAYS_PER_DECAY_STEP);
  const decay = decaySteps * DECAY_POINTS_PER_STEP;
  if (decay > 0) {
    identityScore = clamp(identityScore - decay, 0, 100);
    factors.push(`Identity aged ${decaySteps}×${DAYS_PER_DECAY_STEP}d (−${decay} pts)`);
  }

  // --- Software Supply Chain Posture (45%) ---
  const riskScore = clamp(input.supplyChainRiskScore ?? 0, 0, 100);
  let supplyChainScore = 100 - riskScore;

  const isSigned = input.isCosignSigned ?? true;
  if (!isSigned) {
    supplyChainScore = Math.min(supplyChainScore, 40);
    factors.push('Artifact NOT cosign-signed — supply chain capped at 40');
  }

  const supplyVerdict = input.supplyChainVerdict ?? 'PASS';
  if (supplyVerdict === 'BLOCK') {
    supplyChainScore = 0;
    factors.push('Supply chain verdict BLOCK — score zeroed');
  }
  supplyChainScore = clamp(supplyChainScore, 0, 100);
  factors.push(`Supply chain risk ${riskScore}/100, verdict ${supplyVerdict}, ${isSigned ? 'signed' : 'unsigned'}`);

  // --- Behavioral Anomalies & SLA (20%) ---
  const anomalyPenalties = input.anomalyPenalties ?? 0;
  const behaviorScore = clamp(100 - anomalyPenalties, 0, 100);
  if (anomalyPenalties > 0) {
    factors.push(`Behavioral anomalies: ${anomalyPenalties} penalty pts`);
  } else {
    factors.push('No behavioral anomalies');
  }

  // --- Composite with asymmetric-trust penalty hammer ---
  const penalties = anomalyPenalties;
  let compositeScore = Math.round(
    0.35 * identityScore + 0.45 * supplyChainScore + 0.2 * behaviorScore - penalties
  );
  compositeScore = clamp(compositeScore, 0, 100);

  // --- HARD OVERRIDE (Law of Asymmetric Trust — Cliff Drop) ---
  const hardFail =
    input.vendorStatus === 'FLAGGED' ||
    input.vendorStatus === 'BLOCKED' ||
    supplyVerdict === 'BLOCK';

  let tier: TrustTier = tierForScore(compositeScore);
  if (hardFail) {
    compositeScore = clamp(compositeScore, 0, 30);
    tier = 'TIER_4_SUSPENDED';
    factors.push('HARD OVERRIDE — TIER_4_SUSPENDED (critical threat present)');
  }

  return {
    compositeScore,
    tier,
    breakdown: {
      identityScore,
      supplyChainScore,
      behaviorScore,
      penalties,
    },
    factors,
    calculatedAt: new Date().toISOString(),
  };
}

// --- Tier definitions & remediation guidance (consumed by the GET endpoint) ---
export const TIER_DEFINITIONS: Record<TrustTier, { label: string; range: string; description: string }> = {
  TIER_1_CRITICAL: {
    label: 'Pristine Compliance',
    range: '85–100',
    description: 'Fully signed, zero CVEs, all documents verified. Highest trust.',
  },
  TIER_2_STANDARD: {
    label: 'Verified',
    range: '65–84',
    description: 'Verified with minor non-critical warnings.',
  },
  TIER_3_RESTRICTED: {
    label: 'Elevated Risk',
    range: '40–64',
    description: 'Probationary or partial documents; elevated risk.',
  },
  TIER_4_SUSPENDED: {
    label: 'Suspended',
    range: '0–39',
    description: 'Critical CVE, document forgery, FLAGGED/BLOCKED.',
  },
};

export function remediationFor(input: TrustEvaluationInput, result: TrustScoreResult): string[] {
  const advice: string[] = [];
  if (result.breakdown.identityScore < 100) {
    advice.push('Complete all 3 identity documents (GST, PAN, bank proof) and re-audit.');
  }
  if (!(input.isCosignSigned ?? true) || input.supplyChainVerdict === 'BLOCK') {
    advice.push('Sign every SBOM with Cosign and clear all CRITICAL/HIGH CVEs before release.');
  }
  if ((input.anomalyPenalties ?? 0) > 0) {
    advice.push('Resolve behavioral/SLA anomalies and re-establish consistent audit cadence.');
  }
  if ((input.daysSinceLastAudit ?? 0) > 0) {
    advice.push('Schedule a fresh audit to stop identity-age decay.');
  }
  if (advice.length === 0) {
    advice.push('Maintain current posture: re-verify regularly to prevent age decay.');
  }
  return advice;
}
