# VendorChain Landing — Changelog

All notable changes across the hardening phases of the VendorChain Zero-Trust landing page.

## [Phase 4: Enterprise Procurement & Trust Dashboard (Control Plane)] - 2026-08-11
- **A — Shared Components** (`platform/src/app/components/`): `TrustGauge.tsx` (SVG radial gauge, emerald/blue/amber/crimson tier colors), `VerificationStatusBadge.tsx` (all 7 vendor + transaction states), `SbomViewer.tsx` (CycloneDX table with CVSS severity tags), `L2TransactionCard.tsx` (monospaced SHA-256 commitment + interactive Web-Crypto "Verify Hash").
- **B — Control Plane Screens**: `/dashboard` (Procurement Command Center — metrics, tier distribution, anomaly alerts, vendor index), `/onboarding` (interactive Zero-Trust stepper: Business Data → AES-256-GCM doc upload → OCR cross-check → animated Trust Score Reveal with visible crypto stages), `/vendors/[id]` (Cryptographic Vault — Trust Gauge, encrypted doc vault, supply chain/SBOM tab, L2 ledger with live "Raise Dispute"). Added `GET /api/dashboard/summary`.
- **C — Tests**: Added `platform/src/tests/dashboard-e2e.test.ts` (6 tests: full-stack register→3 docs→Tier 1 + dashboard summary, dispute E2E → DISPUTED + trust drop, TrustGauge colors, StatusBadge mapping, SbomViewer rendering, summary aggregation). Suite now **87/87 across 17 suites**.
  - *Proof*: `npm test --prefix platform` → `Test Files 17 passed · Tests 87 passed`.
  - *Proof*: `npm run build --prefix platform` → strict TS compile with **0 errors**.
  - *Proof*: live `GET /dashboard`, `/onboarding`, `/vendors/[id]` render on `:3001`; `/api/dashboard/summary` returns metrics.

## [Module 4, Slice 1: Transaction Management & Immutable Ledger Anchor] - 2026-08-11
- **A — Schema**: Added `TransactionStatus` enum (RECORDED, COMMITTED_L2, SETTLED, DISPUTED, RESOLVED) + `VendorTransaction` model (invoiceRef, amountCents, currency, stateHash, l2TxHash, l2BlockNumber, status, disputeReason; indexed by vendorId/stateHash/status); wired `transactions VendorTransaction[]` into `Vendor`. Mirrored in `db/client.ts`.
- **B — Ledger Engine**: `platform/src/lib/ledger/hasher.ts` — deterministic `computeTransactionStateHash()` (SHA-256 of vendorId ∥ invoiceRef ∥ amountCents ∥ currency ∥ nonce ∥ timestamp) + `verifyTransactionStateHash()`. `platform/src/lib/ledger/polygon-anchor.ts` — deterministic L2 tx hash + block via `anchorStateCommitment()` (simulated latency + receipts). **Commercial confidentiality:** only the hash is anchored — amount/terms never on-chain.
- **C — API**: `POST /transactions` (Zod validation, L2 anchor → COMMITTED_L2, actor-stamped event, replay protection 409), `GET /transactions` (paginated history), `POST /transactions/:txId/dispute` (marks DISPUTED + **dispute feedback loop** applying −25 trust penalty via shared `trust-scoring/service.ts`).
- **D — Tests**: Added `platform/src/tests/transaction-ledger.test.ts` (11 tests: hash determinism/1-cent variance, L2 anchor, dispute+event, score drop, replay 409, pagination, 401/400/404, deterministic receipt). Suite now **81/81 across 16 suites**.
  - *Proof*: `npm test --prefix platform` → `Test Files 16 passed · Tests 81 passed`.
  - *Proof*: live `POST /transactions` → `status: COMMITTED_L2`, `l2.txHash`; dispute → `afterScore` drop + `TIER_4_SUSPENDED`.

## [Module 3, Slice 1: Continuous Behavioral Trust Scoring Engine] - 2026-08-11
- **A — Schema**: Added `TrustTier` enum (TIER_1_CRITICAL … TIER_4_SUSPENDED) + append-only `TrustScoreSnapshot` model (composite/identity/supplyChain/behavior scores, penaltyDeduction, reasons, indexed on `[vendorId]` & `[calculatedAt]`) in `platform/prisma/schema.prisma`; mirrored in the in-memory `db/client.ts`.
- **B — Calculator**: `platform/src/lib/trust-scoring/calculator.ts` — `evaluateTrust()` implements the 35/45/20 weighted composite `C = clamp(0.35I + 0.45S + 0.20B − Penalties, 0, 100)` with identity age decay (−5/180d), unsigned-supply-chain cap (40), and the **Law of Asymmetric Trust** hard override (FLAGGED/BLOCKED/BLOCK → C ≤ 30, TIER_4_SUSPENDED). Plus tier definitions + remediation guidance.
- **C — API**: `GET /api/vendors/:id/trust-score` (latest snapshot, 30-day trend, tier definitions) and `POST /api/vendors/:id/trust-score/evaluate` (real-time compute → persist snapshot → actor-stamped immutable `VerificationEvent`).
- **D — Tests**: Added `platform/src/tests/trust-scoring.test.ts` (12 tests: pristine TIER_1, cliff-drop BLOCK, unsigned cap 40, age decay, E2E persist+event, FLAGGED/BLOCKED override, WARN non-override, boundary mapping, E2E GET, 401/404). Suite now **70/70 across 15 suites**.
  - *Proof*: `npm test --prefix platform` → `Test Files 15 passed · Tests 70 passed`.
  - *Proof*: `curl http://localhost:3001/api/vendors/<id>/trust-score` → live JSON with breakdown + tier.

