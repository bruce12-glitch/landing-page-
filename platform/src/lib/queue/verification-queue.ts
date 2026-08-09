import crypto from 'node:crypto';
import { db } from '../db/client';
import { processVerificationJob } from './worker';
import type {
  VerificationJobPayload,
  VerificationJobResult,
  DeadLetterEntry,
} from './types';
import { logger } from '../logger';

class VerificationQueueService {
  private jobs = new Map<string, VerificationJobResult>();
  private idempotencyIndex = new Map<string, string>(); // idempotencyKey -> jobId
  private dlq: DeadLetterEntry[] = [];
  public readonly maxConcurrency = 2;
  private activeConcurrency = 0;

  /**
   * Enqueues a verification job with deduplication and idempotency keys.
   */
  public async enqueue(data: {
    vendorId: string;
    documentId: string;
    docType: VerificationJobPayload['docType'];
    sha256: string;
  }): Promise<VerificationJobResult> {
    const idempotencyKey = `${data.vendorId}:${data.documentId}:${data.sha256}`;

    // 1. Idempotency Check: return existing job if already queued/processing/completed
    const existingJobId = this.idempotencyIndex.get(idempotencyKey);
    if (existingJobId) {
      const existing = this.jobs.get(existingJobId);
      if (existing) {
        return existing;
      }
    }

    const vendor = await db.findVendorById(data.vendorId);
    if (!vendor) {
      throw new Error(`Vendor with ID '${data.vendorId}' not found`);
    }

    const doc = await db.findDocumentById(data.documentId);
    if (!doc) {
      throw new Error(`Document with ID '${data.documentId}' not found`);
    }

    // 2. Advance Vendor Status to IN_PROGRESS if not already
    if (vendor.status === 'UNVERIFIED' || vendor.status === 'PENDING') {
      const prevStatus = vendor.status;
      await db.updateVendorStatus(data.vendorId, 'IN_PROGRESS');
      await db.createVerificationEvent({
        vendorId: data.vendorId,
        actor: 'VERIFY_TRIGGER',
        fromStatus: prevStatus,
        toStatus: 'IN_PROGRESS',
        reason: `Verification pipeline job enqueued for document ${doc.type} (${doc.id})`,
      });
    }

    const jobId = `job_${crypto.randomBytes(12).toString('hex')}`;
    const payload: VerificationJobPayload = {
      vendorId: data.vendorId,
      documentId: data.documentId,
      docType: data.docType,
      sha256: data.sha256,
      idempotencyKey,
      attemptCount: 0,
    };

    const jobResult: VerificationJobResult = {
      jobId,
      idempotencyKey,
      status: 'QUEUED',
      attempts: 0,
      queuedAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, jobResult);
    this.idempotencyIndex.set(idempotencyKey, jobId);

    logger.info(
      { jobId, vendorId: data.vendorId, documentId: data.documentId },
      'Verification job successfully enqueued'
    );

    // Asynchronously dispatch job execution
    void this.dispatchNext(jobId, payload);

    return jobResult;
  }

  /**
   * Dispatches and processes job with retry exponential backoff and DLQ routing.
   */
  private async dispatchNext(
    jobId: string,
    payload: VerificationJobPayload
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'PROCESSING';
    this.activeConcurrency++;

    const maxRetries = 3;
    let success = false;
    let lastError = '';

    while (job.attempts < maxRetries && !success) {
      job.attempts++;
      payload.attemptCount = job.attempts;

      try {
        const verdict = await processVerificationJob(payload);
        job.status = 'COMPLETED';
        job.verdict = verdict;
        job.processedAt = new Date().toISOString();
        success = true;
        break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        logger.warn(
          { jobId, attempt: job.attempts, error: lastError },
          'Verification job attempt failed'
        );

        if (job.attempts < maxRetries) {
          // Exponential backoff: 100ms * (2 ^ attempt) for test execution / 1s in prod
          const delayMs = Math.min(100 * Math.pow(2, job.attempts), 2000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    if (!success) {
      // 4th failure -> Route to Dead-Letter Queue (DLQ)
      job.status = 'DLQ';
      job.error = lastError;
      job.processedAt = new Date().toISOString();

      const dlqEntry: DeadLetterEntry = {
        jobId,
        idempotencyKey: payload.idempotencyKey,
        payload,
        failedAttempts: job.attempts,
        lastError,
        movedToDlqAt: new Date().toISOString(),
      };
      this.dlq.push(dlqEntry);

      logger.error(
        { jobId, attempts: job.attempts, error: lastError },
        'Verification job exhausted all retries — moved to Dead-Letter Queue (DLQ)'
      );
    }

    this.activeConcurrency = Math.max(0, this.activeConcurrency - 1);
  }

  public getJob(jobId: string): VerificationJobResult | null {
    return this.jobs.get(jobId) || null;
  }

  public getJobByIdempotencyKey(key: string): VerificationJobResult | null {
    const jobId = this.idempotencyIndex.get(key);
    if (!jobId) return null;
    return this.jobs.get(jobId) || null;
  }

  public getDlqEntries(): DeadLetterEntry[] {
    return [...this.dlq];
  }

  public reset(): void {
    this.jobs.clear();
    this.idempotencyIndex.clear();
    this.dlq = [];
    this.activeConcurrency = 0;
  }
}

export const verificationQueue = new VerificationQueueService();
