# VendorChain — Deep Analysis & Progress Report

> Branch under review: `arena/019fef2d-landing-page` · Base: `5d92a90` (main) · Date: 2026-08-11 · Live server: `npm run dev` (Vite 5, port 5173)

---

## 1. Executive Summary

This is **one repo, two deliverables**:

1. **Landing site** (repo root) — dark, premium, zero-trust B2B landing page, now fully **modular** (extracted from a single-file monolith into `css/style.css` + `js/app.js`), with **11 sections**.
2. **Platform** (`platform/`) — the actual verification engine: Next.js 14 + TS strict + PostgreSQL + Redis/BullMQ + Prisma + Zod. ~50 unit/integration tests across 13 suites.

The old `ANALYSIS.md` at the repo root is **explicitly marked SUPERSEDED** (pre-refactor snapshot of 07 Aug). This report reflects the current HEAD (`5d92a90`).

---

## 2. Landing Page — Current State (Live ✅)

Server is **running and verified** — `index.html` (200, 42 KB), `css/style.css`, `js/app.js`, `assets/logo.png` all served correctly, SPA-style 404 fallback works.

### Structure — 11 sections
| # | Section | Anchor | Role |
|---|---------|--------|------|
| 1 | Hero | `#heroShell` | NIST SP 800-207 badge, tech pills (Hyperledger Fabric · Syft · Cosign · OPA · Claude), labeled **DEMO** artifact verifier, particles, orbs, horizon |
| 2 | Engine / Zero-Trust grid | `#engine-spec` | 6-layer verification grid |
| 3 | Storage | `#storage` | Encrypted storage (AES-256-GCM envelope) |
| 4 | Pipeline | `#pipeline` | Async verification queue |
| 5 | Defense / Proof | `#verify` | Magic-byte / forgery defense |
| 6 | Telemetry | `#telemetry` | Continuous monitoring |
| 7 | Remediation | `#remediation` | FLAGGED/BLOCKED containment |
| 8 | Trust | `#trust` | State machines / never-fake states |
| 9 | Integrations | `#integrations` | Ecosystem |
| 10 | FAQ | `#faq` | Accordion, a11y |
| 11 | CTA | `#cta` | Honest early-access form |

### What shipped since the superseded snapshot
- **Modularized** — inline `<style>`/`<script>` extracted to `css/style.css` (1,962 lines) + `js/app.js` (1,223 lines); `index.html` now only 628 lines and links them with cache-busted `?v=20`.
- **CSP** — strict Content-Security-Policy meta tag; **zero inline styles** (`grep 'style="'` → 0).
- **Honest submit pipeline** — `FORM_ENDPOINT` handler in `js/app.js` with honeypot, double-submit lock, 8s timeout, offline `mailto:` fallback, focusable errors, **no PII in browser storage**.
- **A11y** — skip-link, `aria-invalid`/`aria-describedby` form states, mobile hamburger + drawer (`#mobileDrawer`), `prefers-reduced-motion` respected.
- **SEO/social** — canonical URL, `robots.txt`, `sitemap.xml`, branded 404 (`404.html`), OG/Twitter 1200×630 `assets/og-card.png`, `logo@2x.png` retina + `srcset`.
- **Truth-first** — demo verifier is explicitly labeled **DEMO**; no fake states; all CTAs route to `#cta` and autofocus.

### Verified live (HTTP checks)
`/` → 200 · `/css/style.css` → 200 · `/js/app.js` → 200 · `/assets/logo.png` → 200 · `/nonexistent` → 200 (404 page) — zero dead links, zero hotlinked images (all local assets now).

---

## 3. Platform — Verification Engine

### Architecture
- **Data** — Prisma schema: `Vendor` · `Document` · `VerificationEvent` (append-only).
- **API routes** (`src/app/api/`): `health` · `vendors` · `vendors/:id` · `.../documents` · `.../verify` · `.../bytes` · `.../verification` · `supply-chain/latest`.
- **Libraries** (`src/lib/`):
  - `crypto/` — envelope AES-256-GCM, PAN encryption + masking, magic-byte validation.
  - `verification/` — adapter interface, sandbox GSTIN (genuine **mod-36 Luhn checksum**), GSTN adapter (stub → `NotConfiguredError`).
  - `queue/` — BullMQ worker, 3 retries + backoff, DLQ, **fail-closed** boot (prod dies without Redis).
  - `ocr/` — credential cross-check → `FLAGGED` on mismatch (PDF text layer).
  - `storage/` — local-encrypted | S3 driver, audited retrieval.
  - `auth.ts` — timing-safe admin guard + actor attribution; `rate-limiter.ts`.
  - `validation/` — Zod official GST/PAN formats + cross-consistency.

