# VENDORCHAIN — BUILD AGENT MASTER PROMPT
## MODULE 1 — ZERO-TRUST ONBOARDING · SLICE 1: SECURE FOUNDATION

> Issued: 09 Aug 2026 · Prerequisites: Landing P1–P3 instructor-PASSed (PR #4, owner merge pending — sovereign timeline) · Gate: instructor audit of the PR ref

---

## 0. CONTEXT & BASE DECISION
VendorChain = Zero-Trust B2B vendor verification. DNA: **"Never Trust.
Always Verify. Continuously Monitor."** The landing page is complete and
verified. This work order lays the FIRST brick of the actual platform:
vendor registration + encrypted document intake. No verification logic
yet — we secure the floor before we build the walls.

- BASE DECISION — pick exactly ONE, state it in your report:
  (A) **RECOMMENDED**: new sibling repo `vendorchain-platform` (landing
      stays untouched), OR
  (B) monorepo: scaffold under `platform/` in the current repo; landing
      root files (index.html, css/, js/, assets/) are OFF-LIMITS.
- TRUTH RULE (inherited from all landing phases): you may simulate a
  DEMO, never a RESULT. Verification statuses advance ONLY through code
  that actually checked something.

## 1. LOCKED STACK (do not substitute)
Next.js 14+ (App Router) · TypeScript **strict** (zero `any`) ·
PostgreSQL 15 via docker-compose · Prisma · Zod · pino (logs).
Redis/BullMQ/auth-provider/S3: NOT THIS SLICE (Slice 2+).
Dependency allowlist (exact pinned versions only): next, react,
react-dom, typescript, prisma, @prisma/client, pg, zod, pino,
pino-pretty (dev), vitest OR node:test, supertest (dev). Anything else
requires written justification inside the PR description.

## 2. BUILD ITEMS

### F1 — SCAFFOLD & WALLS
Next.js App Router + strict TS + eslint. `GET /health` → build SHA from
env. `docker-compose.yml`: postgres:15 + named volume + healthcheck.
`.env.example`: DATABASE_URL, KEK_MASTER_KEY, STORAGE_DIR. NO real
secrets committed, ever.

### F2 — SCHEMA (Prisma) — every field against the threat model
- **Vendor**: id(cuid), legalName, gstNumber (15-char alnum, format-regex,
  unique), panEncrypted (never plaintext column), status enum
  VendorStatus[UNVERIFIED, PENDING, IN_PROGRESS, VERIFIED, FAILED,
  FLAGGED, BLOCKED] default UNVERIFIED, timestamps.
- **Document**: id, vendorId FK (Restrict), type enum[GST_CERT, PAN_CARD,
  BANK_PROOF], storagePath, sha256, dekWrapped, iv, authTag, status
  (same enum), uploadedAt.
- **VerificationEvent**: id, vendorId, actor, fromStatus, toStatus,
  reason, createdAt — APPEND-ONLY (no update/delete code paths exist).
  This is your future audit trail — the seed of Module 4.

### F3 — REGISTRATION API
POST /api/vendors — Zod validation (GST 15-char + PAN 10-char official
formats); 400 invalid, 409 duplicate, 201 creates Vendor +
VerificationEvent(→UNVERIFIED). GET /api/vendors/:id — returns vendor
WITHOUT document bytes, PAN masked (first 2 + last 2 chars only).

### F4 — ENCRYPTED DOCUMENT INTAKE
POST /api/vendors/:id/documents — multipart ≤ 5MB; allow PDF/JPG/PNG by
**MAGIC BYTES** (never extension or claimed MIME); compute SHA-256;
envelope encryption **AES-256-GCM** — random per-document DEK, DEK
wrapped by env KEK; store ciphertext + wrapped DEK + iv + authTag;
status → PENDING + VerificationEvent. GET returns metadata only — byte
retrieval does NOT exist in this slice (it's earned in a later slice,
behind verification). Logs redact filenames/PII.

### F5 — ACCESS GUARD (placeholder, honestly labeled)
All /api routes except /health require `x-admin-key` header vs env
ADMIN_API_KEY, compared with `crypto.timingSafeEqual`. README marks this
a placeholder for real IdP (Slice 3). No public signup in this slice.

### F6 — HARDENING BASELINE
Security headers via next.config (nosniff, frame-deny, referrer-policy).
JSON body cap 1MB. Naive per-IP rate limit 30 req/min (header responses
documented; Redis upgrade = Slice 2). pino JSON logging with redact
paths (req.headers.authorization, body.pan*, body.gst beyond masked).

## 3. NON-NEGOTIABLES
- Strict TS, zero `any`, zero console.log (pino only), zero plaintext
  PII at rest anywhere — magic bytes enforced, deps pinned
- docker-compose must boot a working system from an EMPTY volume
- TRUTH RULE; every route has at least one test

## 4. DONE-WHEN (paste every output — all must pass)
1. `docker compose up -d` clean from empty volume + migrations apply
2. `npm run build` → exit 0 under strict TS
3. POST vendor: invalid GST → 400 (Zod detail) · valid → 201 · dupe → 409
4. Upload renamed .exe (forged .pdf extension) → REJECTED (magic bytes);
   real small PDF → stored; `xxd <stored> | head` shows ciphertext only
5. DB query: PAN column unreadable; GET /:id → masked PAN only
6. Any /api route without key → 401 · `grep -R "console.log" src` → 0
7. README contains the VendorStatus state machine (text diagram) +
   which code paths may cause which transition

## 5. REPORT BACK
PR # · branch · commit hashes · ALL outputs · deviations+reasons.
Developer answers, in own words (2 sentences): "Why did we encrypt
BEFORE we verify, and why is PAN masked even to admins by default?"
OUT OF SCOPE — PR rejected if present: govt/GST portal calls, OCR,
Redis/BullMQ, auth UI, S3. List as Slice-2 proposals only.
