# VendorChain — Agent Work Orders (Instructor-Controlled Sequence)

One work order at a time. Each phase gates the next. Never stack prompts.

## Status Board

| Phase | Work Order | Status | Artifact / Proof |
|---|---|---|---|
| P1 | [Trust & Integrity Pass](./phase-1-trust-integrity-pass.md) | ✅ **PASS** — verified by instructor against ref | commit `44677be` on PR #4 |
| P2 | [Conversion Core](./phase-2-conversion-core.md) | 🟠 **FIX CARRIED INTO P3-F0** — empty fast-submit guard + inline-style nit; greps all truthful ✅, craft otherwise PASS-grade | commit `d9f6131` on PR #4 |
| P3 | [Launch Hardening](./phase-3-launch-hardening.md) | ✅ **PASS** — F0 closed, CSP live, build clean (238ms, 33KB gzip), served-verified by instructor; Lighthouse scores owner-verify pending | commit `2703e09` on PR #4 |
| M1-S1 | [Onboarding Foundation](./m1-slice-1-onboarding-foundation.md) | ✅ **PASS** — crypto textbook-grade; 25/25 tests + strict build reproduced on instructor sandbox | commit `06a942b` on PR #4 |
| M1-S2 | [Govt Verification Adapter](./m1-slice-2-govt-verification-adapter.md) | ✅ **PASS** — real mod-36 checksum, deterministic, DLQ proven live; 33/33 reproduced on instructor sandbox | commit `c76027d` on PR #4 |
| M1-S3 | [Document Intelligence](./m1-slice-3-document-intelligence.md) | 🟠 **FIX REQUIRED** — commit/worktree drift: `platform/src/lib/storage/` untracked (4 importers broken on clean clone); tracked code review-clean; F0 carets ✅ | commit `c3ba63b` on PR #4 (incomplete) |
| R1 | [Project README — viewer edition](./project-readme.md) | 🟡 **ISSUED** — portfolio-grade, TRUTH-labeled (✅/🧪/🔜); chain-gated on S3 closure fix | — |
| M1-S4+ | Real GSTN integration → IdP/OIDC → image OCR → M2 SBOM/Cosign → M3 Trust Scoring → M4 Ledger | ⬜ Locked | — |

## Protocol v2 — STAGED PRs → SINGLE-PR CUMULATIVE (owner reviews & merges at the end)

1. Agent bases work on the **last audited branch** (chain — never stale `main`), executes ONE work order, commits with phase markers, reports commit hash.
2. Instructor audits the **ref** (never the summary) → PASS or FIX.
3. Owner reviews the cumulative PR #4 (P1+P2+P3) and merges to `main` when satisfied — one clean merge, every increment instructor-audited.
4. A report without a PR + ref is a claim, not a report.

## Carry-over Register (audit debt — nothing escapes)

| Item | From | Status | Proof |
|---|---|---|---|
| Empty fast-submit guard `formInitTime < 3000` | P2 audit | ✅ CLOSED in `2703e09` | `js/app.js:145` → feedback + focus + `return` |
| Inline style in error-summary innerHTML | P2 audit | ✅ CLOSED in `2703e09` | `grep -c 'style="' js/app.js index.html` → 0/0 |
| 2 bare `href="#"` Home links | P1 audit nit | ✅ CLOSED in `2703e09` | `grep -o 'href="#"' index.html` → 0 |

| Caret ranges on bullmq / ioredis manifests | M1-S2 audit | ✅ CLOSED in `c3ba63b` | zero carets, lockfile regenerated |
| In-memory queue silent under prod | M1-S2 audit | ✅ CLOSED in `c3ba63b` | `boot-check.ts` — fatal exit in prod, loud WARN in dev |
| **Storage layer untracked (commit/worktree drift)** | M1-S3 audit | 🟠 OPEN | `git add platform/src/lib/storage/` + clean-checkout repro + `git status --porcelain` proof |
| **tesseract.js dead dep / image-OCR limitation undocumented** | M1-S3 audit | 🟠 OPEN | wire it OR document manual-review routing in README |

## Protocol amendment (M1-S3 audit, 09 Aug)

Every DONE-WHEN from now on includes **clean-tree proof**: `git status
--porcelain` empty + tests/build executed against the COMMITTED ref
(extract via `git archive <ref> | tar -x`, run there). Outputs produced
on a dirty working tree are inadmissible as evidence.



## Truth Rule (applies to every work order)

> You may simulate a **DEMO**. You may never simulate a **RESULT**.
