// =============================================================================
// VendorChain — Trust Tier Theme & Verification Status Theming
// Shared by the Control Plane UI components (TrustGauge, VerificationStatusBadge)
// and unit tests. Kept framework-agnostic so it is trivially testable.
// =============================================================================
import type { TrustTier } from '@/lib/db/client';

export interface TierTheme {
  tier: TrustTier;
  /** CSS color for the tier. */
  color: string;
  /** CSS color for soft backgrounds. */
  soft: string;
  label: string;
}

/**
 * Deterministic tier theme mapping used by the TrustGauge (SVG arc) and badges.
 *   Emerald  >= 85 (TIER_1_CRITICAL)
 *   Blue      65-84 (TIER_2_STANDARD)
 *   Amber     40-64 (TIER_3_RESTRICTED)
 *   Crimson    0-39 (TIER_4_SUSPENDED)
 */
export const TIER_THEMES: Record<TrustTier, TierTheme> = {
  TIER_1_CRITICAL: { tier: 'TIER_1_CRITICAL', color: '#34D399', soft: 'rgba(52,211,153,.12)', label: 'Pristine' },
  TIER_2_STANDARD: { tier: 'TIER_2_STANDARD', color: '#3B82F6', soft: 'rgba(59,130,246,.12)', label: 'Verified' },
  TIER_3_RESTRICTED: { tier: 'TIER_3_RESTRICTED', color: '#FBBF24', soft: 'rgba(251,191,36,.12)', label: 'Restricted' },
  TIER_4_SUSPENDED: { tier: 'TIER_4_SUSPENDED', color: '#F87171', soft: 'rgba(248,113,113,.14)', label: 'Suspended' },
};

/** Map a 0-100 score to its tier (mirrors calculator.tierForScore). */
export function tierForScore(score: number): TrustTier {
  if (score >= 85) return 'TIER_1_CRITICAL';
  if (score >= 65) return 'TIER_2_STANDARD';
  if (score >= 40) return 'TIER_3_RESTRICTED';
  return 'TIER_4_SUSPENDED';
}

export function tierThemeForScore(score: number): TierTheme {
  return TIER_THEMES[tierForScore(score)];
}

/** Composite of all vendor + transaction states the UI must render distinctly. */
export type VerificationState =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'VERIFIED'
  | 'FLAGGED'
  | 'BLOCKED'
  | 'FAILED'
  | 'RECORDED'
  | 'COMMITTED_L2'
  | 'SETTLED'
  | 'DISPUTED'
  | 'RESOLVED';

export interface StatusTheme {
  label: string;
  color: string;
  soft: string;
}

export const STATUS_THEMES: Record<VerificationState, StatusTheme> = {
  UNVERIFIED: { label: 'Unverified', color: '#94A3B8', soft: 'rgba(148,163,184,.12)' },
  PENDING: { label: 'Pending', color: '#94A3B8', soft: 'rgba(148,163,184,.12)' },
  IN_PROGRESS: { label: 'In Progress', color: '#38BDF8', soft: 'rgba(56,189,248,.14)' },
  VERIFIED: { label: 'Verified', color: '#34D399', soft: 'rgba(52,211,153,.14)' },
  FLAGGED: { label: 'Flagged', color: '#FBBF24', soft: 'rgba(251,191,36,.14)' },
  BLOCKED: { label: 'Blocked', color: '#F87171', soft: 'rgba(248,113,113,.14)' },
  FAILED: { label: 'Failed', color: '#F87171', soft: 'rgba(248,113,113,.14)' },
  RECORDED: { label: 'Recorded', color: '#94A3B8', soft: 'rgba(148,163,184,.12)' },
  COMMITTED_L2: { label: 'Committed L2', color: '#38BDF8', soft: 'rgba(56,189,248,.14)' },
  SETTLED: { label: 'Settled', color: '#34D399', soft: 'rgba(52,211,153,.14)' },
  DISPUTED: { label: 'Disputed', color: '#F87171', soft: 'rgba(248,113,113,.14)' },
  RESOLVED: { label: 'Resolved', color: '#34D399', soft: 'rgba(52,211,153,.14)' },
};

export function statusThemeFor(state: string): StatusTheme {
  const key = state.toUpperCase() as VerificationState;
  return STATUS_THEMES[key] ?? { label: state, color: '#94A3B8', soft: 'rgba(148,163,184,.12)' };
}
