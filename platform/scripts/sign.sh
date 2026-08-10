#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# VendorChain Platform — Artifact Signing (Module 2, Slice 1)
# =============================================================================
# DEV-ONLY: Uses cosign.key (gitignored) + cosign.pub (committed).
# CI: Uses keyless signing (id-token: write) via GitHub OIDC.
#
# TRUTH RULE: This script never fabricates signatures. If cosign is not
# present, it exits non-zero with an honest message.
#
# Usage:
#   npm run sign          (from platform/ directory)
#   ./scripts/sign.sh     (direct)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
GIT_SHA="$(git -C "${PLATFORM_DIR}" rev-parse HEAD 2>/dev/null || echo 'unknown')"
ARTIFACTS_DIR="${PLATFORM_DIR}/artifacts"
SBOM_DIR="${ARTIFACTS_DIR}/sbom"

# --- Determine signing mode ---
# CI sets COSIGN_KEYLESS=1 and provides SIGSTORE_IDENTITY/SIGSTORE_ISSUER
SIGN_MODE="${COSIGN_KEYLESS:-dev}"

echo "[sign] VendorChain Platform Artifact Signing"
echo "[sign] Git SHA: ${GIT_SHA}"
echo "[sign] Mode: ${SIGN_MODE}"

# --- Check prerequisites ---
if ! command -v cosign >/dev/null 2>&1; then
  echo "[sign] ERROR: cosign is not installed." >&2
  echo "[sign] Install from: https://github.com/sigstore/cosign/releases" >&2
  echo "[sign] In CI, this is installed by the supply-chain workflow." >&2
  exit 1
fi

# --- Ensure artifacts exist ---
SBOM_FILE="${SBOM_DIR}/platform-${GIT_SHA}.cdx.json"
if [[ ! -f "${SBOM_FILE}" ]]; then
  echo "[sign] ERROR: SBOM not found at ${SBOM_FILE}. Run 'npm run sbom' first." >&2
  exit 1
fi

# --- Create dist tarball for signing ---
DIST_DIR="${PLATFORM_DIR}/dist"
if [[ ! -d "${DIST_DIR}" ]]; then
  echo "[sign] WARNING: dist/ not found. Building minimal tarball from src/ + package.json." >&2
  DIST_TARBALL="${ARTIFACTS_DIR}/dist-tarball-${GIT_SHA}.tgz"
  tar -czf "${DIST_TARBALL}" -C "${PLATFORM_DIR}" \
    package.json package-lock.json tsconfig.json next.config.mjs \
    src/ prisma/ 2>/dev/null || true
else
  DIST_TARBALL="${ARTIFACTS_DIR}/dist-tarball-${GIT_SHA}.tgz"
  tar -czf "${DIST_TARBALL}" -C "${PLATFORM_DIR}" dist/ 2>/dev/null || true
fi

if [[ ! -f "${DIST_TARBALL}" ]]; then
  echo "[sign] ERROR: Failed to create dist tarball." >&2
  exit 1
fi

echo "[sign] Dist tarball: ${DIST_TARBALL}"

# --- Sign artifacts ---
if [[ "${SIGN_MODE}" == "1" || "${SIGN_MODE}" == "true" ]]; then
  # CI KEYLESS MODE
  echo "[sign] Using keyless signing (GitHub OIDC)..."

  cosign sign-blob "${SBOM_FILE}" \
    --yes \
    --output-signature="${SBOM_FILE}.sig" \
    --output-certificate="${SBOM_FILE}.cert" \
    --identity-token="$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL" | jq -r '.value')"

  cosign sign-blob "${DIST_TARBALL}" \
    --yes \
    --output-signature="${DIST_TARBALL}.sig" \
    --output-certificate="${DIST_TARBALL}.cert" \
    --identity-token="$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL" | jq -r '.value')"

  echo "[sign] ✅ Keyless signatures created."
else
  # DEV KEYPAIR MODE
  KEY_FILE="${PLATFORM_DIR}/cosign.key"
  if [[ ! -f "${KEY_FILE}" ]]; then
    echo "[sign] ERROR: Dev key not found at ${KEY_FILE}." >&2
    echo "[sign] Generate with: cosign generate-key-pair (cosign.key will be gitignored)" >&2
    exit 1
  fi

  echo "[sign] Using dev keypair (DEV-ONLY — never used in production)..."

  cosign sign-blob "${SBOM_FILE}" \
    --key="${KEY_FILE}" \
    --output-signature="${SBOM_FILE}.sig"

  cosign sign-blob "${DIST_TARBALL}" \
    --key="${KEY_FILE}" \
    --output-signature="${DIST_TARBALL}.sig"

  echo "[sign] ✅ Dev signatures created."
fi

# --- Write attestation bundle manifest ---
BUNDLE_FILE="${ARTIFACTS_DIR}/attestation-bundle-${GIT_SHA}.json"
cat > "${BUNDLE_FILE}" <<EOF
{
  "gitSha": "${GIT_SHA}",
  "sbom": {
    "path": "${SBOM_FILE}",
    "signature": "${SBOM_FILE}.sig",
    "sha256": "$(sha256sum "${SBOM_FILE}" | awk '{print $1}')"
  },
  "distTarball": {
    "path": "${DIST_TARBALL}",
    "signature": "${DIST_TARBALL}.sig",
    "sha256": "$(sha256sum "${DIST_TARBALL}" | awk '{print $1}')"
  },
  "signMode": "${SIGN_MODE}",
  "signedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "[sign] Bundle manifest: ${BUNDLE_FILE}"
exit 0
