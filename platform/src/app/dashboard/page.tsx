// Procurement Command Center — high-density zero-trust dashboard.
// Server component: reads live summary + vendor index from the datastore.
import Link from 'next/link';
import { computeDashboardSummary } from '@/lib/dashboard/summary';
import { TIER_THEMES } from '@/lib/dashboard/tier-theme';
import { db } from '@/lib/db/client';
import VerificationStatusBadge from '../components/VerificationStatusBadge';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Procurement Command Center — VendorChain' };

export default async function DashboardPage() {
  const summary = await computeDashboardSummary();
  const vendors = await db.findAllVendors();

  const vendorRows = await Promise.all(
    vendors.map(async (v) => ({
      vendor: v,
      snapshot: await db.findLatestTrustSnapshotByVendorId(v.id),
    }))
  );

  const tierOrder = ['TIER_1_CRITICAL', 'TIER_2_STANDARD', 'TIER_3_RESTRICTED', 'TIER_4_SUSPENDED'] as const;

  return (
    <div className="cp-shell">
      <header className="cp-topbar">
        <div className="cp-brand">
          <span className="mark">V</span>
          <div>
            <div>VendorChain</div>
            <div className="sub">Zero-Trust Control Plane</div>
          </div>
        </div>
        <nav>
          <Link href="/dashboard" className="active">Dashboard</Link>
          <Link href="/onboarding">Onboarding</Link>
          <Link href="/api/health">Health</Link>
        </nav>
      </header>

      <h1 className="cp-h1">Procurement Command Center</h1>
      <p className="cp-sub">Continuous trust posture across the vendor network · L2-anchored state commitments</p>

      <div className="cp-grid cols-4">
        <div className="cp-card">
          <h4>Total Vendors</h4>
          <div className="metric">{summary.totalVendors}</div>
        </div>
        <div className="cp-card">
          <h4>Verification Rate</h4>
          <div className="metric">{summary.verificationRate}<small>%</small></div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{summary.verifiedVendors} verified</div>
        </div>
        <div className="cp-card">
          <h4>Active Disputes</h4>
          <div className="metric" style={{ color: summary.activeDisputes ? 'var(--crimson)' : 'inherit' }}>{summary.activeDisputes}</div>
        </div>
        <div className="cp-card">
          <h4>L2 Commitments</h4>
          <div className="metric" style={{ color: 'var(--cyan)' }}>{summary.l2StateCommitments}</div>
        </div>
      </div>

      <h2 className="cp-h2">Trust Tier Distribution</h2>
      <div className="cp-grid cols-4">
        {tierOrder.map((tier) => {
          const theme = TIER_THEMES[tier];
          const count = summary.tierDistribution[tier];
          return (
            <div className="cp-card" key={tier}>
              <h4 style={{ color: theme.color }}>{theme.label}</h4>
              <div className="metric" style={{ color: theme.color }}>{count}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{tier.replace('TIER_', 'Tier ')}</div>
            </div>
          );
        })}
      </div>

      <h2 className="cp-h2">Anomaly Alert Panel</h2>
      {summary.anomalyAlerts.length === 0 ? (
        <div className="cp-card" style={{ color: 'var(--muted)', fontSize: 13 }}>
          No anomalies — all vendors operating within trust policy.
        </div>
      ) : (
        summary.anomalyAlerts.map((a) => (
          <div className="cp-alert" key={a.vendorId}>
            <span className="dot" style={{ background: TIER_THEMES[a.tier].color }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>
                <Link href={`/vendors/${a.vendorId}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{a.legalName}</Link>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{a.reason}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="metric" style={{ color: TIER_THEMES[a.tier].color, fontSize: 22 }}>{a.compositeScore}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.tier.replace('TIER_', '')}</div>
            </div>
          </div>
        ))
      )}

      <h2 className="cp-h2">Vendor Index</h2>
      {vendors.length === 0 ? (
        <div className="cp-card" style={{ color: 'var(--muted)', fontSize: 13 }}>
          No vendors onboarded yet. <Link href="/onboarding" style={{ color: 'var(--cyan)' }}>Start onboarding →</Link>
        </div>
      ) : (
        <div className="cp-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>GST</th>
                <th>Status</th>
                <th>Trust Score</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {vendorRows.map(({ vendor: v, snapshot: snap }) => {
                const theme = snap ? TIER_THEMES[snap.tier] : null;
                return (
                  <tr key={v.id}>
                    <td><Link href={`/vendors/${v.id}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>{v.legalName}</Link></td>
                    <td className="cp-mono">{v.gstNumber}</td>
                    <td><VerificationStatusBadge status={v.status} /></td>
                    <td className="cp-mono" style={{ color: theme?.color ?? 'var(--muted)' }}>{snap ? snap.compositeScore : '—'}</td>
                    <td className="cp-mono" style={{ color: theme?.color ?? 'var(--muted)' }}>{snap ? snap.tier.replace('TIER_', '') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
