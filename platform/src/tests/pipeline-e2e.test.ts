import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as registerVendor } from '../app/api/vendors/route';
import { POST as uploadDoc } from '../app/api/vendors/[id]/documents/route';
import { POST as triggerVerify } from '../app/api/vendors/[id]/documents/[docId]/verify/route';
import { GET as getTimeline } from '../app/api/vendors/[id]/verification/route';
import { db } from '../lib/db/client';
import { verificationQueue } from '../lib/queue/verification-queue';

const ADMIN_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';
const TEST_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('End-to-End Verification Pipeline (F2, F3, F4)', () => {
  beforeEach(async () => {
    await db.reset();
    verificationQueue.reset();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.KEK_MASTER_KEY = TEST_KEK;
    process.env.STORAGE_DIR = './storage/e2e_encrypted_docs';
    process.env.VERIFICATION_ADAPTER = 'sandbox';
  });

  it('progresses vendor lifecycle: UNVERIFIED -> PENDING -> IN_PROGRESS -> VERIFIED after all 3 docs pass', async () => {
    // 1. Register Vendor with valid GSTIN (checksum char '0') and matching PAN (ABCDE1234F)
    const regReq = new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify({
        legalName: 'Paramount Defense Solutions',
        gstNumber: '27ABCDE1234F1Z0',
        panNumber: 'ABCDE1234F',
      }),
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    });
    const regRes = await registerVendor(regReq);
    expect(regRes.status).toBe(201);
    const vendor = await regRes.json();
    expect(vendor.status).toBe('UNVERIFIED');

    // 2. Upload Document 1: GST_CERT (Advances to PENDING)
    const gstFormData = new FormData();
    gstFormData.append('type', 'GST_CERT');
    gstFormData.append(
      'file',
      new Blob(
        [Buffer.from('%PDF-1.5 Government of India GST Certificate 27ABCDE1234F1Z0 ABCDE1234F Valid')],
        { type: 'application/pdf' }
      ),
      'gst_cert.pdf'
    );
    const gstUploadReq = new NextRequest(`http://localhost/api/vendors/${vendor.id}/documents`, {
      method: 'POST',
      body: gstFormData,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const gstRes = await uploadDoc(gstUploadReq, { params: { id: vendor.id } });
    expect(gstRes.status).toBe(201);
    const gstDoc = await gstRes.json();

    const afterGstVendor = await db.findVendorById(vendor.id);
    expect(afterGstVendor?.status).toBe('PENDING');

    // 3. Upload Document 2: PAN_CARD containing matching PAN ABCDE1234F
    const panFormData = new FormData();
    panFormData.append('type', 'PAN_CARD');
    panFormData.append(
      'file',
      new Blob(
        [Buffer.from('%PDF-1.5 Income Tax Department PAN Card ABCDE1234F Paramount Defense')],
        { type: 'application/pdf' }
      ),
      'pan_card.pdf'
    );
    const panUploadReq = new NextRequest(`http://localhost/api/vendors/${vendor.id}/documents`, {
      method: 'POST',
      body: panFormData,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const panRes = await uploadDoc(panUploadReq, { params: { id: vendor.id } });
    expect(panRes.status).toBe(201);
    const panDoc = await panRes.json();

    // 4. Upload Document 3: BANK_PROOF
    const bankFormData = new FormData();
    bankFormData.append('type', 'BANK_PROOF');
    bankFormData.append(
      'file',
      new Blob([Buffer.from('%PDF-1.5 Certified Bank Proof Statement of Account Valid')], {
        type: 'application/pdf'
      }),
      'bank_proof.pdf'
    );
    const bankUploadReq = new NextRequest(`http://localhost/api/vendors/${vendor.id}/documents`, {
      method: 'POST',
      body: bankFormData,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const bankRes = await uploadDoc(bankUploadReq, { params: { id: vendor.id } });
    expect(bankRes.status).toBe(201);
    const bankDoc = await bankRes.json();

    // 5. Trigger Verification for GST_CERT (Advances to IN_PROGRESS)
    const verify1Req = new NextRequest(
      `http://localhost/api/vendors/${vendor.id}/documents/${gstDoc.id}/verify`,
      { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } }
    );
    const v1Res = await triggerVerify(verify1Req, { params: { id: vendor.id, docId: gstDoc.id } });
    expect(v1Res.status).toBe(202);

    // Wait for async worker execution (300ms simulated adapter latency)
    await new Promise((resolve) => setTimeout(resolve, 400));

    const doc1State = await db.findDocumentById(gstDoc.id);
    expect(doc1State?.status).toBe('VERIFIED');

    const v1VendorState = await db.findVendorById(vendor.id);
    expect(v1VendorState?.status).toBe('IN_PROGRESS'); // 1 of 3 verified

    // 6. Trigger Verification for PAN_CARD
    const verify2Req = new NextRequest(
      `http://localhost/api/vendors/${vendor.id}/documents/${panDoc.id}/verify`,
      { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } }
    );
    const v2Res = await triggerVerify(verify2Req, { params: { id: vendor.id, docId: panDoc.id } });
    expect(v2Res.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const doc2State = await db.findDocumentById(panDoc.id);
    expect(doc2State?.status).toBe('VERIFIED');

    const v2VendorState = await db.findVendorById(vendor.id);
    expect(v2VendorState?.status).toBe('IN_PROGRESS'); // 2 of 3 verified

    // 7. Trigger Verification for BANK_PROOF (3rd of 3 -> Vendor becomes VERIFIED!)
    const verify3Req = new NextRequest(
      `http://localhost/api/vendors/${vendor.id}/documents/${bankDoc.id}/verify`,
      { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } }
    );
    const v3Res = await triggerVerify(verify3Req, { params: { id: vendor.id, docId: bankDoc.id } });
    expect(v3Res.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const doc3State = await db.findDocumentById(bankDoc.id);
    expect(doc3State?.status).toBe('VERIFIED');

    // Vendor status must now be VERIFIED
    const finalVendorState = await db.findVendorById(vendor.id);
    expect(finalVendorState?.status).toBe('VERIFIED');

    // 8. Verify Timeline via GET /api/vendors/:id/verification
    const timelineReq = new NextRequest(`http://localhost/api/vendors/${vendor.id}/verification`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const timelineRes = await getTimeline(timelineReq, { params: { id: vendor.id } });
    expect(timelineRes.status).toBe(200);

    const timelineJson = await timelineRes.json();
    expect(timelineJson.vendorId).toBe(vendor.id);
    expect(timelineJson.currentStatus).toBe('VERIFIED');
    expect(timelineJson.timeline.length).toBeGreaterThanOrEqual(6);

    // Verify sandbox flags are stamped
    const sandboxEvents = timelineJson.timeline.filter((e: { sandbox: boolean }) => e.sandbox === true);
    expect(sandboxEvents.length).toBe(timelineJson.timeline.length);
  });
});
