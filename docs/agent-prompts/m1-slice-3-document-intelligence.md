# VENDORCHAIN — BUILD AGENT MASTER PROMPT
## MODULE 1 · SLICE 3: DOCUMENT INTELLIGENCE + PRODUCTION STORAGE

> Issued: 09 Aug 2026 · Prerequisites: M1-S2 instructor-PASSed (commit c76027d) · Gate: instructor audit of the PR ref

---

## 0. CHAIN CHECK (first, always)
Continue in `platform/` on branch `arena/019fe739-landing-page`.
Before starting: `npm test` → 33/33 green AND
`grep -c "evidenceSha" src/lib/verification/types.ts` ≥ 1.
Else STOP: "M1-S2 chain break." TRUTH RULE stands; sandbox stays labeled.

## 0.5 F0 — CARRY-OVER DEBT (blocking, from S2 audit)
1. Exact-pin `bullmq` and `ioredis` in package.json (remove `^`),
   regenerate lockfile (`npm install` then commit package-lock.json).
2. FAIL-CLOSED QUEUE: if `NODE_ENV=production` and no reachable Redis
   (REDIS_URL unset/ping fails) → process exits non-zero at boot with a
   clear error. In-memory queue permitted ONLY under test|development,
   and logs a loud WARN at boot. Prove with a boot test.

## 1. MISSION
Turn verified-but-blind documents into cross-checked evidence: extract
the PAN/GST the document *claims*, compare against what the vendor
*registered*, and flag forgeries. Move storage behind an adapter and
open byte retrieval — audited, gated, no-store.

## 2. BUILD ITEMS

### F1 — OCR EXTRACTION WORKER (extends queue pipeline)
After adapter VERIFIED, enqueue `ocr-extract` job: decrypt in memory
(same fill(0) finally discipline) → extract PAN/GST patterns from
GST_CERT and PAN_CARD docs (tesseract.js for images; pdf text-layer
extraction for PDFs) → compare vs vendor.panEncrypted (decrypt to
compare, zero after) and gstNumber.
- Match → document stays VERIFIED, `evidence.ocr: {matched: true,
  fields: [...], confidence}` (hashes only, never raw OCR text).
- Mismatch → document **FLAGGED** (extend DocumentStatus: FLAGGED) +
  VerificationEvent(reason: which field mismatched) → vendor status
  **FLAGGED** (first flag). TRUTH RULE: extraction confidence
  thresholds documented; unknown-quality docs → FLAGGED, never guessed.
- REDACT OCR text from all logs; only field-match booleans + hashes.

### F2 — STORAGE ADAPTER + AUDITED BYTE RETRIEVAL
- `StorageDriver` interface {write, readStream, exists}; drivers:
  `local-encrypted` (current) and `s3` (MinIO in docker-compose,
  honestly labeled "local S3-compatible"). `STORAGE_DRIVER` env switch,
  default local.
- NEW endpoint `GET /api/vendors/:id/documents/:docId/bytes` —
  admin-key required; streams DECRYPTED bytes with
  `Cache-Control: no-store`; EVERY retrieval appends a
  VerificationEvent(actor, toStatus=current, reason: 'ADMIN_READ',
  evidence: {docSha, at}). Retrieval is an auditable act, not a
  convenience. 404 unknown doc, 410 if storage object missing.

### F3 — ACTOR ATTRIBUTION (step toward IdP)
Admin key compare gains per-key identity: keys live in env JSON
`ADMIN_KEYS={"analyst1":"...","auditor1":"..."}`; VerificationEvent.actor
records `admin:<keyName>` (never the key). Backward compatible with
single ADMIN_API_KEY (actor 'admin:default').

### F4 — DISCIPLINE
Allowlist additions ONLY (pinned): tesseract.js, @aws-sdk/client-s3,
pdf-parse (or pdfjs-dist — justify choice). All S1/S2 invariants
re-run. Sandbox labels unchanged.

## 3. DONE-WHEN (paste every output)
1. Chain greps ≥ S2 markers; suite ≥ 33, new tests: OCR match/mismatch,
   flag propagation, storage-driver parity (same bytes both drivers),
   audited retrieval event, prod fail-closed boot (exits non-zero)
2. E2E: register → docs → queue → OCR match → VERIFIED path green; then
   register with doc whose OCR'd PAN differs from claimed PAN →
   doc FLAGGED + vendor FLAGGED + event names the field
3. GET bytes with key → decrypted PDF/stream + DB shows new ADMIN_READ
   event with actor; response headers include no-store
4. `NODE_ENV=production REDIS_URL= npm start` (no redis) → non-zero exit
   + clear error line pasted
5. package.json: zero `^` on runtime deps; lockfile committed
6. grep -rn "ocr" logs/tests shows no raw OCR text persisted; raw-text
   greps of storage dir → ciphertext only
7. npm run build exit 0 strict

## 4. REPORT BACK
PR · branch · commits · outputs · deviations. Own words: "Why is
retrieval an auditable event rather than just a download endpoint?"
REJECTED IF PRESENT: real GSTN calls, public vendor-facing UI, real OIDC
(Next slice), unlabeled mocks. Proposals only.
