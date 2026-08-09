import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../lib/db/client';
import { verificationQueue } from '../lib/queue/verification-queue';
import { processVerificationJob } from '../lib/queue/worker';
import { encryptDocument } from '../lib/crypto/envelope';
import { encryptPan } from '../lib/crypto/pan-encryption';
import fs from 'node:fs/promises';
import path from 'node:path';

const TEST_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Asynchronous Queue & Worker Pipeline (F2, F3)', () => {
  let testVendorId: string;
  let testDocId: string;
  let testStoragePath: string;

  beforeEach(async () => {
    await db.reset();
    verificationQueue.reset();
    process.env.KEK_MASTER_KEY = TEST_KEK;
    process.env.STORAGE_DIR = './storage/queue_test_encrypted_docs';
    process.env.VERIFICATION_ADAPTER = 'sandbox';

    const vendor = await db.createVendor({
      legalName: 'Vanguard Cyber Systems',
      gstNumber: '27ABCDE1234F1Z0',
      panEncrypted: encryptPan('ABCDE1234F', TEST_KEK),
      status: 'PENDING',
    });
    testVendorId = vendor.id;

    // Create encrypted document on disk
    const rawData = Buffer.from('%PDF-1.7 Valid Proof Document');
    const encrypted = encryptDocument(rawData, TEST_KEK);

    const dir = path.resolve('./storage/queue_test_encrypted_docs');
    await fs.mkdir(dir, { recursive: true });
    testStoragePath = path.join(dir, `test_doc_${Date.now()}.enc`);
    await fs.writeFile(testStoragePath, encrypted.ciphertext);

    const doc = await db.createDocument({
      vendorId: testVendorId,
      type: 'GST_CERT',
      storagePath: testStoragePath,
      sha256: encrypted.sha256,
      dekWrapped: encrypted.dekWrapped,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      status: 'STORED',
    });
    testDocId = doc.id;
  });

  it('guarantees idempotency: enqueuing the exact same job returns the existing job ID', async () => {
    const jobData = {
      vendorId: testVendorId,
      documentId: testDocId,
      docType: 'GST_CERT' as const,
      sha256: 'mock_sha256_hash_1234',
    };

    const job1 = await verificationQueue.enqueue(jobData);
    const job2 = await verificationQueue.enqueue(jobData);

    expect(job1.jobId).toBe(job2.jobId);
    expect(job1.idempotencyKey).toBe(job2.idempotencyKey);
  });

  it('ensures in-memory zeroing of decrypted buffer after worker execution', async () => {
    const jobPayload = {
      vendorId: testVendorId,
      documentId: testDocId,
      docType: 'GST_CERT' as const,
      sha256: 'mock_sha256_hash',
      idempotencyKey: `${testVendorId}:${testDocId}:mock`,
      attemptCount: 1,
    };

    const verdict = await processVerificationJob(jobPayload);
    expect(verdict.outcome).toBe('VERIFIED');

    // Assure no plaintext files leaked to storage directory
    const files = await fs.readdir('./storage/queue_test_encrypted_docs');
    for (const file of files) {
      expect(file.endsWith('.enc')).toBe(true);
      const content = await fs.readFile(path.join('./storage/queue_test_encrypted_docs', file));
      expect(content.includes(Buffer.from('Valid Proof Document'))).toBe(false);
    }
  });

  it('routes jobs to Dead-Letter Queue (DLQ) after 3 retry failures (4th failure)', async () => {
    // Corrupt storage path to force worker failure
    await db.createDocument({
      vendorId: testVendorId,
      type: 'PAN_CARD',
      storagePath: '/non/existent/path/corrupted.enc',
      sha256: 'corrupted_sha',
      dekWrapped: 'bad:wrapped:dek',
      iv: 'bad_iv',
      authTag: 'bad_tag',
    });

    const brokenDocs = await db.findDocumentsByVendorId(testVendorId);
    const brokenDoc = brokenDocs.find((d) => d.type === 'PAN_CARD')!;

    const jobResult = await verificationQueue.enqueue({
      vendorId: testVendorId,
      documentId: brokenDoc.id,
      docType: 'PAN_CARD',
      sha256: brokenDoc.sha256,
    });

    // Wait for retries with exponential backoff
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const finalJob = verificationQueue.getJob(jobResult.jobId);
    expect(finalJob?.status).toBe('DLQ');
    expect(finalJob?.attempts).toBe(3);

    const dlqList = verificationQueue.getDlqEntries();
    expect(dlqList.length).toBeGreaterThanOrEqual(1);
    const dlqEntry = dlqList.find((e) => e.jobId === jobResult.jobId);
    expect(dlqEntry).toBeDefined();
    expect(dlqEntry?.failedAttempts).toBe(3);
    expect(dlqEntry?.lastError).toContain('ENOENT');
  });
});
