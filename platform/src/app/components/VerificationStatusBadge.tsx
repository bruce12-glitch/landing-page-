// VerificationStatusBadge — color-coded badge for all vendor/transaction states.
// Server component (pure, stateless) so it is trivially renderable in tests.
import * as React from 'react';
import { statusThemeFor } from '@/lib/dashboard/tier-theme';

interface VerificationStatusBadgeProps {
  status: string;
}

export default function VerificationStatusBadge({ status }: VerificationStatusBadgeProps) {
  const theme = statusThemeFor(status);
  return (
    <span
      className="cp-badge"
      style={{ color: theme.color, background: theme.soft, borderColor: `${theme.color}44` }}
      data-status={status.toUpperCase()}
      data-testid="status-badge"
    >
      <span className="dot" style={{ background: theme.color }} aria-hidden="true" />
      {theme.label}
    </span>
  );
}
