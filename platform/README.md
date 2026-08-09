# VendorChain Platform — Module 1: Zero-Trust Onboarding
## Slice 1: Secure Foundation — Registration + Encrypted Intake

> **Zero-Trust Prime Directive**: *"Never Trust. Always Verify. Continuously Monitor."*  
> Slice 1 establishes the foundational layer: cryptographically secure vendor identity registration and envelope-encrypted document intake. No verification decisions or trust elevations occur until evidence is securely ingested and sealed.

---

## 1. VendorStatus State Machine

Vendors transition through discrete verification lifecycle states. Under the Zero-Trust rule, state transitions occur **only** through code that actually verified a cryptographic or compliance condition.

```
       ┌──────────────────────────────────────────────────────────┐
       │                                                          │
       ▼                                                          │
┌──────────────┐    Document Upload     ┌──────────────┐          │
│  UNVERIFIED  │ ─────────────────────► │   PENDING    │          │
└──────────────┘ (GST / PAN / Bank)     └──────────────┘          │
       │                                       │                  │
       │                                       │ Pipeline Pick    │
       │                                       ▼                  │
       │                                ┌──────────────┐          │
       │                                │ IN_PROGRESS  │ ◄────────┘
       │                                └──────────────┘ (Re-evaluation)
       │                                  /     │    \
       │                   ┌─────────────┘      │     └────────────┐
       │ Policy Pass       │ AI/Sig Fail        │ Critical Flag    │ Manual Hold
       ▼                   ▼                    ▼                  ▼
┌──────────────┐  ┌──────────────┐     ┌──────────────┐   ┌──────────────┐
│   VERIFIED   │  │    FAILED    │     │   FLAGGED    │   │   BLOCKED    │
└──────────────┘  └──────────────┘     └──────────────┘   └──────────────┘
```

### Allowed State Transitions
| From Status | Allowed To Status | Triggering Mechanism / Subsystem |
|---|---|---|
| `UNVERIFIED` | `PENDING` | Ingestion of required identity document (`POST /api/vendors/:id/documents`). |
| `UNVERIFIED` | `BLOCKED` | Sanctions match or explicit compliance block. |
| `PENDING` | `IN_PROGRESS` | Background worker initiates verification pipeline (Slice 2). |
| `IN_PROGRESS` | `VERIFIED` | All cryptographic seals (Cosign), OPA Rego rules, and AI checks pass. |
| `IN_PROGRESS` | `FAILED` | Policy evaluation denial (expired cert, non-compliant license). |
| `IN_PROGRESS` | `FLAGGED` | Anomaly detection or manual compliance review requirement. |
| `IN_PROGRESS` | `BLOCKED` | Malicious payload, revoked certificate, or forged GST/PAN. |
| `FAILED` | `IN_PROGRESS` | Vendor re-submits rectified artifact for re-evaluation. |
| `FLAGGED` | `IN_PROGRESS` | Compliance officer clears anomaly review. |
| `FLAGGED` | `BLOCKED` | Fraud confirmed. |

---

## 2. API Specifications

All endpoints (except `/api/health` and `/health`) require the `x-admin-key` header, verified with `crypto.timingSafeEqual`. (This header is a Slice 1 placeholder for full IdP integration in Slice 3).

### A. Health Check
- **`GET /api/health`** (or `GET /health`)
- **Headers**: Public (no auth required)
- **Response `200 OK`**:
```json
{
  "status": "UP",
  "buildSha": "019fe739-slice-1",
  "timestamp": "2026-08-09T17:15:00.000Z",
  "service": "vendorchain-platform",
  "version": "0.1.0"
}
```

### B. Vendor Registration
- **`POST /api/vendors`**
- **Headers**: `x-admin-key: <ADMIN_API_KEY>`, `Content-Type: application/json`
- **Request Body**:
```json
{
  "legalName": "Acme Cyber Defense Private Limited",
  "gstNumber": "27ABCDE1234F1Z5",
  "panNumber": "ABCDE1234F"
}
```
- **Validation**:
  - GST format: 15-character official Indian GSTIN regex.
  - PAN format: 10-character official Indian PAN regex.
  - Consistency: Characters 3–12 of GSTIN must equal the PAN number.
- **Response `201 Created`**:
```json
{
  "id": "cuid_7419fe128310b8a244230ca4",
  "legalName": "Acme Cyber Defense Private Limited",
  "gstNumber": "27ABCDE1234F1Z5",
  "panMasked": "AB******4F",
  "status": "UNVERIFIED",
  "createdAt": "2026-08-09T17:15:17.488Z",
  "updatedAt": "2026-08-09T17:15:17.488Z"
}
```
- **Error Responses**:
  - `400 Bad Request`: Schema validation error or GST/PAN mismatch.
  - `409 Conflict`: Vendor with this GST number already exists.
  - `401 Unauthorized`: Missing or invalid `x-admin-key`.

