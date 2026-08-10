# VendorChain Platform — Module 1: Zero-Trust Onboarding
## Slice 3: Document Intelligence + Production Storage

> ⚠️ **SANDBOX HONESTY NOTICE**:  
> **SANDBOX MODE — NOT GOVERNMENT-BACKED.**  
> The `GstSandboxAdapter` provides a structurally faithful, deterministic simulation of government GSTN identity verification. It calculates genuine GST checksums (Luhn Mod-36) and validates cross-credential alignment, but does **not** call live Indian Government tax servers. Live production calls are stubbed in `GstnAdapter` and require production e-Way/GSTN credentials in a later operational slice.

---

## 1. Document Intelligence & OCR Architecture

- **Primary Path (PDF Text-Layer)**: Digital PDF documents are parsed in memory using `pdf-parse`. Extracted PAN and GSTIN numbers are cross-referenced against the vendor's registered credentials.
- **Image Documents (PNG / JPEG)**: Image docs: no OCR in Slice 3 → FLAGGED → manual review; real image OCR in Slice 4. PDF text-layer is the primary path.
- **Forgery Detection**: If extracted document credentials do not match registered credentials, both the document and vendor are immediately transitioned to `FLAGGED` status, with an append-only audit event recording the mismatched field.
- **Zero-Trust Memory Rule**: Decrypted document buffers are processed entirely in RAM and immediately zeroed out (`buffer.fill(0)`) in `finally` blocks. Raw OCR text is never logged or written to storage.

---

## 2. Core Question: Why is retrieval an auditable event rather than just a download endpoint?

1. **Chain of Custody & Non-Repudiation**: In a Zero-Trust compliance network, access to raw vendor identity evidence is sensitive. A plain, unaudited download endpoint allows stealth data harvesting, credential exfiltration, and unauthorized inspection without leaving an evidentiary trail. Treating retrieval as a first-class `VerificationEvent` (`reason: "ADMIN_READ"`, actor attribution, timestamp, SHA-256 evidence hash) guarantees non-repudiation: every viewing is permanently logged in the dispute ledger.
2. **Access Telemetry & Anomaly Detection**: By making byte retrieval an audited event, automated security monitors can immediately detect suspicious operational patterns (e.g., bulk downloads, unexpected off-hours access, or non-compliance personnel inspecting documents) and automatically trigger containment safeguards (`FLAGGED` or `BLOCKED` states).

---

## 3. Storage Driver Architecture & Audited Byte Retrieval

- **`StorageDriver` Interface**: Abstraction layer implemented by `LocalStorageDriver` (AES-256-GCM encrypted local volume) and `S3StorageDriver` (`@aws-sdk/client-s3`).
- **Dynamic Configuration**: Controlled via `STORAGE_DRIVER=local|s3` (default `local`).
- **Audited Byte Retrieval (`GET /api/vendors/:id/documents/:docId/bytes`)**:
  - Gated by `x-admin-key` with actor attribution (`admin:ops-lead`, `admin:compliance`, `admin:default`).
  - Streams decrypted bytes with `Content-Type` header (`application/pdf`, `image/png`, `image/jpeg`).
  - Response headers: `Cache-Control: no-store, no-cache, must-revalidate`.
  - **Every single read** appends an immutable `VerificationEvent` (`reason: "ADMIN_READ"`, `actor: authResult.actor`, `evidenceSha: doc.sha256`).

---

## 4. VendorStatus State Machine & Transition Rules

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
       │ All 3 Docs Pass   │ Single Doc Fail    │ OCR / Anomaly    │ Sanctions/Block
       ▼                   ▼                    ▼                  ▼
┌──────────────┐  ┌──────────────┐     ┌──────────────┐   ┌──────────────┐
│   VERIFIED   │  │    FAILED    │     │   FLAGGED    │   │   BLOCKED    │
└──────────────┘  └──────────────┘     └──────────────┘   └──────────────┘
```

---

## 5. API Endpoints

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/health` | `GET` | Public | Operational status and build SHA. |
| `/api/vendors` | `POST` | `x-admin-key` | Validates GST/PAN, encrypts PAN, creates `UNVERIFIED` vendor. |
| `/api/vendors/:id` | `GET` | `x-admin-key` | Retrieves vendor metadata with masked PAN (`AB******4F`). |
| `/api/vendors/:id/documents` | `POST` | `x-admin-key` | Validates magic bytes, envelope encrypts, advances to `PENDING`. |
| `/api/vendors/:id/documents` | `GET` | `x-admin-key` | Lists document metadata (no byte stream). |
| `/api/vendors/:id/documents/:docId/verify` | `POST` | `x-admin-key` | Enqueues verification job (`202 Accepted`), advances to `IN_PROGRESS`. |
| `/api/vendors/:id/documents/:docId/bytes` | `GET` | `x-admin-key` | Streams decrypted bytes; appends audited `ADMIN_READ` event. |
| `/api/vendors/:id/verification` | `GET` | `x-admin-key` | Full audit timeline with adapter names and `sandbox: true` flags. |

---

## 6. Supply-Chain Self-Attestation (Module 2, Slice 1)

Every platform build is attested with a CycloneDX SBOM and cosign signature.

| Command | Purpose | Tool | Mode |
|---|---|---|---|
| `npm run sbom` | Generate CycloneDX SBOM from `package-lock.json` | Syft v1.12.2 | CI + local |
| `npm run sign` | Sign SBOM + dist tarball | Cosign | Dev keypair OR CI keyless |
| `npm run verify` | Verify signatures at runtime | Cosign | Dev key OR GitHub OIDC |

### Dev Setup
```bash
# Generate dev keypair (cosign.key is gitignored, cosign.pub is committed)
cosign generate-key-pair
npm run sbom && npm run sign && npm run verify
```

### Honest API
`GET /api/supply-chain/latest` (admin-key required) returns:
```json
{
  "gitSha": "abc123...",
  "sbomSha256": "sha256:...",
  "signaturePresent": true,
  "verified": true,
  "verifiedAt": "2026-08-10T10:00:00.000Z"
}
```

**TRUTH RULE**: `verified` is computed by **spawning `verify.sh` at request time**. It is never a stored claim. No attestation → honest 404.

## 7. Docker & Testing
```bash
# 1. Start PostgreSQL 15, Redis 7 & MinIO
docker compose up -d

# 2. Run test suites (baseline 44 + Module 2 tests)
npm run test

# 3. Build Next.js strictly
npm run build

# 4. Supply-chain attestation (requires syft + cosign)
npm run sbom && npm run sign && npm run verify
```
