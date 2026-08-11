'use client';

// Live "Raise Dispute" trigger — POSTs to the dispute endpoint which marks the
// transaction DISPUTED and auto-applies the -25 trust penalty (feedback loop).
import { useState } from 'react';

interface RaiseDisputeButtonProps {
  vendorId: string;
  txId: string;
  onDisputed?: (before: number, after: number, tier: string) => void;
}

export default function RaiseDisputeButton({ vendorId, txId, onDisputed }: RaiseDisputeButtonProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function raise() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/transactions/${txId}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': '' },
        body: JSON.stringify({ disputeReason: 'Disputed via control plane — deliverables not met' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(`Dispute failed: ${data.error ?? res.status}`);
      } else {
        setResult('✓ Dispute raised — trust penalty applied');
        onDisputed?.(data.trustFeedback?.beforeScore, data.trustFeedback?.afterScore, data.trustFeedback?.tier);
      }
    } catch (e) {
      setResult(`Network error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="cp-btn danger" onClick={raise} disabled={busy}>
        {busy ? 'Raising dispute…' : 'Raise Dispute'}
      </button>
      {result && <div style={{ marginTop: 6, fontSize: 12 }}>{result}</div>}
    </div>
  );
}
