import fs from 'node:fs/promises';
import { db } from '../db/client';
import { decryptDocument } from '../crypto/envelope';
import { decryptPan } from '../crypto/pan-encryption';
import { getVerificationAdapter } from '../verification/adapter-factory';
import type { Verdict } from '../verification/types';
import type { VerificationJobPayload } from './types';
import { logger } from '../logger';

const KEK_MASTER_KEY =
  process.env.KEK_MASTER_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/**
 * Core asynchronous verification worker task.
 * 1. Loads encrypted document ciphertext from disk.
 * 2. Performs ephemeral in-memory decryption (never written to disk or logs).
 * 3. Invokes the configured VerificationAdapter.
 * 4. Zeroes out the decrypted memory buffer immediately (zero-trust RAM cleanup).
 * 5. Applies state transitions and append-only audit events.
 */
export async function processVerificationJob(
  job: VerificationJobPayload
): Promise<Verdict> {
  const vendor = await db.findVendorById(job.vendorId);
  if (!vendor) {
    throw new Error(`Vendor with ID '${job.vendorId}' not found`);
  }

  const doc = await db.findDocumentById(job.documentId);
  if (!doc) {
    throw new Error(`Document with ID '${job.documentId}' not found`);
  }

  const adapter = getVerificationAdapter();
  let decryptedBuffer: Buffer | null = null;

  try {
    const ciphertext = await fs.readFile(doc.storagePath);

    // Ephemeral in-memory decryption
    decryptedBuffer = decryptDocument(
      ciphertext,
      doc.dekWrapped,
      doc.iv,
      doc.authTag,
      KEK_MASTER_KEY
    );

    const plaintextPan = decryptPan(vendor.panEncrypted, KEK_MASTER_KEY);

    logger.info(
      { vendorId: job.vendorId, documentId: job.documentId, adapter: adapter.name },
      'Processing verification job with adapter'
    );

    const verdict = await adapter.verify({
      vendorId: job.vendorId,
      documentId: job.documentId,
      docType: doc.type,
      gstNumber: vendor.gstNumber,
      panNumber: plaintextPan,
      sha256: doc.sha256,
      decryptedBuffer,
    });

    // Handle document verdict outcomes
    if (verdict.outcome === 'VERIFIED') {
      await db.updateDocumentStatus(doc.id, 'VERIFIED');

      // Record append-only verification event
      await db.createVerificationEvent({
        vendorId: job.vendorId,
        actor: verdict.adapterName,
        fromStatus: vendor.status,
        toStatus: vendor.status,
        reason: verdict.reason,
        evidenceSha: verdict.evidenceSha,
      });

      // Check if ALL 3 required document types are VERIFIED
      const allDocs = await db.findDocumentsByVendorId(job.vendorId);
      const verifiedTypes = new Set(
        allDocs.filter((d) => d.status === 'VERIFIED').map((d) => d.type)
      );

      const hasGst = verifiedTypes.has('GST_CERT');
      const hasPan = verifiedTypes.has('PAN_CARD');
      const hasBank = verifiedTypes.has('BANK_PROOF');

      if (hasGst && hasPan && hasBank) {
        const prevStatus = vendor.status;
        await db.updateVendorStatus(job.vendorId, 'VERIFIED');

        // Append-only transition event to VERIFIED
        await db.createVerificationEvent({
          vendorId: job.vendorId,
          actor: verdict.adapterName,
          fromStatus: prevStatus,
          toStatus: 'VERIFIED',
          reason:
            'All 3 required identity documents (GST_CERT, PAN_CARD, BANK_PROOF) have passed cryptographic verification',
          evidenceSha: verdict.evidenceSha,
        });

        logger.info(
          { vendorId: job.vendorId },
          'Vendor fully elevated to VERIFIED state'
        );
      }
    } else {
      // Document verification FAILED
      await db.updateDocumentStatus(doc.id, 'REJECTED');

      await db.createVerificationEvent({
        vendorId: job.vendorId,
        actor: verdict.adapterName,
        fromStatus: vendor.status,
        toStatus: vendor.status,
        reason: verdict.reason,
        evidenceSha: verdict.evidenceSha,
      });

      logger.warn(
        { vendorId: job.vendorId, documentId: doc.id, reason: verdict.reason },
        'Document verification returned FAILED verdict'
      );
    }

    return verdict;
  } finally {
    // Zero out sensitive plaintext memory immediately
    if (decryptedBuffer) {
      decryptedBuffer.fill(0);
    }
  }
}
