// Vendor Profile & Cryptographic Vault — server component.
import Link from 'next/link';
import { db } from '@/lib/db/client';
import TrustGauge from '../../components/TrustGauge';
import VerificationStatusBadge from '../../components/VerificationStatusBadge';
import L2TransactionCard from '../../components/L2TransactionCard';
import RaiseDisputeButton from '../../components/RaiseDisputeButton';
import SbomViewer from '../../components/SbomViewer';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Vendor Cryptographic Vault — VendorChain' };

interface PageProps {
  params: { id: string };
}

export default async function VendorProfilePage({ params }: PageProps) {
  const vendor = await db.findVendorById(params.id);
  if (!vendor) {
    return (
      <div className="cp-shell">
        <h1 className="cp-h1">Vendor Not Found</h1>
        <p className="cp-sub">Vendor <span className="cp-mono">{params.id}</span> does not exist.</p>
        <Link href="/dashboard" style={{ color: 'var(--cyan)' }}>← Back to Dashboard</Link>
      </div>
    );
  }

  const [snapshot, documents, transactions, events] = await Promise.all([
    db.findLatestTrustSnapshotByVendorId(vendor.id),
    db.findDocumentsByVendorId(vendor.id),
    db.findTransactionsByVendorId(vendor.id, 100, 0),
    db.findEventsByVendorId(vendor.id),
  ]);

  const score = snapshot?.compositeScore ?? 0;
  const supplyChainScore = snapshot?.supplyChainScore ?? 0;
  const supplyFactors = snapshot ? (JSON.parse(snapshot.reasons) as string[]) : [];
  const isSigned = !supplyFactors.some((f) => f.toLowerCase().includes('not cosign-signed'));
  const verdict = supplyFactors.find((f) => /verdict (PASS|WARN|BLOCK)/.test(f))?.match(/verdict (PASS|WARN|BLOCK)/)?.[1] ?? (supplyChainScore === 0 ? 'BLOCK' : 'PASS');

  return (
    <div className="cp-shell">
      <header className="cp-topbar">
        <div className="cp-brand">
          <span className="mark">V</span>
          <div><div>VendorChain</div><div className="sub">Cryptographic Vault</div></div>
        </div>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/onboarding">Onboarding</Link>
          <Link href={`/api/vendors/${vendor.id}`}>API</Link>
        </nav>
      </header>

      <Link href="/dashboard" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</Link>

      <div className="cp-grid cols-3" style={{ marginTop: 16 }}>
        <div className="cp-card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <TrustGauge score={score} />
          <div>
            <h3 style={{ margin: '0 0 6px' }}>{vendor.legalName}</h3>
            <div className="cp-mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{vendor.gstNumber}</div>
            <div style={{ marginTop: 8 }}><VerificationStatusBadge status={vendor.status} /></div>
          </div>
        </div>

        <div className="cp-card">
          <h4>Supply Chain Posture</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Supply Chain Score</span>
            <span className="metric" style={{ fontSize: 26 }}>{supplyChainScore}</span>
          </div>
          <div style={{ marginTop: 6 }}><VerificationStatusBadge status={isSigned ? 'VERIFIED' : 'FLAGGED'} /></div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
            Cosign: <span style={{ color: isSigned ? 'var(--emerald)' : 'var(--crimson)' }}>{isSigned ? 'Signed (Ed25519)' : 'UNSIGNED'}</span>
            {' · '}Verdict: <span className="cp-mono">{verdict}</span>
          </div>
        </div>

        <div className="cp-card">
          <h4>Key Metrics</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><div style={{ color: 'var(--muted)', fontSize: 11 }}>Identity</div><div className="metric" style={{ fontSize: 22 }}>{snapshot?.identityScore ?? 0}</div></div>
            <div><div style={{ color: 'var(--muted)', fontSize: 11 }}>Behavior</div><div className="metric" style={{ fontSize: 22 }}>{snapshot?.behaviorScore ?? 0}</div></div>
            <div><div style={{ color: 'var(--muted)', fontSize: 11 }}>Penalties</div><div className="metric" style={{ fontSize: 22 }}>{snapshot?.penaltyDeduction ?? 0}</div></div>
            <div><div style={{ color: 'var(--muted)', fontSize: 11 }}>Docs</div><div className="metric" style={{ fontSize: 22 }}>{documents.length}</div></div>
          </div>
        </div>
      </div>

      <h2 className="cp-h2">Encrypted Document Vault</h2>
      {documents.length === 0 ? (
        <div className="cp-card" style={{ color: 'var(--muted)', fontSize: 13 }}>No encrypted documents in vault.</div>
      ) : (
        <div className="cp-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead><tr><th>Document</th><th>SHA-256</th><th>Status</th><th>Envelope</th></tr></thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.type}</td>
                  <td className="cp-hash">{d.sha256.slice(0, 24)}…</td>
                  <td><VerificationStatusBadge status={d.status} /></td>
                  <td className="cp-mono" style={{ color: 'var(--muted)', fontSize: 11 }}>AES-256-GCM</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="cp-h2">Supply Chain Security · SBOM</h2>
      <SbomViewer
        title={`CycloneDX SBOM · ${verdict}`}
        components={[
          { name: 'next', version: '14.2.5', purl: 'pkg:npm/next@14.2.5', severity: 'LOW', cvssScore: 2.3 },
          { name: 'react', version: '18.3.1', purl: 'pkg:npm/react@18.3.1' },
          { name: 'zod', version: '3.23.8', purl: 'pkg:npm/zod@3.23.8' },
          { name: 'bullmq', version: '5.8.7', purl: 'pkg:npm/bullmq@5.8.7' },
        ]}
      />

      <h2 className="cp-h2">Transaction Ledger · Polygon L2</h2>
      {transactions.length === 0 ? (
        <div className="cp-card" style={{ color: 'var(--muted)', fontSize: 13 }}>
          No L2-anchored transactions for this vendor.
        </div>
      ) : (
        <div className="cp-grid cols-2">
          {transactions.map((t) => (
            <div key={t.id}>
              <L2TransactionCard
                id={t.id}
                vendorId={vendor.id}
                invoiceRef={t.invoiceRef}
                amountCents={t.amountCents}
                currency={t.currency}
                stateHash={t.stateHash}
                nonce={t.nonce}
                anchorTimestamp={t.anchorTimestamp}
                l2TxHash={t.l2TxHash}
                l2BlockNumber={t.l2BlockNumber}
                status={t.status}
                disputeReason={t.disputeReason}
              />
              {t.status !== 'DISPUTED' && (
                <div style={{ marginTop: 8 }}>
                  <RaiseDisputeButton vendorId={vendor.id} txId={t.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="cp-h2">Audit Timeline</h2>
      <div className="cp-card" style={{ padding: 0 }}>
        <table className="cp-table">
          <thead><tr><th>Time</th><th>Actor</th><th>Transition</th><th>Reason</th></tr></thead>
          <tbody>
            {events.slice().reverse().map((e) => (
              <tr key={e.id}>
                <td className="cp-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{e.createdAt.toISOString().slice(0, 19)}</td>
                <td className="cp-mono">{e.actor}</td>
                <td className="cp-mono">{e.fromStatus} → {e.toStatus}</td>
                <td style={{ color: 'var(--muted)' }}>{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
