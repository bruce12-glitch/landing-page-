# VENDORCHAIN — BUILD AGENT MASTER PROMPT
## MODULE 2 · SLICE 1: SUPPLY-CHAIN SELF-ATTESTATION (SBOM + COSIGN)

> Issued: 09 Aug 2026 · Prereq: v1 merged main (44/44) · Gate: instructor audit of the PR ref · Do BEFORE any vendor-facing M2 feature

---

## 0. CHAIN CHECK (first, always)
Work in `platform/` + repo `.github/` on a branch forked from CURRENT
`main` (post-merge). Verify BEFORE writing:
- `grep -c "panEncrypted" platform/prisma/schema.prisma` ≥ 1
- `cd platform && npm test` → 44/44 green
- `grep -c "^image.*tesseract" platform/README.md` n/a — confirm instead:
  `grep -ci "manual review" platform/README.md` ≥ 1
Fail any → STOP: "v2 chain break."
TRUTH RULE — tooling edition: **no fabricated tool outputs.** If syft or
cosign cannot run in your sandbox, the deliverable is the script + CI
workflow + references — and the report marks tool-run outputs as
"produced in CI" with the run URL. Fake cosign output = instant rejection.

## 1. WHY (read before building)
A verification platform whose OWN supply chain is un-attested is the
empty-`if` guard at company scale. Before vendors trust our pipeline, our
pipeline must sign itself: every build → SBOM (CycloneDX) → cosign
signature → verification gate. Dogfood first, product second.

## 2. BUILD ITEMS

### F1 — SBOM GENERATION (Syft, pinned)
- `platform/scripts/sbom.sh`: runs Syft (PINNED version, e.g. v1.x — pin by
  checksum or exact tag in script header comment) against
  `platform/package-lock.json` → CycloneDX JSON →
  `artifacts/sbom/platform-<git-sha>.cdx.json`.
- npm script: `"sbom": "bash scripts/sbom.sh"`. Validate output has
  `specVersion` + component count > 0 (jq check in script, non-zero exit
  on failure).
- `artifacts/` is gitignored EXCEPT `.gitkeep` note; SBOMs are build
  attestations, not source.

### F2 — COSIGN SIGNING (pinned cosign)
- Dev flow: `cosign generate-key-pair` → `cosign.key` GITIGNORED,
  `cosign.pub` committed. `platform/scripts/sign.sh`: sign
  `dist`-tarball + SBOM file → `.sig` + `.pem` alongside artifact.
- `platform/scripts/verify.sh`: `cosign verify-blob --key cosign.pub …`
  → non-zero exit on any mismatch. npm scripts `sign` / `verify`.
- CI flow (F3) uses keyless (GitHub OIDC `id-token: write`); local dev
  uses the keypair. Document BOTH, label dev keypair as DEV-ONLY.

### F3 — CI GATE (.github/workflows/supply-chain.yml)
On PR + push touching platform/**: checkout exact SHA → npm ci → lint
step `! grep -rE '"\^' platform/package.json` (zero-carets law) → npm
test → npm run build → sbom.sh → keyless cosign sign-blob → cosign
verify-blob (identity-regexp: GitHub Actions issuer) → upload SBOM+sig
as workflow artifacts. workflow fails = merge blocked.
Add `step-security/harden-runner` (pinned SHA) with egress audit.

### F4 — HONEST API SURFACE (small, real)
`GET /api/supply-chain/latest` (admin-key): reads newest attestation dir
→ returns { gitSha, sbomSha256, signaturePresent: bool, **verified:
bool, verifiedAt } where `verified` is computed by ACTUALLY running
verify.sh (lib spawn wrapper) — never a stored claim. No attestation
present → 404 with honest message. Tests: spawn-mocked pass/fail paths.

### F5 — DOCS
platform/README + SECURITY.md: supply-chain section — what SBOM/signing
proves, dev-keypair vs CI keyless, how a reviewer reproduces
`npm run sbom && npm run verify`. Root README feature matrix: flip
Module 2 row to 🧪 "self-attestation shipped · vendor-facing next".

## 3. NON-NEGOTIABLES
Pinned tool versions (script headers state tag + sha256 for binaries) ·
no secrets in repo (cosign.key ignored; prove with grep) · TRUTH RULE on
every verified/attested field · zero carets law holds · landing files
untouched · v1 invariants (44 tests stay green; new tests additive).

## 4. DONE-WHEN (paste every output; mark each LOCAL or CI-RUN-URL)
1. Chain greps + 44/44 baseline
2. `npm run sbom` → valid CycloneDX (jq '.specVersion' + component count)
3. sign+verify round-trip → `cosign verify-blob` PASS line pasted
4. CI workflow present + GREEN run URL on the PR branch
5. `grep -rE '"\^' platform/package.json` → empty (law holds)
6. `git ls-files | grep cosign.key` → empty (secret hygiene)
7. New endpoint tests green; total suite > 44; strict build exit 0

## 5. REPORT BACK
PR # · branch · commits · all outputs (LOCAL vs CI labeled) · deviation
note. Own words: "Why is a VERIFIED field that stores yesterday's
result a lie, and what did we do instead?"
OUT OF SCOPE (rejected if present): vendor-facing SBOM upload (Slice 2),
Grype vuln scanning (Slice 3), image signing, deploying anywhere.
