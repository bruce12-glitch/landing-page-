# VendorChain Platform — Module 1: Zero-Trust Onboarding
## Slice 2: Government Verification Adapter + Async Pipeline

> ⚠️ **SANDBOX HONESTY NOTICE**:  
> **SANDBOX MODE — NOT GOVERNMENT-BACKED.**  
> The `GstSandboxAdapter` provides a structurally faithful, deterministic simulation of government GSTN identity verification. It calculates genuine GST checksums (Luhn Mod-36) and validates cross-credential alignment, but does **not** call live Indian Government tax servers. Live production calls are stubbed in `GstnAdapter` and require production e-Way/GSTN credentials in a later operational slice.

---

## 1. Environment & Adapter Configuration

The verification pipeline supports dynamic adapter switching via the `VERIFICATION_ADAPTER` environment variable:

| `VERIFICATION_ADAPTER` | Implementation | Behavior |
|---|---|---|
| `sandbox` (Default) | `GstSandboxAdapter` | **Deterministic Sandbox Engine**: Validates Luhn Mod-36 GST checksums, verifies GST↔PAN alignment, inspects document payloads, and stamps `evidence.sandbox: true`. Same input **always** yields the identical verdict and evidence SHA. |
| `gstn` | `GstnAdapter` | **Government GSTN Portal Stub**: Explicitly throws `NotConfiguredError` ("GSTN Production Adapter not configured in this environment — set VERIFICATION_ADAPTER=sandbox for testing"). |

---

## 2. Core Question: Why must the sandbox be deterministic — what does a random verdict teach a system?

1. **Flawed Feedback Loops & Negative Learning**: A nondeterministic or randomized verification mock teaches upstream systems and developers that verification outcomes are arbitrary gambling rather than cryptographic proofs. It makes automated regression tests flaky, masks real validation failures, and prevents building reliable state machines.
2. **Reproducible Dispute & Audit Evidence**: In a Zero-Trust platform, verification records are permanent legal and compliance artifacts committed to audit ledgers. If submitting the exact same GST number or document produces `VERIFIED` on Tuesday and `FAILED` on Wednesday without underlying evidence changing, the audit trail is worthless. A deterministic sandbox guarantees that every verdict is mathematically verifiable from its inputs.

---

## 3. VendorStatus State Machine & Transition Rules

```
       ┌──────────────────────────────────────────────────────────┐
       │                                                          │
       ▼                                                          │
┌──────────────┐    Document Upload     ┌──────────────┐          │
│  UNVERIFIED  │ ─────────────────────► │   PENDING    │          │
└──────────────┘ (GST / PAN / Bank)     └──────────────┘          │
       │                                       │                  │
       │                                       │ POST .../verify  │
       │                                       ▼                  │
       │                                ┌──────────────┐          │
       │                                │ IN_PROGRESS  │ ◄────────┘
       │                                └──────────────┘ (Re-evaluation)
       │                                  /     │    \
       │                   ┌─────────────┘      │     └────────────┐
       │ All 3 Docs Pass   │ Single Doc Fail    │ Anomaly Review   │ Sanctions/Block
       ▼                   ▼                    ▼                  ▼
┌──────────────┐  ┌──────────────┐     ┌──────────────┐   ┌──────────────┐
│   VERIFIED   │  │    FAILED    │     │   FLAGGED    │   │   BLOCKED    │
└──────────────┘  └──────────────┘     └──────────────┘   └──────────────┘
```

### Traceability of `VERIFIED` State Writes
Under the **TRUTH RULE**, `VERIFIED` is written **ONLY** by adapter result code paths:
- In `src/lib/queue/worker.ts`:
  1. `verdict = await adapter.verify(job)`
  2. If `verdict.outcome === 'VERIFIED'`: `doc.status = 'VERIFIED'`
  3. When all 3 document types (`GST_CERT`, `PAN_CARD`, `BANK_PROOF`) are verified: `vendor.status = 'VERIFIED'`
  4. Appends immutable `VerificationEvent` with `actor: verdict.adapterName` and `evidenceSha: verdict.evidenceSha`.

---

## 4. Asynchronous Queue & Security Pipeline

- **Idempotency Key**: Generated as `${vendorId}:${docId}:${sha256}`. Re-submitting identical verification jobs returns existing status without redundant processing.
- **Worker Concurrency & Backoff**: Concurrency cap of 2, 3 automatic retries with exponential backoff (1s, 2s, 4s).
- **Dead-Letter Queue (DLQ)**: On the 4th failure (exhausted retries), jobs are routed to the DLQ (`verification-dlq`) for forensic inspection.
- **In-Memory Zero-Trust Decryption**: Documents are decrypted into ephemeral memory buffers; buffers are zeroed (`buffer.fill(0)`) immediately after adapter inspection. Plaintext is never saved to disk or logs.

---

## 5. API Endpoints (Slice 2)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/health` | `GET` | Public | Operational status and build SHA. |
| `/api/vendors` | `POST` | `x-admin-key` | Validates GST/PAN, encrypts PAN, creates `UNVERIFIED` vendor. |
| `/api/vendors/:id` | `GET` | `x-admin-key` | Retrieves vendor metadata with masked PAN (`AB******4F`). |
| `/api/vendors/:id/documents` | `POST` | `x-admin-key` | Validates magic bytes, envelope encrypts, advances to `PENDING`. |
| `/api/vendors/:id/documents` | `GET` | `x-admin-key` | Lists document metadata (no byte stream). |
| `/api/vendors/:id/documents/:docId/verify` | `POST` | `x-admin-key` | Enqueues verification job (`202 Accepted`), advances to `IN_PROGRESS`. |
| `/api/vendors/:id/verification` | `GET` | `x-admin-key` | Full audit timeline with adapter names and `sandbox: true` flags. |

---

## 6. Docker & Testing
```bash
# 1. Start PostgreSQL 15 & Redis 7
docker compose up -d

# 2. Run test suites
npm run test

# 3. Build Next.js strictly
npm run build
```
