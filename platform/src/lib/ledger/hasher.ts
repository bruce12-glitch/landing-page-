// =============================================================================
// VendorChain Platform — Deterministic State Commitment Hasher (Module 4)
// =============================================================================
// COMMERCIAL CONFIDENTIALITY INVARIANT:
//   The SHA-256 `stateHash` is a one-way commitment. It never reveals the
//   invoice amount, unit pricing, or customer terms — only a fingerprint that
//   can be re-derived and compared. Proprietary fields stay stored privately.
//
//   StateHash = SHA-256(
//       vendorId ∥ invoiceRef ∥ amountCents ∥ currency ∥ nonce ∥ timestamp
//   )
// =============================================================================

import { createHash, randomBytes } from 'node:crypto';

export interface StateCommitmentInput {
  vendorId: string;
  invoiceRef: string;
  amountCents: number;
  currency: string;
  /** Optional caller-supplied nonce. When omitted, a fresh CSPRNG nonce is used. */
  nonce?: string;
  /** Optional caller-supplied ISO timestamp. When omitted, now() is used. */
  timestamp?: string;
}

export interface StateCommitment {
  stateHash: string; // lowercase hex SHA-256
  nonce: string;
  timestamp: string;
}

function sha256Hex(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Compute a deterministic state commitment. Identical inputs ALWAYS produce
 * the identical hash (single-salt concatenation). Any single-field variance —
 * including a 1-cent amount change — flips the entire digest.
 */
export function computeTransactionStateHash(
  input: StateCommitmentInput
): StateCommitment {
  const nonce = input.nonce ?? randomBytes(16).toString('hex');
  const timestamp = input.timestamp ?? new Date().toISOString();

  const parts = [
    input.vendorId,
    input.invoiceRef,
    String(input.amountCents),
    input.currency,
    nonce,
    timestamp,
  ];

  return {
    stateHash: sha256Hex(parts),
    nonce,
    timestamp,
  };
}

/**
 * Verify a stored stateHash against supplied fields. Deterministic.
 */
export function verifyTransactionStateHash(
  input: StateCommitmentInput & { expectedHash: string }
): boolean {
  const { expectedHash, ...rest } = input;
  const { stateHash } = computeTransactionStateHash(rest);
  return stateHash === expectedHash;
}
