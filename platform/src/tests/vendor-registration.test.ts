import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as registerVendor } from '../app/api/vendors/route';
import { GET as getVendor } from '../app/api/vendors/[id]/route';
import { db } from '../lib/db/client';

const ADMIN_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';

describe('Vendor Registration & Identity Foundation (F2, F3)', () => {
  beforeEach(async () => {
    await db.reset();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.KEK_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('rejects unauthenticated registration attempts with 401', async () => {
    const req = new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify({
        legalName: 'Acme Systems Private Limited',
        gstNumber: '27ABCDE1234F1Z5',
        panNumber: 'ABCDE1234F',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await registerVendor(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid GST formats with 400', async () => {
    const req = new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify({
        legalName: 'Acme Systems',
        gstNumber: 'INVALID_GST_123',
        panNumber: 'ABCDE1234F',
      }),
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_KEY,
      },
    });

    const res = await registerVendor(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('INVALID_REQUEST_BODY');
  });

  it('rejects PAN that does not match embedded GST characters with 400', async () => {
    const req = new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify({
        legalName: 'Acme Systems',
        gstNumber: '27ABCDE1234F1Z5', // Embedded PAN is ABCDE1234F
        panNumber: 'XYZWE9999K', // Mismatched PAN
      }),
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_KEY,
      },
    });

    const res = await registerVendor(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('INVALID_REQUEST_BODY');
    expect(JSON.stringify(json.details)).toContain('must equal PAN');
  });

  it('successfully registers valid vendor and returns 201 with masked PAN', async () => {
    const req = new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify({
        legalName: 'Acme Systems Private Limited',
        gstNumber: '27ABCDE1234F1Z5',
        panNumber: 'ABCDE1234F',
      }),
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_KEY,
      },
    });

    const res = await registerVendor(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.id).toBeDefined();
    expect(json.legalName).toBe('Acme Systems Private Limited');
    expect(json.gstNumber).toBe('27ABCDE1234F1Z5');
    expect(json.panMasked).toBe('AB******4F');
    expect(json.status).toBe('UNVERIFIED');

    // Verify in database: PAN is encrypted, plaintext is unreadable
    const stored = await db.findVendorById(json.id);
    expect(stored).not.toBeNull();
    expect(stored?.panEncrypted).not.toBe('ABCDE1234F');
    expect(stored?.panEncrypted.includes('ABCDE1234F')).toBe(false);

    // Verify append-only VerificationEvent created
    const events = await db.findEventsByVendorId(json.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.fromStatus).toBe('UNVERIFIED');
    expect(events[0]?.toStatus).toBe('UNVERIFIED');
    expect(events[0]?.actor).toBe('ADMIN_API');
  });

  it('rejects duplicate GST numbers with 409 Conflict', async () => {
    const payload = {
      legalName: 'Acme Systems',
      gstNumber: '27ABCDE1234F1Z5',
      panNumber: 'ABCDE1234F',
    };

    const req1 = new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    });
    const res1 = await registerVendor(req1);
    expect(res1.status).toBe(201);

    const req2 = new NextRequest('http://localhost/api/vendors', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    });
    const res2 = await registerVendor(req2);
    expect(res2.status).toBe(409);
    const json2 = await res2.json();
    expect(json2.code).toBe('DUPLICATE_GST_NUMBER');
  });

  it('retrieves vendor metadata with masked PAN on GET /:id', async () => {
    const vendor = await db.createVendor({
      legalName: 'Secure Cloud Logistics',
      gstNumber: '33AAAPA9876K1Z1',
      panEncrypted: 'mock_encrypted_pan',
      status: 'UNVERIFIED',
    });

    const req = new NextRequest(`http://localhost/api/vendors/${vendor.id}`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });

    const res = await getVendor(req, { params: { id: vendor.id } });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.id).toBe(vendor.id);
    expect(json.legalName).toBe('Secure Cloud Logistics');
    expect(json.gstNumber).toBe('33AAAPA9876K1Z1');
    expect(json.panMasked).toBeDefined();
    expect(json.status).toBe('UNVERIFIED');
  });

  it('returns 404 for non-existent vendor lookup', async () => {
    const req = new NextRequest('http://localhost/api/vendors/non_existent_id', {
      headers: { 'x-admin-key': ADMIN_KEY },
    });

    const res = await getVendor(req, { params: { id: 'non_existent_id' } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe('VENDOR_NOT_FOUND');
  });
});