### State machines (no state skips)
- **VendorStatus** — `UNVERIFIED → PENDING → IN_PROGRESS → VERIFIED`; `IN_PROGRESS → FLAGGED` → `BLOCKED`. Only intake sets PENDING; only adapter verdicts set VERIFIED; only OCR evidence sets FLAGGED.
- **DocumentStatus** — `STORED → PENDING → VERIFIED | REJECTED`; `→ FLAGGED` via OCR mismatch.

### Security model
- Envelope encryption (per-doc DEK wrapped by KEK), PAN never plaintext (`AB******4F`), decrypted buffers zeroed in memory (`buffer.fill(0)`), every byte read = audited `ADMIN_READ` event, `no-store` headers, timing-safe admin guard, rate limiting (30 req/min/IP), fail-closed prod boot.

### Module 2, Slice 1 — Supply-Chain Self-Attestation (latest commit `5d92a90`)
- `scripts/sbom.sh` (Syft, pinned), `scripts/sign.sh` (Cosign), `scripts/verify.sh`.
- `GET /api/supply-chain/latest` — **computes** verification at request time by spawning `verify.sh`; never stores/caches the verdict ("TRUTH RULE"); honest 404 when no attestation; `no-store`.

### Tests (13 suites)
`actor-attribution` · `adapter` · `crypto` · `document-intake` · `fail-closed-boot` · `guard` · `health` · `ocr-intelligence` · `pipeline-e2e` · `queue-worker` · `storage-bytes` · `supply-chain` · `vendor-registration`.

Coverage includes: forgery (exe-as-PDF rejected), GST mod-36 checksum + determinism, envelope tamper-failure, PAN masking, DLQ after 3 retries, fail-closed boot, timing-safe guard, rate limit, audited byte retrieval + 410-on-missing-object, full vendor lifecycle, supply-chain attestation (401/404/verified:false).

> README claims **50/50 green (13 suites)** on a clean checkout (10 Aug). I did not re-run the full platform suite here (requires `npm ci` in `platform/` plus Docker for postgres/redis) — happy to run it on request.

---

## 4. Feature Matrix (from README — current truth)

| Feature | Status |
|---|---|
| Vendor registration (GST/PAN formats + cross-check) | ✅ Shipped |
| Document intake — magic bytes, 5MB cap, SHA-256 | ✅ Shipped |
| Envelope AES-256-GCM (DEK↔KEK) | ✅ Shipped |
| PAN encrypted at rest, masked on reads | ✅ Shipped |
| GSTIN mod-36 checksum | 🧪 Sandbox |
| GSTN adapter (live) | 🧪 Sandbox (stub) |
| Async queue, 3 retries, DLQ | ✅ Shipped |
| OCR credential cross-check → FLAGGED | ✅ Shipped (PDF) |
| Image OCR (PNG/JPEG) | 🔜 Roadmap (Slice 4) |
| Audited byte retrieval | ✅ Shipped |
| Multi-actor admin attribution | ✅ Shipped |
| Real OIDC | 🔜 Roadmap (Slice 4) |
| Fail-closed prod boot | ✅ Shipped |
| Storage local-encrypted / MinIO | ✅ / 🧪 local |
| Landing: labeled demo, no dead links, CSP, honest form | ✅ Shipped |
| Syft SBOM + Cosign signing | ✅ Shipped (M2-S1) |
| Continuous trust scoring | 🔜 Roadmap (M3) |
| Immutable transaction ledger | 🔜 Roadmap (M4) |

---

## 5. Roadmap / Next

- **Slice 4** (Module 1 completion): live GSTN credential wiring, OIDC provider, image OCR (PNG/JPEG).
- **Module 2, Slice 2**: vendor artifact SBOM intake (POST upload → syft → encrypted storage).
- **Module 3**: continuous trust scoring.
- **Module 4**: immutable ledger for transactions & disputation.

---

## 6. How to Run (live)

**Landing (currently running):**
```bash
npm run dev   # → http://localhost:5173  (live preview in the Arena panel)
```

**Platform:**
```bash
cd platform
docker compose up -d          # postgres + redis (health-checked)
cp .env.example .env          # set KEK_MASTER_KEY (64 hex), ADMIN_API_KEY
npx prisma migrate deploy
npm ci && npm run dev         # → http://localhost:3001
```

---

*Note: root `ANALYSIS.md` (07 Aug) is superseded; this doc reflects HEAD `5d92a90`.*
