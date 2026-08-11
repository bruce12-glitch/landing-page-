import crypto from 'node:crypto';
import type { VendorStatus, DocumentType, DocumentStatus } from '../validation/vendor';

export type TrustTier = 'TIER_1_CRITICAL' | 'TIER_2_STANDARD' | 'TIER_3_RESTRICTED' | 'TIER_4_SUSPENDED';

export type TransactionStatus =
  | 'RECORDED'
  | 'COMMITTED_L2'
  | 'SETTLED'
  | 'DISPUTED'
  | 'RESOLVED';

export interface VendorTransactionRecord {
  id: string;
  vendorId: string;
  invoiceRef: string;
  amountCents: number;
  currency: string;
  stateHash: string;
  l2TxHash: string | null;
  l2BlockNumber: number | null;
  status: TransactionStatus;
  disputeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrustScoreSnapshotRecord {
  id: string;
  vendorId: string;
  compositeScore: number;
  tier: TrustTier;
  identityScore: number;
  supplyChainScore: number;
  behaviorScore: number;
  penaltyDeduction: number;
  reasons: string; // JSON array of contributing factors
  calculatedAt: Date;
}

export interface VendorRecord {
  id: string;
  legalName: string;
  gstNumber: string;
  panEncrypted: string;
  status: VendorStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentRecord {
  id: string;
  vendorId: string;
  type: DocumentType;
  storagePath: string;
  sha256: string;
  dekWrapped: string;
  iv: string;
  authTag: string;
  status: DocumentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerificationEventRecord {
  id: string;
  vendorId: string;
  actor: string;
  fromStatus: VendorStatus;
  toStatus: VendorStatus;
  reason: string;
  evidenceSha?: string;
  createdAt: Date;
}

// In-memory relational storage layer with strict Prisma parity for testing & dev
class DatabaseStore {
  private vendors = new Map<string, VendorRecord>();
  private documents = new Map<string, DocumentRecord>();
  private events: VerificationEventRecord[] = [];
  private trustScores = new Map<string, TrustScoreSnapshotRecord>();
  private transactions = new Map<string, VendorTransactionRecord>();

  // Vendor Operations
  public async findVendorById(id: string): Promise<VendorRecord | null> {
    return this.vendors.get(id) || null;
  }

  public async findVendorByGst(gstNumber: string): Promise<VendorRecord | null> {
    const normalized = gstNumber.trim().toUpperCase();
    for (const vendor of this.vendors.values()) {
      if (vendor.gstNumber === normalized) {
        return vendor;
      }
    }
    return null;
  }

  public async createVendor(data: {
    legalName: string;
    gstNumber: string;
    panEncrypted: string;
    status?: VendorStatus;
  }): Promise<VendorRecord> {
    const existing = await this.findVendorByGst(data.gstNumber);
    if (existing) {
      const error = new Error('Unique constraint failed on the fields: (gstNumber)');
      (error as Error & { code: string }).code = 'P2002';
      throw error;
    }

    const id = `cuid_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();
    const record: VendorRecord = {
      id,
      legalName: data.legalName,
      gstNumber: data.gstNumber.trim().toUpperCase(),
      panEncrypted: data.panEncrypted,
      status: data.status || 'UNVERIFIED',
      createdAt: now,
      updatedAt: now,
    };

    this.vendors.set(id, record);
    return record;
  }

  public async updateVendorStatus(id: string, status: VendorStatus): Promise<VendorRecord | null> {
    const vendor = this.vendors.get(id);
    if (!vendor) return null;

    const updated: VendorRecord = {
      ...vendor,
      status,
      updatedAt: new Date(),
    };
    this.vendors.set(id, updated);
    return updated;
  }

  // Document Operations
  public async findDocumentById(id: string): Promise<DocumentRecord | null> {
    return this.documents.get(id) || null;
  }

  public async updateDocumentStatus(id: string, status: DocumentStatus): Promise<DocumentRecord | null> {
    const doc = this.documents.get(id);
    if (!doc) return null;

    const updated: DocumentRecord = {
      ...doc,
      status,
      updatedAt: new Date(),
    };
    this.documents.set(id, updated);
    return updated;
  }

  public async createDocument(data: {
    vendorId: string;
    type: DocumentType;
    storagePath: string;
    sha256: string;
    dekWrapped: string;
    iv: string;
    authTag: string;
    status?: DocumentStatus;
  }): Promise<DocumentRecord> {
    const vendor = await this.findVendorById(data.vendorId);
    if (!vendor) {
      throw new Error('Foreign key constraint failed on vendorId');
    }

    const id = `doc_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();
    const record: DocumentRecord = {
      id,
      vendorId: data.vendorId,
      type: data.type,
      storagePath: data.storagePath,
      sha256: data.sha256,
      dekWrapped: data.dekWrapped,
      iv: data.iv,
      authTag: data.authTag,
      status: data.status || 'STORED',
      createdAt: now,
      updatedAt: now,
    };

    this.documents.set(id, record);
    return record;
  }

  public async findDocumentsByVendorId(vendorId: string): Promise<DocumentRecord[]> {
    const results: DocumentRecord[] = [];
    for (const doc of this.documents.values()) {
      if (doc.vendorId === vendorId) {
        results.push(doc);
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Append-only Verification Events
  public async createVerificationEvent(data: {
    vendorId: string;
    actor: string;
    fromStatus: VendorStatus;
    toStatus: VendorStatus;
    reason: string;
    evidenceSha?: string;
  }): Promise<VerificationEventRecord> {
    const id = `evt_${crypto.randomBytes(12).toString('hex')}`;
    const event: VerificationEventRecord = {
      id,
      vendorId: data.vendorId,
      actor: data.actor,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      reason: data.reason,
      evidenceSha: data.evidenceSha,
      createdAt: new Date(),
    };
    this.events.push(event);
    return event;
  }

  public async findEventsByVendorId(vendorId: string): Promise<VerificationEventRecord[]> {
    return this.events
      .filter((e) => e.vendorId === vendorId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // Append-only Trust Score Snapshots (Module 3)
  public async createTrustScoreSnapshot(data: {
    vendorId: string;
    compositeScore: number;
    tier: TrustTier;
    identityScore: number;
    supplyChainScore: number;
    behaviorScore: number;
    penaltyDeduction: number;
    reasons: string;
  }): Promise<TrustScoreSnapshotRecord> {
    const vendor = await this.findVendorById(data.vendorId);
    if (!vendor) {
      throw new Error('Foreign key constraint failed on vendorId');
    }

    const id = `trust_${crypto.randomBytes(12).toString('hex')}`;
    const record: TrustScoreSnapshotRecord = {
      id,
      vendorId: data.vendorId,
      compositeScore: data.compositeScore,
      tier: data.tier,
      identityScore: data.identityScore,
      supplyChainScore: data.supplyChainScore,
      behaviorScore: data.behaviorScore,
      penaltyDeduction: data.penaltyDeduction,
      reasons: data.reasons,
      calculatedAt: new Date(),
    };
    this.trustScores.set(id, record);
    return record;
  }

  public async findTrustSnapshotsByVendorId(vendorId: string): Promise<TrustScoreSnapshotRecord[]> {
    const results: TrustScoreSnapshotRecord[] = [];
    for (const snapshot of this.trustScores.values()) {
      if (snapshot.vendorId === vendorId) results.push(snapshot);
    }
    return results.sort((a, b) => b.calculatedAt.getTime() - a.calculatedAt.getTime());
  }

  public async findLatestTrustSnapshotByVendorId(
    vendorId: string
  ): Promise<TrustScoreSnapshotRecord | null> {
    const all = await this.findTrustSnapshotsByVendorId(vendorId);
    return all.length && all[0] ? all[0] : null;
  }

  // Commercial Transactions & L2 Ledger Anchors (Module 4)
  public async createVendorTransaction(data: {
    vendorId: string;
    invoiceRef: string;
    amountCents: number;
    currency: string;
    stateHash: string;
    l2TxHash?: string;
    l2BlockNumber?: number;
    status?: TransactionStatus;
  }): Promise<VendorTransactionRecord> {
    const vendor = await this.findVendorById(data.vendorId);
    if (!vendor) {
      throw new Error('Foreign key constraint failed on vendorId');
    }
    const existing = await this.findTransactionByInvoiceRef(data.vendorId, data.invoiceRef);
    if (existing) {
      const error = new Error(
        'Unique constraint failed on (vendorId, invoiceRef) — duplicate transaction'
      );
      (error as Error & { code: string }).code = 'P2002';
      throw error;
    }

    const id = `tx_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();
    const record: VendorTransactionRecord = {
      id,
      vendorId: data.vendorId,
      invoiceRef: data.invoiceRef,
      amountCents: data.amountCents,
      currency: data.currency,
      stateHash: data.stateHash,
      l2TxHash: data.l2TxHash ?? null,
      l2BlockNumber: data.l2BlockNumber ?? null,
      status: data.status || 'RECORDED',
      disputeReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.transactions.set(id, record);
    return record;
  }

  public async findTransactionById(id: string): Promise<VendorTransactionRecord | null> {
    return this.transactions.get(id) || null;
  }

  public async findTransactionByInvoiceRef(
    vendorId: string,
    invoiceRef: string
  ): Promise<VendorTransactionRecord | null> {
    for (const tx of this.transactions.values()) {
      if (tx.vendorId === vendorId && tx.invoiceRef === invoiceRef) return tx;
    }
    return null;
  }

  public async findTransactionsByVendorId(
    vendorId: string,
    limit = 50,
    offset = 0
  ): Promise<VendorTransactionRecord[]> {
    const results: VendorTransactionRecord[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.vendorId === vendorId) results.push(tx);
    }
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return results.slice(offset, offset + limit);
  }

  public async updateTransactionStatus(
    id: string,
    status: TransactionStatus,
    disputeReason?: string
  ): Promise<VendorTransactionRecord | null> {
    const tx = this.transactions.get(id);
    if (!tx) return null;
    const updated: VendorTransactionRecord = {
      ...tx,
      status,
      disputeReason: disputeReason !== undefined ? disputeReason : tx.disputeReason,
      updatedAt: new Date(),
    };
    this.transactions.set(id, updated);
    return updated;
  }

  // Testing & Reset Helper
  public async reset(): Promise<void> {
    this.vendors.clear();
    this.documents.clear();
    this.events = [];
    this.trustScores = new Map();
    this.transactions = new Map();
  }
}

export const db = new DatabaseStore();
