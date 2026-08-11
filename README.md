# VendorChain — Zero-Trust B2B Vendor Verification

**Never trust. Always verify. Continuously monitor.**

VendorChain eliminates assumed, static trust in B2B vendor relationships: vendors are verified at the boundary, every document is encrypted before it is trusted, every access is an audited event, and no status ever advances unless code actually checked something.

> Stack: Vite 5 (landing) · Next.js 14.2.5 + TypeScript strict (platform) · PostgreSQL 15 · Redis 7 + BullMQ · Prisma · Zod · 44/44 tests green on `main` · License: see below

---

## The Problem → The Answer

B2B onboarding runs on assumed trust: a vendor emails a GST certificate, someone eyeballs it, and the relationship proceeds on faith. Forged documents, stale credentials, and silent status games cost enterprises real money — and nobody finds out until the dispute.

VendorChain inverts the model. Identity claims are validated (against deterministic, checksum-driven government-shaped verification — sandboxed today, GSTN-wired tomorrow). Documents are encrypted with envelope AES-256-GCM **at the moment of intake**, before any trust decision exists. Every state change — and every human read — lands in an append-only audit trail.

The landing site follows the same rule as the platform: **no fake states, anywhere.** The hero's on-chain verifier is an explicitly labeled demo; the early-access form fails honestly rather than pretending to capture. This repository is built the way it claims the world should run.

---

## What's Inside

```
landing-page-/                  # one repo, two deliverables
├── index.html                  # ✅ landing (12 sections, dark premium, a11y)
├── css/ js/ assets/            # tokens, interactions, logo + OG card (1200×630)
├── 404.html robots.txt sitemap.xml SECURITY.md CHANGELOG.md
├── platform/                   # ✅ verification engine (the actual product)
│   ├── prisma/                 # Vendor · Document · VerificationEvent (append-only)
│   ├── src/app/api/            # health · vendors · documents · verify · bytes · verification
│   ├── src/lib/
│   │   ├── crypto/             # envelope AES-256-GCM, PAN encryption, magic bytes
│   │   ├── verification/       # adapter interface · sandbox GSTIN (mod-36 checksum)
│   │   ├── queue/              # BullMQ worker, retries, DLQ, fail-closed boot
│   │   ├── ocr/                # credential cross-check → FLAGGED on mismatch
│   │   ├── storage/            # local-encrypted | S3 driver, audited retrieval
│   │   ├── auth.ts             # timing-safe admin guard + actor attribution
│   │   └── validation/         # Zod: official GST/PAN formats + cross-consistency
│   └── docker-compose.yml      # postgres:15-alpine + redis:7-alpine + MinIO
└── docs/agent-prompts/         # the work-order protocol this repo was built under
```

## Feature Matrix

| Feature | Status | Where |
|---|---|---|
| Vendor registration (GST/PAN official formats + cross-check) | ✅ Shipped | `platform/src/lib/validation/vendor.ts` |
| Document intake — magic-byte validation, 5MB cap, SHA-256 | ✅ Shipped | `lib/crypto/magic-bytes.ts` |
| Envelope encryption AES-256-GCM (per-doc DEK wrapped by KEK) | ✅ Shipped | `lib/crypto/envelope.ts` |
| No plaintext PII at rest — PAN encrypted, always masked on reads | ✅ Shipped | `lib/crypto/pan-encryption.ts` |
| GSTIN checksum verification (genuine mod-36 algorithm) | 🧪 Sandbox | `lib/verification/gst-checksum.ts` |
| Government portal adapter (GSTN) | 🧪 Sandbox | `gst-sandbox-adapter.ts` · `gstn-adapter.ts` throws `NotConfiguredError` |
| Async verification pipeline (queue, 3 retries + backoff, DLQ) | ✅ Shipped | `lib/queue/worker.ts` |
| OCR credential cross-check → doc + vendor `FLAGGED` on mismatch | ✅ Shipped (PDF text-layer) | `lib/ocr/extractor.ts` |
| Image OCR (PNG/JPEG) | 🔜 Roadmap (Slice 4) | images route to FLAGGED/manual review today |
| Audited byte retrieval (`ADMIN_READ` event + `no-store`) | ✅ Shipped | `app/api/.../bytes/route.ts` |
| Multi-actor admin attribution (`admin:<keyName>`) | ✅ Shipped | `lib/auth.ts` |
| Real OIDC provider | 🔜 Roadmap (Slice 4) | placeholder guard, honestly labeled |
| Fail-closed prod boot (no Redis → process dies loudly) | ✅ Shipped | `lib/queue/boot-check.ts` |
| Storage driver: local-encrypted / MinIO (S3-compatible) | ✅ / 🧪 local | `lib/storage/` |
| Landing: labeled demo verifier, zero dead links, CSP, honest form | ✅ Shipped | `index.html`, `js/app.js` |
| Syft SBOM + Cosign signing (Module 2, Slice 1) | ✅ Shipped | `platform/scripts/sbom.sh`, `sign.sh`, `verify.sh`; `platform/src/app/api/supply-chain/latest/route.ts` |
| Automated Vulnerability Policy Engine (Module 2, Slice 2) — CycloneDX scan → PASS/WARN/BLOCK | ✅ Shipped | `platform/src/lib/supply-chain/cve-scanner.ts`, `vulnerability-catalog.ts`; `scanResult` in `/api/supply-chain/latest` |
| Continuous Behavioral Trust Scoring (Module 3, Slice 1) — 0-100 composite, TrustTier, snapshots | ✅ Shipped | `platform/src/lib/trust-scoring/calculator.ts`; `GET /api/vendors/:id/trust-score`, `POST .../evaluate` |
| Continuous trust scoring (Module 3, Slice 1) | ✅ Shipped | `lib/trust-scoring/calculator.ts` + trust-score APIs |
| Immutable transaction ledger (Module 4) | 🔜 Roadmap | — |

