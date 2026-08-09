import crypto from 'node:crypto';
import type { VendorStatus, DocumentType, DocumentStatus } from '../validation/vendor';

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
  createdAt: Date;
}

// In-memory relational storage layer with strict Prisma parity for testing & dev
class DatabaseStore {
  private vendors = new Map<string, VendorRecord>();
  private documents = new Map<string, DocumentRecord>();
  private events: VerificationEventRecord[] = [];

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
  }): Promise<VerificationEventRecord> {
    const id = `evt_${crypto.randomBytes(12).toString('hex')}`;
    const event: VerificationEventRecord = {
      id,
      vendorId: data.vendorId,
      actor: data.actor,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      reason: data.reason,
      createdAt: new Date(),
    };
    this.events.push(event);
    return event;
  }

  public async findEventsByVendorId(vendorId: string): Promise<VerificationEventRecord[]> {
    return this.events.filter((e) => e.vendorId === vendorId);
  }

  // Testing & Reset Helper
  public async reset(): Promise<void> {
    this.vendors.clear();
    this.documents.clear();
    this.events = [];
  }
}

export const db = new DatabaseStore();
