// TrustGauge — SVG radial trust gauge (0-100) with dynamic tier colors.
// Server component (pure, stateless) so it is trivially renderable in tests.
import * as React from 'react';
import { tierThemeForScore, TIER_THEMES } from '@/lib/dashboard/tier-theme';

interface TrustGaugeProps {
  score: number;
  size?: number;
}

export default function TrustGauge({ score, size = 168 }: TrustGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const theme = tierThemeForScore(clamped);

  const r = 70;
  const circumference = 2 * Math.PI * r;
  const dash = (clamped / 100) * circumference;

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }} data-testid="trust-gauge">
      <svg width={size} height={size} viewBox="0 0 168 168" role="img" aria-label={`Trust score ${clamped}/100`}>
        <circle cx="84" cy="84" r={r} fill="none" stroke="rgba(148,163,184,.12)" strokeWidth="12" />
        <circle
          cx="84"
          cy="84"
          r={r}
          fill="none"
          stroke={theme.color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 84 84)"
          data-tier={theme.tier}
          data-testid="gauge-arc"
        />
      </svg>
      <div className="gauge-center">
        <div>
          <div className="score" style={{ color: theme.color }}>{clamped}</div>
          <div className="tier">{theme.tier.replace('TIER_', 'Tier ')}</div>
        </div>
      </div>
    </div>
  );
}

export { TIER_THEMES };
