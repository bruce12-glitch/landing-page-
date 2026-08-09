import type { DocumentType } from '../validation/vendor';
import type { Verdict } from '../verification/types';

export interface VerificationJobPayload {
  vendorId: string;
  documentId: string;
  docType: DocumentType;
  sha256: string;
  idempotencyKey: string;
  attemptCount: number;
}

export interface VerificationJobResult {
  jobId: string;
  idempotencyKey: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DLQ';
  verdict?: Verdict;
  attempts: number;
  error?: string;
  queuedAt: string;
  processedAt?: string;
}

export interface DeadLetterEntry {
  jobId: string;
  idempotencyKey: string;
  payload: VerificationJobPayload;
  failedAttempts: number;
  lastError: string;
  movedToDlqAt: string;
}
