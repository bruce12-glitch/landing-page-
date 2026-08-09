import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import { POST as uploadDoc, GET as getDocs } from '../app/api/vendors/[id]/documents/route';
import { db } from '../lib/db/client';
import { decryptDocument } from '../lib/crypto/envelope';

const ADMIN_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';
const TEST_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Document Intake & Envelope Encryption (F4)', () => {
  let testVendorId: string;

  beforeEach(async () => {
    await db.reset();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.KEK_MASTER_KEY = TEST_KEK;
    process.env.STORAGE_DIR = './storage/test_encrypted_docs';

    const vendor = await db.createVendor({
      legalName: 'Apex Defense Labs',
      gstNumber: '29ABCDE1234F1Z8',
      panEncrypted: 'mock_pan_payload',
      status: 'UNVERIFIED',
    });
    testVendorId = vendor.id;
  });

  it('rejects unauthenticated document upload with 401', async () => {
    const formData = new FormData();
    formData.append('type', 'GST_CERT');
    formData.append('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }));

    const req = new NextRequest(`http://localhost/api/vendors/${testVendorId}/documents`, {
      method: 'POST',
      body: formData,
    });

    const res = await uploadDoc(req, { params: { id: testVendorId } });
    expect(res.status).toBe(401);
  });

  it('rejects document upload for non-existent vendor with 404', async () => {
    const formData = new FormData();
    formData.append('type', 'GST_CERT');
    formData.append('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }));

    const req = new NextRequest('http://localhost/api/vendors/unknown_id/documents', {
      method: 'POST',
      body: formData,
      headers: { 'x-admin-key': ADMIN_KEY },
    });

    const res = await uploadDoc(req, { params: { id: 'unknown_id' } });
    expect(res.status).toBe(404);
  });

  it('rejects renamed executable binary disguised as a PDF via magic bytes inspection', async () => {
    // Windows PE executable header starting with 'MZ' (0x4D, 0x5A)
    const fakePdfBytes = Buffer.concat([
      Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
      Buffer.from('Malicious executable binary payload'),
    ]);

    const formData = new FormData();
    formData.append('type', 'GST_CERT');
    formData.append('file', new Blob([fakePdfBytes], { type: 'application/pdf' }), 'malicious.pdf');

    const req = new NextRequest(`http://localhost/api/vendors/${testVendorId}/documents`, {
      method: 'POST',
      body: formData,
      headers: { 'x-admin-key': ADMIN_KEY },
    });

    const res = await uploadDoc(req, { params: { id: testVendorId } });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.code).toBe('INVALID_FILE_MAGIC_BYTES');
    expect(json.error).toContain('Executable binary disguised as document');
  });

  it('successfully accepts valid PDF, writes ciphertext only to disk, and advances status to PENDING', async () => {
    const rawPdfContent = '%PDF-1.7 Authentic GST Certificate Issued by Government of India';
    const pdfBytes = Buffer.from(rawPdfContent);

    const formData = new FormData();
    formData.append('type', 'GST_CERT');
    formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'gst_cert.pdf');

    const req = new NextRequest(`http://localhost/api/vendors/${testVendorId}/documents`, {
      method: 'POST',
      body: formData,
      headers: { 'x-admin-key': ADMIN_KEY },
    });

    const res = await uploadDoc(req, { params: { id: testVendorId } });
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.id).toBeDefined();
    expect(json.vendorId).toBe(testVendorId);
    expect(json.type).toBe('GST_CERT');
    expect(json.status).toBe('STORED');
    expect(json.sha256).toBeDefined();

    // Verify stored document in DB
    const docs = await db.findDocumentsByVendorId(testVendorId);
    expect(docs).toHaveLength(1);
    const doc = docs[0]!;

    // Verify raw file on disk is CIPHERTEXT ONLY (not plaintext)
    const diskContent = await fs.readFile(doc.storagePath);
    expect(diskContent).not.toEqual(pdfBytes);
    expect(diskContent.includes(Buffer.from('Authentic GST Certificate'))).toBe(false);

    // Verify ciphertext can be decrypted using envelope keys
    const decrypted = decryptDocument(
      diskContent,
      doc.dekWrapped,
      doc.iv,
      doc.authTag,
      TEST_KEK
    );
    expect(decrypted.toString('utf-8')).toBe(rawPdfContent);

    // Verify Vendor status advanced to PENDING
    const updatedVendor = await db.findVendorById(testVendorId);
    expect(updatedVendor?.status).toBe('PENDING');

    // Verify VerificationEvent audit log created
    const events = await db.findEventsByVendorId(testVendorId);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const lastEvent = events[events.length - 1]!;
    expect(lastEvent.toStatus).toBe('PENDING');
    expect(lastEvent.reason).toContain('Document intake completed');
  });

  it('GET /api/vendors/:id/documents returns metadata ONLY without document byte stream', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4 Identity Proof Content');
    const formData = new FormData();
    formData.append('type', 'PAN_CARD');
    formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'pan_card.pdf');

    const uploadReq = new NextRequest(`http://localhost/api/vendors/${testVendorId}/documents`, {
      method: 'POST',
      body: formData,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    await uploadDoc(uploadReq, { params: { id: testVendorId } });

    const getReq = new NextRequest(`http://localhost/api/vendors/${testVendorId}/documents`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });

    const res = await getDocs(getReq, { params: { id: testVendorId } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.vendorId).toBe(testVendorId);
    expect(json.documents).toHaveLength(1);
    expect(json.documents[0].type).toBe('PAN_CARD');
    expect(json.documents[0].sha256).toBeDefined();
    expect(json.documents[0].status).toBe('STORED');

    // Assure no ciphertext or plaintext bytes are returned in metadata response
    expect(json.documents[0].bytes).toBeUndefined();
    expect(json.documents[0].ciphertext).toBeUndefined();
    expect(json.documents[0].storagePath).toBeUndefined();
  });
});
