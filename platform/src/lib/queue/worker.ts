import { db } from '../db/client';
import { decryptDocument } from '../crypto/envelope';
import { decryptPan } from '../crypto/pan-encryption';
import { getVerificationAdapter } from '../verification/adapter-factory';
import { getStorageDriver } from '../storage/factory';
import { performDocumentOcr } from '../ocr/extractor';
import type { Verdict } from '../verification/types';
import type { VerificationJobPayload } from './types';
import { logger } from '../logger';

const KEK_MASTER_KEY =
  process.env.KEK_MASTER_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/**
 * Core asynchronous verification worker task (Slice 3: Document Intelligence).
 * 1. Reads encrypted document ciphertext from configured StorageDriver.
 * 2. Performs ephemeral in-memory decryption (never written to disk or logs).
 * 3. Invokes the configured VerificationAdapter (GSTN/Sandbox).
 * 4. Executes OCR cross-check comparing extracted document text against registered credentials.
 * 5. Flags forgeries / mismatches (`FLAGGED`) or confirms authenticity (`VERIFIED`).
 * 6. Zeroes out the decrypted memory buffer immediately (`decryptedBuffer.fill(0)`).
 * 7. Enforces Truth Rule state transitions and append-only audit events.
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

  const storage = getStorageDriver();
  const adapter = getVerificationAdapter();
  let decryptedBuffer: Buffer | null = null;

  try {
    const ciphertext = await storage.read(doc.storagePath);

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

    if (verdict.outcome === 'VERIFIED') {
      // Execute Document Intelligence OCR cross-check
      const ocrVerdict = await performDocumentOcr(
        decryptedBuffer,
        doc.type,
        vendor.gstNumber,
        plaintextPan
      );

      if (!ocrVerdict.matched) {
        // OCR Mismatch Detected -> Document and Vendor FLAGGED
        await db.updateDocumentStatus(doc.id, 'FLAGGED');
        const prevVendorStatus = vendor.status;
        await db.updateVendorStatus(job.vendorId, 'FLAGGED');

        await db.createVerificationEvent({
          vendorId: job.vendorId,
          actor: 'OCR_INTELLIGENCE',
          fromStatus: prevVendorStatus,
          toStatus: 'FLAGGED',
          reason: ocrVerdict.reason,
          evidenceSha: verdict.evidenceSha,
        });

        logger.warn(
          { vendorId: job.vendorId, documentId: doc.id, mismatchedField: ocrVerdict.mismatchedField },
          'Document intelligence detected credential mismatch — flagged vendor and document'
        );

        return {
          ...verdict,
          outcome: 'FAILED',
          reason: ocrVerdict.reason,
        };
      }

      // OCR Matched -> Document VERIFIED
      await db.updateDocumentStatus(doc.id, 'VERIFIED');

      await db.createVerificationEvent({
        vendorId: job.vendorId,
        actor: verdict.adapterName,
        fromStatus: vendor.status,
        toStatus: vendor.status,
        reason: `${verdict.reason} | OCR cross-check confirmed (${(ocrVerdict.confidence * 100).toFixed(0)}% confidence)`,
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

      if (hasGst && hasPan && hasBank && vendor.status !== 'FLAGGED') {
        const prevStatus = vendor.status;
        await db.updateVendorStatus(job.vendorId, 'VERIFIED');

        await db.createVerificationEvent({
          vendorId: job.vendorId,
          actor: verdict.adapterName,
          fromStatus: prevStatus,
          toStatus: 'VERIFIED',
          reason:
            'All 3 required identity documents (GST_CERT, PAN_CARD, BANK_PROOF) have passed cryptographic verification and OCR validation',
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
