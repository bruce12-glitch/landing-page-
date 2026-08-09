import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getDocumentBytes } from '../app/api/vendors/[id]/documents/[docId]/bytes/route';
import { db } from '../lib/db/client';
import { getStorageDriver } from '../lib/storage/factory';
import { encryptDocument } from '../lib/crypto/envelope';
import { encryptPan } from '../lib/crypto/pan-encryption';

const ADMIN_KEYS = JSON.stringify({
  'audit-lead': 'vc_admin_audit_key_32bytes_sam',
  'ops-lead': 'vc_admin_ops_key_32bytes_sample',
});
const TEST_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Audited Document Byte Retrieval & Storage Drivers (F2, F3)', () => {
  let testVendorId: string;
  let testDocId: string;
  let rawPdfBuffer: Buffer;

  beforeEach(async () => {
    await db.reset();
    process.env.ADMIN_KEYS = ADMIN_KEYS;
    process.env.ADMIN_API_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';
    process.env.KEK_MASTER_KEY = TEST_KEK;
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_DIR = './storage/bytes_test_encrypted_docs';

    const vendor = await db.createVendor({
      legalName: 'Sentinel Security Systems',
      gstNumber: '27ABCDE1234F1Z0',
      panEncrypted: encryptPan('ABCDE1234F', TEST_KEK),
      status: 'PENDING',
    });
    testVendorId = vendor.id;

    rawPdfBuffer = Buffer.from('%PDF-1.7 Confidential Bank Proof Statement of Account');
    const encrypted = encryptDocument(rawPdfBuffer, TEST_KEK);

    const storage = getStorageDriver();
    const filename = `test_bank_doc_${Date.now()}.enc`;
    const storagePath = await storage.write(filename, encrypted.ciphertext);

    const doc = await db.createDocument({
      vendorId: testVendorId,
      type: 'BANK_PROOF',
      storagePath,
      sha256: encrypted.sha256,
      dekWrapped: encrypted.dekWrapped,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      status: 'STORED',
    });
    testDocId = doc.id;
  });

  it('rejects unauthenticated byte download requests with 401', async () => {
    const req = new NextRequest(
      `http://localhost/api/vendors/${testVendorId}/documents/${testDocId}/bytes`
    );
    const res = await getDocumentBytes(req, { params: { id: testVendorId, docId: testDocId } });
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent document or vendor lookup', async () => {
    const req = new NextRequest(
      `http://localhost/api/vendors/${testVendorId}/documents/unknown_doc/bytes`,
      { headers: { 'x-admin-key': 'vc_admin_sec_placeholder_key_32bytes_min' } }
    );
    const res = await getDocumentBytes(req, { params: { id: testVendorId, docId: 'unknown_doc' } });
    expect(res.status).toBe(404);
  });

  it('returns 410 Gone when document metadata exists in DB but ciphertext object is missing from storage', async () => {
    const missingDoc = await db.createDocument({
      vendorId: testVendorId,
      type: 'GST_CERT',
      storagePath: '/non/existent/missing_file.enc',
      sha256: 'missing_sha',
      dekWrapped: 'bad_dek',
      iv: 'bad_iv',
      authTag: 'bad_tag',
    });

    const req = new NextRequest(
      `http://localhost/api/vendors/${testVendorId}/documents/${missingDoc.id}/bytes`,
      { headers: { 'x-admin-key': 'vc_admin_sec_placeholder_key_32bytes_min' } }
    );
    const res = await getDocumentBytes(req, { params: { id: testVendorId, docId: missingDoc.id } });
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.code).toBe('STORAGE_OBJECT_GONE');
  });

  it('streams decrypted bytes with strict Cache-Control headers and records an immutable ADMIN_READ event', async () => {
    const req = new NextRequest(
      `http://localhost/api/vendors/${testVendorId}/documents/${testDocId}/bytes`,
      { headers: { 'x-admin-key': 'vc_admin_audit_key_32bytes_sam' } } // Attributed to 'admin:audit-lead'
    );

    const res = await getDocumentBytes(req, { params: { id: testVendorId, docId: testDocId } });
    expect(res.status).toBe(200);

    // Verify response headers
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toContain('no-store');

    // Verify received bytes match original decrypted plaintext
    const arrayBuffer = await res.arrayBuffer();
    const receivedBuffer = Buffer.from(arrayBuffer);
    expect(receivedBuffer.toString('utf-8')).toBe(rawPdfBuffer.toString('utf-8'));

    // Verify AUDITED ACT: Check that an immutable ADMIN_READ event was appended
    const events = await db.findEventsByVendorId(testVendorId);
    const readEvent = events.find((e) => e.reason === 'ADMIN_READ');
    expect(readEvent).toBeDefined();
    expect(readEvent?.actor).toBe('admin:audit-lead');
    expect(readEvent?.evidenceSha).toBeDefined();
  });
});
