'use client';

import { useEffect, useState } from 'react';

const STAGES = [
  'SHA-256 artifact digests sealed locally',
  'AES-256-GCM envelope encryption engaged',
  'Ciphertext transmitted to isolated credential vault',
  'Polygon L2 verification commitment queued',
];

export default function OnboardingTerminal({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (stage === STAGES.length - 1) {
      const finish = window.setTimeout(onComplete, 650);
      return () => window.clearTimeout(finish);
    }
    const next = window.setTimeout(() => setStage((value) => value + 1), 650);
    return () => window.clearTimeout(next);
  }, [stage, onComplete]);

  return (
    <section className="onboarding-terminal" aria-live="polite" aria-label="Cryptographic upload terminal">
      <div className="terminal-head"><span className="terminal-dot" />CRYPTOGRAPHIC INTAKE TERMINAL <span>LIVE</span></div>
      {STAGES.map((line, index) => (
        <div className={`terminal-line ${index < stage ? 'complete' : index === stage ? 'running' : ''}`} key={line}>
          <span>{index < stage ? '✓' : index === stage ? '›' : '·'}</span>{line}
        </div>
      ))}
      <p className="terminal-note">No plaintext PII is persisted during this sequence.</p>
    </section>
  );
}
