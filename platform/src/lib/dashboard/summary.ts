// =============================================================================
// VendorChain — Dashboard Summary Aggregator (Phase 4 Control Plane)
// Aggregates live metrics from the datastore for the Procurement Command Center.
// =============================================================================
import { db, type TrustTier } from '@/lib/db/client';
import { tierForScore } from './tier-theme';

export interface AnomalyAlert {
  vendorId: string;
  legalName: string;
  compositeScore: number;
  tier: TrustTier;
  reason: string;
}

export interface DashboardSummary {
  generatedAt: string;
  totalVendors: number;
  verifiedVendors: number;
  verificationRate: number; // 0-100
  activeDisputes: number;
  l2StateCommitments: number;
  tierDistribution: Record<TrustTier, number>;
  anomalyAlerts: AnomalyAlert[];
}

const EMPTY_DISTRIBUTION: Record<TrustTier, number> = {
  TIER_1_CRITICAL: 0,
  TIER_2_STANDARD: 0,
  TIER_3_RESTRICTED: 0,
  TIER_4_SUSPENDED: 0,
};

export async function computeDashboardSummary(): Promise<DashboardSummary> {
  const vendors = await db.findAllVendors();
  const transactions = await db.findAllTransactions();

  const totalVendors = vendors.length;
  const verifiedVendors = vendors.filter((v) => v.status === 'VERIFIED').length;
  const verificationRate = totalVendors ? Math.round((verifiedVendors / totalVendors) * 100) : 0;

  const activeDisputes = transactions.filter((t) => t.status === 'DISPUTED').length;
  // L2 State Commitments = transactions that have been anchored (not merely RECORDED).
  const l2StateCommitments = transactions.filter((t) => t.status !== 'RECORDED').length;

  const tierDistribution = { ...EMPTY_DISTRIBUTION };
  const anomalyAlerts: AnomalyAlert[] = [];

  for (const vendor of vendors) {
    const latest = await db.findLatestTrustSnapshotByVendorId(vendor.id);
    if (!latest) continue;
    tierDistribution[latest.tier] += 1;

    // Anomaly: restricted/suspended tier, or a cliff drop (score <= 30).
    if (latest.tier === 'TIER_3_RESTRICTED' || latest.tier === 'TIER_4_SUSPENDED') {
      anomalyAlerts.push({
        vendorId: vendor.id,
        legalName: vendor.legalName,
        compositeScore: latest.compositeScore,
        tier: latest.tier,
        reason:
          latest.tier === 'TIER_4_SUSPENDED'
            ? 'Cliff drop — critical threat (FLAGGED/BLOCKED or BLOCK verdict)'
            : 'Elevated risk — probationary standing',
      });
    } else if (latest.compositeScore <= 30) {
      anomalyAlerts.push({
        vendorId: vendor.id,
        legalName: vendor.legalName,
        compositeScore: latest.compositeScore,
        tier: latest.tier,
        reason: 'Sudden trust cliff drop',
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalVendors,
    verifiedVendors,
    verificationRate,
    activeDisputes,
    l2StateCommitments,
    tierDistribution,
    anomalyAlerts,
  };
}

export function summarizeTier(score: number): { tier: TrustTier; count: number } {
  return { tier: tierForScore(score), count: 1 };
}
