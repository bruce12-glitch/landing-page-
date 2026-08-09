import crypto from 'node:crypto';
import type { VerificationAdapter, VerificationJob, Verdict } from './types';
import { validateGstChecksum } from './gst-checksum';

export class GstSandboxAdapter implements VerificationAdapter {
  public readonly name = 'GstSandboxAdapter';

  public async verify(job: VerificationJob): Promise<Verdict> {
    const startTime = Date.now();

    // Deterministic simulation latency (300ms)
    await new Promise((resolve) => setTimeout(resolve, 300));

    const checkedAt = new Date().toISOString();
    const gstCheck = validateGstChecksum(job.gstNumber);
    const panMatchesGst = job.gstNumber.slice(2, 12) === job.panNumber;

    // 1. Check GST Checksum
    if (!gstCheck.valid) {
      const deterministicEvidence = {
        sandbox: true,
        deterministic: true,
        gstNumber: job.gstNumber,
        panMasked: `${job.panNumber.slice(0, 2)}******${job.panNumber.slice(8, 10)}`,
        docType: job.docType,
        documentSha256: job.sha256,
        checksumValid: false,
        actualChecksumChar: gstCheck.actualChar,
        expectedChecksumChar: gstCheck.expectedChar,
      };

      const evidenceCanonical = JSON.stringify(
        deterministicEvidence,
        Object.keys(deterministicEvidence).sort()
      );
      const evidenceSha = crypto.createHash('sha256').update(evidenceCanonical).digest('hex');

      return {
        outcome: 'FAILED',
        confidence: 1.0,
        evidence: {
          ...deterministicEvidence,
          checkedAt,
          validationLatencyMs: Date.now() - startTime,
        },
        evidenceSha,
        adapterName: this.name,
        checkedAt,
        reason: `GST checksum verification failed: character '${gstCheck.actualChar}' does not match expected check digit '${gstCheck.expectedChar}'`,
      };
    }

    // 2. Check GST ↔ PAN Alignment
    if (!panMatchesGst) {
      const deterministicEvidence = {
        sandbox: true,
        deterministic: true,
        gstNumber: job.gstNumber,
        panMasked: `${job.panNumber.slice(0, 2)}******${job.panNumber.slice(8, 10)}`,
        docType: job.docType,
        documentSha256: job.sha256,
        checksumValid: true,
        panAligned: false,
      };

      const evidenceCanonical = JSON.stringify(
        deterministicEvidence,
        Object.keys(deterministicEvidence).sort()
      );
      const evidenceSha = crypto.createHash('sha256').update(evidenceCanonical).digest('hex');

      return {
        outcome: 'FAILED',
        confidence: 1.0,
        evidence: {
          ...deterministicEvidence,
          checkedAt,
          validationLatencyMs: Date.now() - startTime,
        },
        evidenceSha,
        adapterName: this.name,
        checkedAt,
        reason: 'Embedded PAN in GSTIN does not match the vendor registered PAN',
      };
    }

    // 3. Document payload integrity check
    if (!job.decryptedBuffer || job.decryptedBuffer.length < 4) {
      const deterministicEvidence = {
        sandbox: true,
        deterministic: true,
        docType: job.docType,
        documentSha256: job.sha256,
        payloadValid: false,
      };

      const evidenceCanonical = JSON.stringify(
        deterministicEvidence,
        Object.keys(deterministicEvidence).sort()
      );
      const evidenceSha = crypto.createHash('sha256').update(evidenceCanonical).digest('hex');

      return {
        outcome: 'FAILED',
        confidence: 1.0,
        evidence: {
          ...deterministicEvidence,
          checkedAt,
          validationLatencyMs: Date.now() - startTime,
        },
        evidenceSha,
        adapterName: this.name,
        checkedAt,
        reason: 'Decrypted document payload is empty or corrupted',
      };
    }

    // 4. Positive verification verdict
    const deterministicEvidence = {
      sandbox: true,
      deterministic: true,
      gstNumber: job.gstNumber,
      panMasked: `${job.panNumber.slice(0, 2)}******${job.panNumber.slice(8, 10)}`,
      gstStateCode: job.gstNumber.slice(0, 2),
      docType: job.docType,
      documentSha256: job.sha256,
      checksumValid: true,
      panAligned: true,
      payloadVerified: true,
    };

    const evidenceCanonical = JSON.stringify(
      deterministicEvidence,
      Object.keys(deterministicEvidence).sort()
    );
    const evidenceSha = crypto.createHash('sha256').update(evidenceCanonical).digest('hex');

    return {
      outcome: 'VERIFIED',
      confidence: 1.0,
      evidence: {
        ...deterministicEvidence,
        checkedAt,
        validationLatencyMs: Date.now() - startTime,
      },
      evidenceSha,
      adapterName: this.name,
      checkedAt,
      reason: `Cryptographic sandbox verification passed for document type ${job.docType} under GSTIN ${job.gstNumber}`,
    };
  }
}
