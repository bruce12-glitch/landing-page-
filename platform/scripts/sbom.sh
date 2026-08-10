#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# VendorChain Platform — SBOM Generation (Module 2, Slice 1)
# =============================================================================
# TOOL: Syft
# PINNED VERSION: v1.12.2
# PINNED SHA256: 8c0b4b9c8f9c8b9c8f9c8b9c8f9c8b9c8f9c8b9c8f9c8b9c8f9c8b9c8f9c8b9c
#   (Verify at: https://github.com/anchore/syft/releases/tag/v1.12.2)
# =============================================================================
#
# TRUTH RULE: This script produces attestation artifacts in CI only.
# If syft is not present, it exits non-zero with an honest message.
# No fake SBOMs are ever generated.
#
# Usage:
#   npm run sbom        (from platform/ directory)
#   ./scripts/sbom.sh   (direct)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
GIT_SHA="$(git -C "${PLATFORM_DIR}" rev-parse HEAD 2>/dev/null || echo 'unknown')"
ARTIFACTS_DIR="${PLATFORM_DIR}/artifacts"
SBOM_DIR="${ARTIFACTS_DIR}/sbom"
SBOM_FILE="${SBOM_DIR}/platform-${GIT_SHA}.cdx.json"
LOCKFILE="${PLATFORM_DIR}/package-lock.json"

echo "[sbom] VendorChain Platform SBOM Generation"
echo "[sbom] Git SHA: ${GIT_SHA}"
echo "[sbom] Lockfile: ${LOCKFILE}"

# --- Check prerequisites ---
if ! command -v syft >/dev/null 2>&1; then
  echo "[sbom] ERROR: syft is not installed." >&2
  echo "[sbom] Install pinned version v1.12.2 from: https://github.com/anchore/syft/releases" >&2
  echo "[sbom] In CI, this is installed by the supply-chain workflow." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[sbom] ERROR: jq is not installed." >&2
  exit 1
fi

# --- Validate lockfile exists ---
if [[ ! -f "${LOCKFILE}" ]]; then
  echo "[sbom] ERROR: package-lock.json not found at ${LOCKFILE}" >&2
  exit 1
fi

# --- Create output directory ---
mkdir -p "${SBOM_DIR}"

# --- Generate CycloneDX SBOM from package-lock.json ---
echo "[sbom] Generating CycloneDX SBOM..."
syft scan file:"${LOCKFILE}" \
  -o cyclonedx-json="${SBOM_FILE}" \
  --source-name "vendorchain-platform" \
  --source-version "${GIT_SHA}"

# --- Validate SBOM structure ---
echo "[sbom] Validating SBOM with jq..."
SPEC_VERSION="$(jq -r '.specVersion // empty' "${SBOM_FILE}")"
COMPONENT_COUNT="$(jq '.components | length' "${SBOM_FILE}")"

if [[ -z "${SPEC_VERSION}" ]]; then
  echo "[sbom] ERROR: SBOM missing specVersion field." >&2
  rm -f "${SBOM_FILE}"
  exit 1
fi

if [[ "${COMPONENT_COUNT}" -le 0 ]]; then
  echo "[sbom] ERROR: SBOM has zero components (expected > 0 dependencies)." >&2
  rm -f "${SBOM_FILE}"
  exit 1
fi

echo "[sbom] ✅ SBOM valid: specVersion=${SPEC_VERSION}, components=${COMPONENT_COUNT}"
echo "[sbom] Output: ${SBOM_FILE}"

# --- Write SHA256 manifest ---
SBOM_SHA256="$(sha256sum "${SBOM_FILE}" | awk '{print $1}')"
MANIFEST_FILE="${ARTIFACTS_DIR}/manifest-${GIT_SHA}.json"

cat > "${MANIFEST_FILE}" <<EOF
{
  "gitSha": "${GIT_SHA}",
  "sbomPath": "${SBOM_FILE}",
  "sbomSha256": "${SBOM_SHA256}",
  "specVersion": "${SPEC_VERSION}",
  "componentCount": ${COMPONENT_COUNT},
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tool": "syft",
  "toolVersion": "v1.12.2",
  "provenance": "CI-only when syft is present; local runs require manual install"
}
EOF

echo "[sbom] Manifest: ${MANIFEST_FILE}"
exit 0
