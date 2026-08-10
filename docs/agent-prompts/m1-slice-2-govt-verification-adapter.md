# VENDORCHAIN — BUILD AGENT MASTER PROMPT
## MODULE 1 — ZERO-TRUST ONBOARDING · SLICE 2: GOVERNMENT VERIFICATION ADAPTER + ASYNC PIPELINE

> Issued: 09 Aug 2026 · Prerequisites: M1-S1 instructor-PASSed (commit 06a942b) · Gate: instructor audit of the PR ref

---

## 0. CHAIN CHECK (first, always)
- Work continues in `platform/` of branch `arena/019fe739-landing-page`.
- Verify: `grep -c "panEncrypted" platform/prisma/schema.prisma` ≥ 1 AND
  `npm test` in platform/ → 25/25 green BEFORE starting. If not: STOP,
  report "M1-S1 chain break."
- TRUTH RULE — SPECIAL CLAUSE FOR THIS SLICE: you are building a SANDBOX
  verification adapter. It must be structurally real and honestly labeled.
  A fabricated "government response" is an instant PR rejection.
  `VERIFIED` may be written ONLY by adapter result code paths.

## 1. MISSION
Vendors currently sit at PENDING forever. Give documents a real (sandbox)
verification journey: queue → adapter → verdict → status transition with
append-only evidence. Government-API-shaped, without pretending to be the
government.

## 2. BUILD ITEMS

### F1 — VERIFICATION ADAPTER INTERFACE (src/lib/verification/)
- `interface VerificationAdapter { name: string; verify(doc: VerificationJob):
  Promise<VerificationVerdict> }`; Verdict = { outcome: 'VERIFIED' | 'FAILED',
  confidence: 0-1, evidence: Record<string,unknown>, adapterName, checkedAt }.
- `GstSandboxAdapter`: deterministic, honest sandbox — validates GST checksum
  char (15th), re-checks GST↔PAN embedding, simulates latency 300–800ms,
  clearly stamps `evidence.sandbox: true`. NO random verdicts: same input →
  same outcome (checksum-driven). Real adapter (`GstnAdapter`) may exist as
  an interface stub ONLY, throwing `NotConfiguredError` — never fake it.

### F2 — QUEUE (Redis 7 + BullMQ)
- docker-compose: add redis:7-alpine + healthcheck + volume.
- POST /api/vendors/:id/documents/:docId/verify → enqueue job (idempotent
  key = vendorId+docId+sha256), vendor status → IN_PROGRESS + event.
- Worker: concurrency 2, retries 3 with exponential backoff, dead-letter
  queue after final failure; job logs redacted.

### F3 — VERDICT PROCESSING
On VERIFIED: document status VERIFIED; IF all 3 required doc types for the
vendor are VERIFIED → vendor VERIFIED (event with adapter+evidence SHA).
On FAILED: document FAILED + reason; vendor stays IN_PROGRESS. Every
transition = VerificationEvent(actor=adapter name, evidenceSha, reason).
Decryption for verification happens **in memory only** — plaintext never
touches disk or logs (buffer zeroed after use).

### F4 — STATUS & HONESTY SURFACE
GET /api/vendors/:id/verification → timeline of events, adapter names,
sandbox flags, current state. README: big visible note "Verification
running in SANDBOX mode — not government-backed until GSTN credentials"
+ the exact env flag (`VERIFICATION_ADAPTER=sandbox|gstn`).

### F5 — REGRESSION + NEW-DEPS DISCIPLINE
Allowlist additions ONLY: bullmq, ioredis — pinned. All M1-S1 invariants
re-verified in DONE-WHEN. No plaintext PII anywhere — new redact paths
for evidence payloads.

## 3. DONE-WHEN (paste every output)
1. Chain check greps + pre-existing 25/25 still green (updated suite ≥ 25,
   new tests: adapter determinism, idempotent enqueue, retry/DLQ,
   transition rules, in-memory decrypt leaves nothing on disk)
2. `docker compose up -d` boots postgres+redis healthy from empty volumes
3. End-to-end (curl or test): register → upload 3 docs → enqueue → vendor
   reaches VERIFIED with 3 VerificationEvents stamped `sandbox: true`
4. Tampered GST checksum → FAILED verdict, vendor NOT verified, reason
   recorded — prove same input → same verdict twice (determinism)
5. Kill worker mid-job → job retries; 4th failure → DLQ (test output)
6. grep evidence: `grep -rn "sandbox" README.md` shows honesty note;
   `grep -rn "VERIFIED" src | grep -v adapter | grep -v test | grep -v
   lib/verification` → only enum/transition-processor references
7. `npm run build` exit 0 strict TS

## 4. REPORT BACK
PR # · branch · commits · ALL outputs · deviations. Own-words answer:
"Why must the sandbox adapter be deterministic, and what would a random
sandbox verdict teach the system to do?"
OUT OF SCOPE (rejected if present): real GSTN/NSDL network calls, OCR
extraction (Slice 3), S3, auth UI. Proposals only.
