#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# VendorChain Platform — Signature Verification (Module 2, Slice 1)
# =============================================================================
# DEV: cosign verify-blob --key cosign.pub
# CI:  cosign verify-blob --certificate-identity-regexp --certificate-oidc-issuer
#
# TRUTH RULE: This script computes verification at runtime. It never returns
# zero for a failed verification. A non-zero exit means the signature is
# invalid, the blob has been tampered with, or the attestation is missing.
#
# Usage:
#   npm run verify        (from platform/ directory)
#   ./scripts/verify.sh   (direct)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
GIT_SHA="$(git -C "${PLATFORM_DIR}" rev-parse HEAD 2>/dev/null || echo 'unknown')"
ARTIFACTS_DIR="${PLATFORM_DIR}/artifacts"
SBOM_DIR="${ARTIFACTS_DIR}/sbom"

# --- Determine verification mode ---
VERIFY_MODE="${COSIGN_KEYLESS:-dev}"

echo "[verify] VendorChain Platform Signature Verification"
echo "[verify] Git SHA: ${GIT_SHA}"
echo "[verify] Mode: ${VERIFY_MODE}"

# --- Check prerequisites ---
if ! command -v cosign >/dev/null 2>&1; then
  echo "[verify] ERROR: cosign is not installed." >&2
  echo "[verify] Install from: https://github.com/sigstore/cosign/releases" >&2
  echo "[verify] In CI, this is installed by the supply-chain workflow." >&2
  exit 1
fi

# --- Locate artifacts ---
SBOM_FILE="${SBOM_DIR}/platform-${GIT_SHA}.cdx.json"
SBOM_SIG="${SBOM_FILE}.sig"
DIST_TARBALL="${ARTIFACTS_DIR}/dist-tarball-${GIT_SHA}.tgz"
DIST_SIG="${DIST_TARBALL}.sig"

if [[ ! -f "${SBOM_FILE}" ]]; then
  echo "[verify] ERROR: SBOM not found at ${SBOM_FILE}." >&2
  exit 1
fi

if [[ ! -f "${SBOM_SIG}" ]]; then
  echo "[verify] ERROR: SBOM signature not found at ${SBOM_SIG}. Run 'npm run sign' first." >&2
  exit 1
fi

# --- Verify SBOM signature ---
echo "[verify] Verifying SBOM signature..."
if [[ "${VERIFY_MODE}" == "1" || "${VERIFY_MODE}" == "true" ]]; then
  # CI KEYLESS: verify against GitHub OIDC issuer
  cosign verify-blob "${SBOM_FILE}" \
    --signature="${SBOM_SIG}" \
    --certificate="${SBOM_FILE}.cert" \
    --certificate-identity-regexp="^https://github.com/${GITHUB_REPOSITORY:-.*/.*}/.github/workflows/.*@.*$" \
    --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
else
  # DEV: verify against committed public key
  cosign verify-blob "${SBOM_FILE}" \
    --signature="${SBOM_SIG}" \
    --key="${PLATFORM_DIR}/cosign.pub"
fi

echo "[verify] ✅ SBOM signature valid."

# --- Verify dist tarball if present ---
if [[ -f "${DIST_TARBALL}" && -f "${DIST_SIG}" ]]; then
  echo "[verify] Verifying dist tarball signature..."
  if [[ "${VERIFY_MODE}" == "1" || "${VERIFY_MODE}" == "true" ]]; then
    cosign verify-blob "${DIST_TARBALL}" \
      --signature="${DIST_SIG}" \
      --certificate="${DIST_TARBALL}.cert" \
      --certificate-identity-regexp="^https://github.com/${GITHUB_REPOSITORY:-.*/.*}/.github/workflows/.*@.*$" \
      --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
  else
    cosign verify-blob "${DIST_TARBALL}" \
      --signature="${DIST_SIG}" \
      --key="${PLATFORM_DIR}/cosign.pub"
  fi
  echo "[verify] ✅ Dist tarball signature valid."
fi

echo "[verify] All attestations verified for SHA: ${GIT_SHA}"
exit 0
