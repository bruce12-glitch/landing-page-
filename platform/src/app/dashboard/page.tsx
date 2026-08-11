import Link from 'next/link';
import { computeDashboardSummary } from '@/lib/dashboard/summary';
import { db } from '@/lib/db/client';
import TierDistributionBar from '../components/TierDistributionBar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Procurement Command Center — VendorChain' };

export default async function DashboardPage() {
  const summary = await computeDashboardSummary();
  const rows = await Promise.all((await db.findAllVendors()).map(async (vendor) => {
    const snapshot = await db.findLatestTrustSnapshotByVendorId(vendor.id);
    return { id: vendor.id, legalName: vendor.legalName, gstin: vendor.gstNumber, identity: vendor.status, supply: snapshot?.supplyChainScore === 100 ? 'PASS' : snapshot ? 'REVIEW' : 'PENDING', score: snapshot?.compositeScore ?? 0, tier: snapshot?.tier ?? 'TIER_4_SUSPENDED' };
  }));
  return <main className="cp-shell"><header className="cp-topbar"><div className="cp-brand"><span className="mark">V</span><div>VendorChain<div className="sub">Procurement Command Center</div></div></div><nav><Link className="active" href="/dashboard">Dashboard</Link><Link href="/onboarding">Onboarding</Link></nav></header><h1 className="cp-h1">Procurement Command Center</h1><p className="cp-sub">Live zero-trust posture, anomaly triage, and Polygon L2 commitment telemetry.</p><TierDistributionBar summary={summary} vendors={rows} /></main>;
}
