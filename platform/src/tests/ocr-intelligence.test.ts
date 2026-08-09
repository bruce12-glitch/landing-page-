import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as registerVendor } from '../app/api/vendors/route';
import { POST as uploadDoc } from '../app/api/vendors/[id]/documents/route';
import { POST as triggerVerify } from '../app/api/vendors/[id]/documents/[docId]/verify/route';
import { db } from '../lib/db/client';
import { verificationQueue } from '../lib/queue/verification-queue';

const ADMIN_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';
const TEST_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Document Intelligence & OCR Forgery Detection (F1)', () => {
  beforeEach(async () => {
    await db.reset();
    verificationQueue.reset();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.KEK_MASTER_KEY = TEST_KEK;
    process.env.STORAGE_DIR = './storage/ocr_test_encrypted_docs';
    process.env.VERIFICATION_ADAPTER = 'sandbox';
  });

  it('E2E A: OCR match confirms credentials and allows VERIFIED promotion', async () => {
    // 1. Register Vendor
    const regReq = new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify({
        legalName: 'Alpha Defense Logistics',
        gstNumber: '27ABCDE1234F1Z0',
        panNumber: 'ABCDE1234F',
      }),
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    });
    const regRes = await registerVendor(regReq);
    const vendor = await regRes.json();

    // 2. Upload authentic PAN card containing matching PAN text
    const panFormData = new FormData();
    panFormData.append('type', 'PAN_CARD');
    panFormData.append(
      'file',
      new Blob(
        [Buffer.from('%PDF-1.4 Income Tax Department PAN Card Holder ABCDE1234F Alpha Defense')],
        {
          type: 'application/pdf',
        }
      ),
      'pan_card.pdf'
    );
    const panUploadReq = new NextRequest(`http://localhost/api/vendors/${vendor.id}/documents`, {
      method: 'POST',
      body: panFormData,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const panRes = await uploadDoc(panUploadReq, { params: { id: vendor.id } });
    const panDoc = await panRes.json();

    // 3. Trigger verification
    const verifyReq = new NextRequest(
      `http://localhost/api/vendors/${vendor.id}/documents/${panDoc.id}/verify`,
      { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } }
    );
    await triggerVerify(verifyReq, { params: { id: vendor.id, docId: panDoc.id } });

    // Await async worker execution
    await new Promise((resolve) => setTimeout(resolve, 400));

    const finalDoc = await db.findDocumentById(panDoc.id);
    expect(finalDoc?.status).toBe('VERIFIED');

    const events = await db.findEventsByVendorId(vendor.id);
    const ocrEvent = events.find((e) => e.reason.includes('OCR cross-check confirmed'));
    expect(ocrEvent).toBeDefined();
    expect(ocrEvent?.toStatus).toBe('IN_PROGRESS'); // 1 of 3 verified
  });

  it('E2E B: Document OCR-PAN mismatch flags both document and vendor with FLAGGED status', async () => {
    // 1. Register Vendor with registered PAN: ABCDE1234F
    const regReq = new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify({
        legalName: 'Suspicious Trade Corp',
        gstNumber: '27ABCDE1234F1Z0',
        panNumber: 'ABCDE1234F',
      }),
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    });
    const regRes = await registerVendor(regReq);
    const vendor = await regRes.json();

    // 2. Upload a forged/mismatched PAN card document containing a different PAN (XYZWE9999K)
    const forgedPanFormData = new FormData();
    forgedPanFormData.append('type', 'PAN_CARD');
    forgedPanFormData.append(
      'file',
      new Blob(
        [Buffer.from('%PDF-1.4 Permanent Account Number Card XYZWE9999K Government of India')],
        { type: 'application/pdf' }
      ),
      'forged_pan.pdf'
    );

    const uploadReq = new NextRequest(`http://localhost/api/vendors/${vendor.id}/documents`, {
      method: 'POST',
      body: forgedPanFormData,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const uploadRes = await uploadDoc(uploadReq, { params: { id: vendor.id } });
    const uploadedDoc = await uploadRes.json();

    // 3. Trigger verification
    const verifyReq = new NextRequest(
      `http://localhost/api/vendors/${vendor.id}/documents/${uploadedDoc.id}/verify`,
      { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } }
    );
    await triggerVerify(verifyReq, { params: { id: vendor.id, docId: uploadedDoc.id } });

    // Await async worker execution
    await new Promise((resolve) => setTimeout(resolve, 400));

    // 4. Verify Document and Vendor status are both FLAGGED
    const finalDoc = await db.findDocumentById(uploadedDoc.id);
    expect(finalDoc?.status).toBe('FLAGGED');

    const finalVendor = await db.findVendorById(vendor.id);
    expect(finalVendor?.status).toBe('FLAGGED');

    // 5. Verify VerificationEvent explicitly names the mismatched field (panNumber)
    const events = await db.findEventsByVendorId(vendor.id);
    const flagEvent = events.find((e) => e.toStatus === 'FLAGGED');
    expect(flagEvent).toBeDefined();
    expect(flagEvent?.actor).toBe('OCR_INTELLIGENCE');
    expect(flagEvent?.reason).toContain('OCR mismatch');
    expect(flagEvent?.reason).toContain('panNumber');
  });
});
