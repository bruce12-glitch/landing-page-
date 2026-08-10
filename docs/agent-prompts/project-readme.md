# VENDORCHAIN — FINAL DOC ORDER: PROJECT README (Repo-Viewer Edition)

> Issued: 09 Aug 2026 · Run ONLY after M1-S3 closure fix lands (chain check §0) · Deliverable: root README.md for external viewers

---

## 0. CHAIN CHECK (do first; README documents reality, not aspiration)
- `git ls-tree -r HEAD --name-only platform/src/lib/storage/` → non-empty.
- Clean-ref suite green (`git archive HEAD | tar -x -C /tmp/x && cd /tmp/x/platform && npm ci && npm test`).
- If either fails: STOP. Land the closure fix first, then write about it.

## 1. MISSION
Rewrite root `README.md` as a portfolio-grade, viewer-facing document
(recruiters, clients, OSS visitors) presenting VendorChain v1 as a
COMPLETED work — while passing the project's own TRUTH RULE:
every feature carries a status label — ✅ Shipped · 🧪 Sandbox ·
🔜 Roadmap. No fake CI shields (no CI exists yet). No UI screenshots
of things that don't exist (terminal output, diagrams, and real landing
screenshots only — take them from the actual running landing page).

## 2. REQUIRED STRUCTURE (all sections, this order)
1. **H1 + one-line tagline** ("Zero-Trust B2B Vendor Verification — never
   trust, always verify, continuously monitor") + compact badges row
   (text facts only: stack versions, test count, license).
2. **The Problem → The Answer** — 3 paragraphs max: assumed trust in B2B
   onboarding → what VendorChain does differently (verify at the boundary,
   audit every act, never store what you can't protect).
3. **What's Inside** — two deliverables in one repo: `landing`
   (Vite static marketing, instructor-audited) + `platform/` (Next.js 14
   API, the verification engine) + a repo map tree.
4. **Feature Matrix** — table with Status column (✅/🧪/🔜): registration,
   magic-byte intake, AES-256-GCM envelope encryption, masked-PII reads,
   deterministic sandbox GSTIN adapter (mod-36 checksum), BullMQ pipeline
   + retries/DLQ, OCR credential cross-check → FLAGGED, audited byte
   retrieval (ADMIN_READ), actor attribution, fail-closed prod boot,
   landing honesty layer (labeled DEMO verifier, zero dead links, CSP).
5. **Architecture** — one text diagram: request lifecycle from upload →
   verdict → append-only event; note encryption points in the flow.
6. **State Machines** — VendorStatus (7 states) + DocumentStatus with
   allowed transitions + which component may trigger each.
7. **Security Model** — envelope encryption (KEK/DEK explained in 4
   lines), no-plaintext-PII rule, timing-safe auth, rate limiting, log
   redaction, CSP/meta headers, **HONESTY LABELS**: sandbox verification
   (not govt-backed), admin-key placeholder (IdP = roadmap), MinIO =
   local S3 emulation.
8. **Quickstart** — A) landing: install → dev → :5173. B) platform:
   docker compose up -d → cp .env.example .env → migrate → dev →
   `curl localhost:3000/api/health` → register-vendor curl with real
   masked-PAN response JSON → enqueue verify curl. Every command must be
   runnable verbatim on a fresh clone.
9. **Proof & Reproducibility** — test counts, the clean-ref method
   (`git archive HEAD | tar -x`), fail-closed boot demo one-liner,
   zero-carets policy, append-only audit design.
10. **Built Under an Audited Work-Order Protocol** *(differentiator)* —
    link docs/agent-prompts/: phase table P1→M1-S3 with commit hashes,
    PR-gate rule, carry-over register. One-paragraph pitch: "every claim
    in this README was produced by tests run on the committed ref."
11. **API Reference** — table: method, path, guard, purpose, status.
12. **Threat Model (T1–T8)** — table: threat → where mitigated (file/mechanism).
13. **Roadmap** — Slice 4 (real GSTN credentials, OIDC, image OCR),
    M2 (Syft SBOM + Cosign), M3 (trust scoring), M4 (immutable ledger).
14. **License & Disclaimer** — portfolio/educational build; sandbox
    verification is not government verification.

## 3. NON-NEGOTIABLES
- TRUTH RULE on every claim; status labels; links relative + valid
- Every command executed once verbatim on a fresh clone; outputs pasted
- ≤ 400 lines, scannable; tables over prose; landing brand voice
- Landing README content preserved as the "landing" subsection (don't
  delete real docs — reorganize)

## 4. DONE-WHEN (paste all)
1. §0 chain outputs green
2. Link audit: list every link/anchor in README → each target verified
   to exist (paste the mapping)
3. Quickstart A+B run verbatim on a fresh clone — outputs pasted
   (health 200, vendor 201 masked PAN, verify enqueue 202)
4. Badge/badge-truth check: zero shields to nonexistent CI; grep output
5. Claim::file mapping — 10 feature claims each tied to a real file path
6. README.md ≤ 400 lines; renders without broken images/anchors

## 5. REPORT BACK
Commit hash · chain outputs · link mapping · quickstart outputs ·
claim::file list · any deviations. This is a docs-only diff — code
changes are OUT OF SCOPE (fixes go in their own commit, separately).