## Request Lifecycle

```
upload ──▶ magic bytes OK? ──no──▶ 400 rejected (exe-as-pdf dies here)
          │yes
          ▼
   AES-256-GCM: random DEK ▸ encrypt ciphertext ▸ wrap DEK under KEK
          │
          ▼
   store ciphertext + iv + authTag ──▶ Document PENDING, Vendor PENDING
          │
          ▼  POST /verify (idempotent key)
   BullMQ worker (concurrency 2, 3 retries, DLQ)
          │
          ▼  decrypt IN MEMORY ONLY (buffer.fill(0) after)
   GstSandboxAdapter: GSTIN checksum + GST↔PAN embedding  (evidence.sandbox=true)
          │
          ▼  verdict
   OCR cross-check: doc's claimed PAN/GST === vendor's registered PAN/GST?
          │no                          │yes (all 3 doc types)
          ▼                            ▼
   doc FLAGGED · vendor FLAGGED   doc VERIFIED · vendor VERIFIED
          │                            │
          └──▶ VerificationEvent (append-only) ◀──┘
   Admin reads bytes? Another event: ADMIN_READ, actor-stamped.
```

## State Machines

**VendorStatus** — `UNVERIFIED → PENDING → IN_PROGRESS → VERIFIED`; `IN_PROGRESS → FLAGGED` (adapter/OCR evidence) → … `→ BLOCKED`.
Only intake may set `PENDING`; only adapter verdicts may set `VERIFIED`; only OCR evidence may set `FLAGGED`. No route exists to skip states.

**DocumentStatus** — `STORED → PENDING → VERIFIED | REJECTED`; `VERIFIED|PENDING → FLAGGED` via OCR mismatch. Same rule: transitions only through checked paths.

## Security Model

- **Envelope encryption (4 lines):** every document gets a fresh random 256-bit DEK; the DEK encrypts the file (AES-256-GCM, random IV, auth tag); the KEK (env, 32-byte) wraps the DEK with its *own* IV and tag; only ciphertext + wrapped DEK + tags touch disk.
- **PII discipline:** PAN has no plaintext column; API responses mask it (`AB******4F`); logs redact keys, PAN, GST; OCR raw text is never persisted.
- **Access:** `timingSafeEqual` admin guard; per-IP rate limit; security headers; CSP on the landing; **fail-closed**: production refuses to boot without Redis.
- **Honesty labels (read these):** 🧪 GST verification is a **deterministic sandbox** — not government-backed until GSTN credentials (Slice 4). 🧪 Admin guard is a placeholder for OIDC (Slice 4). 🧪 MinIO is local S3 emulation.

## Quickstart

### A — Landing (static)
```bash
npm ci && npm run dev          # http://localhost:5173
```

