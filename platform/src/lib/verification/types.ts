import type { DocumentType } from '../validation/vendor';

export interface VerificationJob {
  vendorId: string;
  documentId: string;
  docType: DocumentType;
  gstNumber: string;
  panNumber: string;
  sha256: string;
  decryptedBuffer: Buffer;
}

export type VerdictOutcome = 'VERIFIED' | 'FAILED';

export interface Verdict {
  outcome: VerdictOutcome;
  confidence: number;
  evidence: Record<string, unknown>;
  evidenceSha: string;
  adapterName: string;
  checkedAt: string;
  reason: string;
}

export interface VerificationAdapter {
  name: string;
  verify(job: VerificationJob): Promise<Verdict>;
}
