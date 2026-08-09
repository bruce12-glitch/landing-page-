import { describe, it, expect } from 'vitest';
import { validateGstChecksum, computeGstChecksumChar } from '../lib/verification/gst-checksum';
import { GstSandboxAdapter } from '../lib/verification/gst-sandbox-adapter';
import { GstnAdapter, NotConfiguredError } from '../lib/verification/gstn-adapter';
import type { VerificationJob } from '../lib/verification/types';

describe('GST Checksum Algorithm & Adapter Determinism (F1)', () => {
  it('correctly computes and validates official GST checksum characters', () => {
    // 27ABCDE1234F1Z0 -> Checksum is '0'
    const valid1 = validateGstChecksum('27ABCDE1234F1Z0');
    expect(valid1.valid).toBe(true);
    expect(valid1.actualChar).toBe('0');

    // Compute checksum for 14-char prefix
    const computed = computeGstChecksumChar('27ABCDE1234F1Z');
    expect(computed).toBe('0');

    // Tampered checksum character: '5' instead of '0'
    const invalid1 = validateGstChecksum('27ABCDE1234F1Z5');
    expect(invalid1.valid).toBe(false);
    expect(invalid1.expectedChar).toBe('0');
    expect(invalid1.actualChar).toBe('5');
  });

  it('guarantees deterministic output: same input produces the exact same verdict and evidence hash', async () => {
    const adapter = new GstSandboxAdapter();
    const job: VerificationJob = {
      vendorId: 'vendor_123',
      documentId: 'doc_456',
      docType: 'GST_CERT',
      gstNumber: '27ABCDE1234F1Z0',
      panNumber: 'ABCDE1234F',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      decryptedBuffer: Buffer.from('%PDF-1.7 Authentic Certificate'),
    };

    const verdict1 = await adapter.verify(job);
    const verdict2 = await adapter.verify(job);

    expect(verdict1.outcome).toBe('VERIFIED');
    expect(verdict2.outcome).toBe('VERIFIED');
    expect(verdict1.evidence.sandbox).toBe(true);
    expect(verdict2.evidence.sandbox).toBe(true);
    expect(verdict1.evidence.checksumValid).toBe(true);
    expect(verdict2.evidence.checksumValid).toBe(true);
    expect(verdict1.reason).toBe(verdict2.reason);
    expect(verdict1.evidenceSha).toBe(verdict2.evidenceSha);
  });

  it('fails deterministic verification if GST checksum is tampered with', async () => {
    const adapter = new GstSandboxAdapter();
    const job: VerificationJob = {
      vendorId: 'vendor_123',
      documentId: 'doc_456',
      docType: 'GST_CERT',
      gstNumber: '27ABCDE1234F1Z5', // Tampered checksum ('5' instead of '0')
      panNumber: 'ABCDE1234F',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      decryptedBuffer: Buffer.from('%PDF-1.7 Certificate'),
    };

    const verdict1 = await adapter.verify(job);
    const verdict2 = await adapter.verify(job);

    expect(verdict1.outcome).toBe('FAILED');
    expect(verdict2.outcome).toBe('FAILED');
    expect(verdict1.evidence.checksumValid).toBe(false);
    expect(verdict2.evidence.checksumValid).toBe(false);
    expect(verdict1.reason).toContain('GST checksum verification failed');
    expect(verdict1.evidenceSha).toBe(verdict2.evidenceSha);
  });

  it('GstnAdapter stub throws NotConfiguredError', async () => {
    const gstn = new GstnAdapter();
    const job: VerificationJob = {
      vendorId: 'vendor_123',
      documentId: 'doc_456',
      docType: 'GST_CERT',
      gstNumber: '27ABCDE1234F1Z0',
      panNumber: 'ABCDE1234F',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      decryptedBuffer: Buffer.from('%PDF-1.7 Certificate'),
    };

    await expect(gstn.verify(job)).rejects.toThrow(NotConfiguredError);
  });
});
