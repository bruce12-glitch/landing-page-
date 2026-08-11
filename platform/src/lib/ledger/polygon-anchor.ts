// =============================================================================
// VendorChain Platform — Polygon L2 Anchor (Module 4)
// =============================================================================
// Anchors a SHA-256 state commitment to a simulated Polygon L2 ledger. In this
// sandboxed build we emit a DETERMINISTIC (stateHash-derived) L2 tx hash and
// block number so tests are reproducible, with simulated propagation latency.
//
// TRUTH RULE: This is a structural simulation, not a live RPC submission. A
// production deployment would swap `anchorStateCommitment` for a real
// Polygon zkEVM / Polygon PoS `eth_sendRawTransaction` call using the same
// stateHash payload. The commitment contract NEVER stores amountCents or any
// proprietary invoice detail — only the hash + a public index.
// =============================================================================

import { createHash } from 'node:crypto';

export interface L2AnchorReceipt {
  l2TxHash: string; // 0x... hex transaction receipt
  l2BlockNumber: number; // deterministic block number
  anchoredAt: string; // ISO timestamp
}

// Simulated on-chain propagation latency (ms). Kept tiny for snappy tests/dev.
const SIMULATED_LATENCY_MS = 25;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deterministically derive a Polygon L2 receipt from the stateHash so the
 * same commitment always yields the same anchor (reproducible & auditable).
 * The block number is a stable pseudo-random value in a realistic recent range.
 */
export function derivePolygonL2Receipt(stateHash: string): L2AnchorReceipt {
  const digest = createHash('sha256').update(`polygon-l2|${stateHash}`).digest('hex');
  const l2TxHash = `0x${digest.slice(0, 64)}`;
  // Stable block derived from the first 6 hex chars → ~0..16.7M range.
  const blockSeed = parseInt(digest.slice(0, 6), 16);
  const l2BlockNumber = 45_000_000 + (blockSeed % 1_500_000);
  return {
    l2TxHash,
    l2BlockNumber,
    anchoredAt: new Date().toISOString(),
  };
}

/**
 * Anchor a state commitment to the Polygon L2 ledger.
 * Returns a deterministic receipt after simulated propagation.
 */
export async function anchorStateCommitment(
  stateHash: string,
  _vendorId: string
): Promise<L2AnchorReceipt> {
  await delay(SIMULATED_LATENCY_MS);
  return derivePolygonL2Receipt(stateHash);
}