## [Module 2, Slice 2: Vulnerability Policy Engine & Live Landing Wire-Up] - 2026-08-11
- **A — Protocol Reconciliation**: Replaced all `Hyperledger Fabric` references (hero, telemetry cards, chaincode audit, integrations marquee, FAQ, toast) with the Polygon L2 / Zero-Trust Cryptographic Ledger architecture. CSP stays strict — zero inline `style=` / event handlers.
  - *Proof*: `grep -ri "hyperledger" index.html js/app.js` → `0`
- **B — Live Verification Dogfooding**: `doVerify()` in `js/app.js` now fetches `/api/supply-chain/latest` and gracefully falls back to honest offline telemetry; renders genuine fields (Cosign Signature, SBOM Telemetry, Policy Verdict, L2 Ledger) in a new result panel + toast.
- **C — Vulnerability Policy Engine**: Added `platform/src/lib/supply-chain/cve-scanner.ts` + `vulnerability-catalog.ts` — parses CycloneDX SBOMs and enforces `PASS` / `WARN` / `BLOCK` based on CRITICAL/HIGH counts and weighted risk score (the "signed trojan" defense). `GET /api/supply-chain/latest` now returns `scanResult` + a fail-closed `status`.
  - *Proof*: `curl http://localhost:3001/api/supply-chain/latest` → `scanResult.policyVerdict` present.
- **D — Test Suite**: Added `platform/src/tests/supply-chain-policy.test.ts` (8 tests: clean PASS, critical BLOCK, HIGH WARN, version matching, malformed SBOM, unsigned FLAGGED, e2e schema, signed-trojan). Suite now **58/58 across 14 suites**.
  - *Proof*: `npm test --prefix platform` → `Test Files 14 passed · Tests 58 passed`

## [Phase 3: Launch Hardening] - 2026-08-09
- **F0 Carry-over Control**: Implemented 3-second minimum submit guard with active focus on `#formErrorSummary` and moved error list styling into CSS.
  - *Proof*: `grep -A 4 "formInitTime < 3000" js/app.js`
- **F1 Content Security Policy**: Added strict `<meta http-equiv="Content-Security-Policy">` with `default-src 'self'`, `style-src 'self' https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com`, `img-src 'self' data:`, `connect-src 'self'`, `base-uri 'self'`, `form-action 'self'`. Swept all inline styles in markup and scripts to zero.
  - *Proof*: `grep -c 'style="' index.html js/app.js` → `0`
- **F2 Branded 404 Page**: Added `404.html` with Zero-Trust error branding ("This route failed verification.") and quick recovery CTAs.
  - *Proof*: `ls 404.html`
- **F3 Link Sanitization**: Replaced all bare `href="#"` links with valid `#main` scroll targets.
  - *Proof*: `grep -o 'href="#"' index.html` → `0`
- **F4 Discovery Metadata**: Added canonical URL tag, `robots.txt`, and `sitemap.xml` with placeholder swap markers.
  - *Proof*: `ls robots.txt sitemap.xml`
- **F5 Security & Architecture Docs**: Published `SECURITY.md`, `CHANGELOG.md`, and refreshed `README.md`.
  - *Proof*: `ls SECURITY.md CHANGELOG.md`

## [Phase 2: Conversion Core] - 2026-08-09
- **F1 Accessible Early Access Form**: Built 3-field form (Name, Email, Company) in `#cta` with real `<label>` elements, `autocomplete` attributes, and `aria-invalid` / `aria-describedby` validation states.
  - *Proof*: `grep -c "aria-invalid\|aria-describedby" index.html` → `6`
- **F2 Honest Submit Pipeline**: Implemented `FORM_ENDPOINT` handler with honeypot spam guard, double-submission lock, offline fallback (`mailto:hello@vendorchain.io`), and 8s timeout with focusable states. Zero PII storage in browser storage.
  - *Proof*: `grep -c "FORM_ENDPOINT" js/app.js` → `3`
- **F3 CTA Discipline**: Routed all primary CTAs across nav, drawer, hero, and footer to scroll to `#cta` and auto-focus `#earlyAccessName`.
  - *Proof*: `grep -c 'href="#cta"' index.html`
- **F4 Trust Microcopy**: Added privacy pledge: *"No spam. One email when the Vendor Portal opens. We never share your details — verification is kind of our thing."*

## [Phase 1: Trust & Integrity Pass] - 2026-08-09
- **F1 Truth-First Verifier**: Replaced randomized verification simulation with explicit `DEMO` badge and fixed SHA-256 sample artifact validation.
  - *Proof*: `grep -c "SAMPLE_ARTIFACT_HASH" js/app.js` → `4`
- **F2 Zero Dead Links**: Eliminated all `/portal` and `/docs/*` 404 routes, converting unmapped links into accessible `Docs soon` badges.
  - *Proof*: `grep -o 'href="[^"]*"' index.html | sort -u` (zero dead links)
- **F3 OpenGraph Card**: Generated 1200×630 branded `assets/og-card.png` and absolute social metadata tags.
- **F4 Local Asset Sovereignty**: Removed hotlinked third-party images, replacing them with local CSS monogram avatar and inline SVG icon.
- **F5 Doc Hygiene**: Generated true 2x retina logo `assets/logo@2x.png` and prepended supersession notice to `ANALYSIS.md`.