### C. Vendor Lookup
- **`GET /api/vendors/:id`**
- **Headers**: `x-admin-key: <ADMIN_API_KEY>`
- **Response `200 OK`**:
```json
{
  "id": "cuid_7419fe128310b8a244230ca4",
  "legalName": "Acme Cyber Defense Private Limited",
  "gstNumber": "27ABCDE1234F1Z5",
  "panMasked": "AB******4F",
  "status": "UNVERIFIED",
  "createdAt": "2026-08-09T17:15:17.488Z",
  "updatedAt": "2026-08-09T17:15:17.488Z"
}
```

### D. Document Intake & Envelope Encryption
- **`POST /api/vendors/:id/documents`**
- **Headers**: `x-admin-key: <ADMIN_API_KEY>`, `Content-Type: multipart/form-data`
- **Form Fields**:
  - `type`: `GST_CERT` | `PAN_CARD` | `BANK_PROOF`
  - `file`: Raw binary file (Max size: 5 MB)
- **Security Validation**:
  - **Magic Bytes Inspection**: Inspects binary signature (`%PDF-`, `\x89PNG`, `\xFF\xD8\xFF`). Renamed `.exe` or unapproved files are immediately rejected.
  - **Envelope Encryption**: Generates a random 256-bit DEK, encrypts payload with AES-256-GCM, wraps DEK with `KEK_MASTER_KEY`.
  - **Integrity**: Computes SHA-256 hash of original plaintext.
  - **Storage**: Ciphertext stored on disk; raw plaintext discarded immediately from memory.
  - **Audit**: Appends immutable `VerificationEvent`.
- **Response `201 Created`**:
```json
{
  "id": "doc_c38f6b9e798137c896b1e471",
  "vendorId": "cuid_7419fe128310b8a244230ca4",
  "type": "GST_CERT",
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "status": "STORED",
  "createdAt": "2026-08-09T17:15:17.154Z"
}
```

### E. Document Metadata List
- **`GET /api/vendors/:id/documents`**
- **Headers**: `x-admin-key: <ADMIN_API_KEY>`
- **Response `200 OK`**:
```json
{
  "vendorId": "cuid_7419fe128310b8a244230ca4",
  "documents": [
    {
      "id": "doc_c38f6b9e798137c896b1e471",
      "vendorId": "cuid_7419fe128310b8a244230ca4",
      "type": "GST_CERT",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "status": "STORED",
      "createdAt": "2026-08-09T17:15:17.154Z"
    }
  ]
}
```

---

## 3. Cryptographic & Security Architecture

### Q: Why encrypt BEFORE verifying, and why mask PAN even from admins?
1. **Zero-Trust Ingestion Principle**: In a Zero-Trust architecture, the platform assumes the operational environment and internal networks are hostile. Storing unencrypted customer or vendor identity documents (even for a second while awaiting verification) creates an immediate exfiltration attack surface. Encrypting at the exact boundary of intake guarantees that data is protected at rest from Day 0.
2. **Least Privilege & Blast Radius Minimization**: Permanent Account Numbers (PANs) and tax credentials are sensitive personally identifiable information (PII). Internal platform administrators and dashboard operators have no operational need to see raw PAN characters; they only need to know whether the cryptographic verification checks passed (`VERIFIED` vs `FAILED`). Masking (`AB******4F`) prevents insider threats, accidental data leakage in support logs, and credential harvesting while retaining enough context for human confirmation.

---

## 4. Slice 2 Proposals (Future Architecture)
The following capabilities are out of scope for Slice 1 and scheduled for Slice 2:
1. **Automated OCR & Data Extraction Pipeline**: Asynchronous background workers extracting GSTIN/PAN text from decrypted document buffers inside isolated containers.
2. **Government API Adapters**: Verification calls to official GSTN and NSDL/Income Tax department portals.
3. **Distributed Redis & BullMQ**: Distributed queue for intake jobs and token bucket rate limiting.
4. **AWS S3 / Supabase Storage Adapter**: Migration from local volume storage to private object buckets with presigned URLs.
5. **IdP & OIDC Authentication UI**: Complete session token management and role-based access control (RBAC).

---

## 5. Local Docker & Database Bootstrapping
```bash
# 1. Start PostgreSQL 15 container
docker compose up -d

# 2. Run migrations
npm run prisma:migrate

# 3. Execute test suite
npm run test

# 4. Build for production
npm run build
```
