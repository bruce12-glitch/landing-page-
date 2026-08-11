'use client';

// L2TransactionCard — monospaced SHA-256 state commitment card with an
// interactive "Verify Hash" proof check. Computes the SHA-256 over the exact
// commitment inputs (mirroring lib/ledger/hasher) and compares to the stored
// hash, proving the ledger anchor is cryptographically intact.
import { useState } from 'react';
import VerificationStatusBadge from './VerificationStatusBadge';

export interface L2TransactionCardProps {
  id: string;
  vendorId: string;
  invoiceRef: string;
  amountCents: number;
  currency: string;
  stateHash: string;
  nonce: string;
  anchorTimestamp: string;
  l2TxHash: string | null;
  l2BlockNumber: number | null;
  status: string;
  disputeReason?: string | null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function L2TransactionCard(props: L2TransactionCardProps) {
  const [result, setResult] = useState<'idle' | 'match' | 'mismatch'>('idle');
  const [checking, setChecking] = useState(false);

  async function verify() {
    setChecking(true);
    setResult('idle');
    // Must mirror lib/ledger/hasher.ts exactly.
    const canonical = [
      props.vendorId,
      props.invoiceRef,
      String(props.amountCents),
      props.currency,
      props.nonce,
      props.anchorTimestamp,
    ].join('|');
    const computed = await sha256Hex(canonical);
    setResult(computed === props.stateHash ? 'match' : 'mismatch');
    setChecking(false);
  }

  const amount =
    (props.amountCents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: props.currency,
    });

  return (
    <div className="cp-card" data-testid="l2-tx-card" data-status={props.status.toUpperCase()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="cp-mono" style={{ fontWeight: 700 }}>{props.invoiceRef}</span>
        <VerificationStatusBadge status={props.status} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Amount <span className="cp-mono" style={{ color: 'var(--text)' }}>{amount}</span></div>
      <div style={{ margin: '8px 0 4px', fontSize: 11, color: 'var(--muted)' }}>SHA-256 STATE COMMITMENT</div>
      <div className="cp-hash">{props.stateHash}</div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
        <span>Nonce: <span className="cp-mono">{props.nonce.slice(0, 16)}…</span></span>
        <span>TS: <span className="cp-mono">{props.anchorTimestamp}</span></span>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
        <span>L2 Tx: <span className="cp-hash">{props.l2TxHash ?? '—'}</span></span>
        <span>Block: <span className="cp-mono">{props.l2BlockNumber ?? '—'}</span></span>
      </div>
      {props.disputeReason ? (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--crimson)' }}>Dispute: {props.disputeReason}</div>
      ) : null}
      <button
        className="cp-btn"
        style={{ marginTop: 12 }}
        onClick={verify}
        disabled={checking}
        data-testid="verify-hash-btn"
      >
        {checking ? 'Verifying…' : 'Verify Hash'}
      </button>
      {result === 'match' && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--emerald)', fontFamily: 'var(--mono)' }} data-testid="hash-match">
          ✓ SHA-256 commitment intact — ledger anchor verified
        </div>
      )}
      {result === 'mismatch' && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--crimson)', fontFamily: 'var(--mono)' }}>
          ✗ Hash mismatch — commitment integrity FAILED
        </div>
      )}
    </div>
  );
}