### B — Platform (API)
```bash
cd platform
docker compose up -d           # postgres + redis (health-checked)
cp .env.example .env           # set KEK_MASTER_KEY (64 hex), ADMIN_API_KEY
npx prisma migrate deploy
npm ci && npm run dev          # http://localhost:3000
```
```bash
curl localhost:3000/api/health                                   # → {"status":"ok", buildSha…}
curl -X POST localhost:3000/api/vendors \
  -H "x-admin-key: $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{"legalName":"Acme Pvt Ltd","gstNumber":"27ABCDE1234F1Z5","panNumber":"ABCDE1234F"}'
#   → 201, pan: "AB******4F"  (masked, always)
```
> Reqs: Node 20+, Docker. Verified by the maintainer agent: `npm ci` ✓ · `npm test` — **50/50 (13 suites)** ✓ · `npm run build` ✓ on a clean checkout (10 Aug 2026). Compose services defined and health-checked; bring Docker.

## Proof & Reproducibility

This project's claims are checkable, not admirable:

```bash
git archive origin/main | tar -x -C /tmp/vc && cd /tmp/vc/platform
cp .env.example .env && npm ci
npm test        # 50/50 — incl. forgery, DLQ, drift-guard, encryption, supply-chain tests
npm run build   # strict TS, exit 0
NODE_ENV=production node -e "require('./src/lib/queue/boot-check.ts')"
#               # without REDIS_URL → fatal exit (fail-closed, by design)
```

Zero caret-ranged runtime deps; lockfile-committed; `git status --porcelain` clean at release.

## Built Under an Audited Work-Order Protocol

Every phase was executed by AI agents **gated by instructor audits against the committed ref** — no summary accepted without grep-able, reproducible evidence. The full system — work orders, status board, PR-gate protocol, and the carry-over debt register — lives in [`docs/agent-prompts/`](./docs/agent-prompts/README.md).

| Phase | Delivered | Proof |
|---|---|---|
| P1 Trust & Integrity | honest demo verifier · zero dead links · OG/meta | `44677be` |
| P2 Conversion Core | accessible early-access form · honest submit pipeline | `d9f6131` |
| P3 Launch Hardening | CSP · 404 · robots/sitemap · SECURITY.md | `2703e09` |
| M1-S1 Foundation | schema · envelope crypto · registration API | `06a942b` |
| M1-S2 Verification | sandbox adapter · BullMQ pipeline · DLQ | `c76027d` |
| M1-S3 Intelligence | OCR cross-check · storage drivers · audited retrieval | `c3ba63b` + `8af6762` |
| M2-S1 Self-Attestation | Syft SBOM · Cosign sign/verify · honest API · CI gate | `fa70e6d` |

## API Reference

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/health`, `/api/health` | public | liveness + build SHA |
| POST | `/api/vendors` | admin-key | register (Zod GST/PAN; 400/409/201) |
| GET | `/api/vendors/:id` | admin-key | vendor, PAN masked |
| POST | `/api/vendors/:id/documents` | admin-key | intake ≤5MB, magic bytes, encrypted store |
| GET | `/api/vendors/:id/documents` | admin-key | metadata only |
| POST | `/api/vendors/:id/documents/:docId/verify` | admin-key | enqueue sandbox verification (idempotent) |
| GET | `/api/vendors/:id/verification` | admin-key | append-only event timeline |
| GET | `/api/vendors/:id/documents/:docId/bytes` | admin-key | decrypted stream, `no-store`, ADMIN_READ audit |
| GET | `/api/supply-chain/latest` | admin-key | runtime attestation verification (computed, not stored) |

## Threat Model → Mitigation

| Threat | Mitigation |
|---|---|
| T1 forged documents | magic-byte gate, OCR cross-check → FLAGGED, checksum adapter |
| T3 cross-vendor data access | envelope encryption, masked reads, guarded routes |
| T5 insider abuse | actor attribution, ADMIN_READ audit trail, masked PAN even for admins |
| T6 supply-chain attack | exact-pinned deps, lockfile, **SBOM + Cosign signing (M2-S1)** |
| T7 replay of verifications | idempotency keys, append-only events |
| T8 session spoofing | timing-safe guard today; OIDC roadmap (S4) |

## Roadmap

**Slice 4** (Module 1 completion): real GSTN credentials wiring, OIDC provider, image OCR. **Module 2, Slice 2:** vendor artifact SBOM intake (POST upload → syft scan → encrypted storage). **Module 3, Slice 2:** trust scoring expansion (probation curve, SLA telemetry feed). **Module 4:** immutable ledger for transactions & disputation.

## License & Disclaimer

Portfolio/educational build. Sandbox verification is structural simulation — **not** government verification. Do not point at real vendor PII without completing Slice 4 hardening.
