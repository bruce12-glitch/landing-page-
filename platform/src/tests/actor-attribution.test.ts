import { describe, it, expect } from 'vitest';
import { authenticateRequest } from '../lib/auth';

describe('Actor Attribution & Multi-Key Administration (F3)', () => {
  const ADMIN_KEYS = JSON.stringify({
    'ops-lead': 'vc_admin_ops_key_32bytes_sample',
    compliance: 'vc_admin_audit_key_32bytes_sam',
  });

  it('attributes named actor for keys configured in ADMIN_KEYS JSON', () => {
    process.env.ADMIN_KEYS = ADMIN_KEYS;

    const opsReq = new Request('http://localhost/api/vendors', {
      headers: { 'x-admin-key': 'vc_admin_ops_key_32bytes_sample' },
    });
    const opsAuth = authenticateRequest(opsReq);
    expect(opsAuth.authorized).toBe(true);
    expect(opsAuth.actor).toBe('admin:ops-lead');

    const auditReq = new Request('http://localhost/api/vendors', {
      headers: { 'x-admin-key': 'vc_admin_audit_key_32bytes_sam' },
    });
    const auditAuth = authenticateRequest(auditReq);
    expect(auditAuth.authorized).toBe(true);
    expect(auditAuth.actor).toBe('admin:compliance');
  });

  it('falls back to admin:default for single ADMIN_API_KEY matching', () => {
    process.env.ADMIN_KEYS = '';
    process.env.ADMIN_API_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';

    const defaultReq = new Request('http://localhost/api/vendors', {
      headers: { 'x-admin-key': 'vc_admin_sec_placeholder_key_32bytes_min' },
    });
    const defaultAuth = authenticateRequest(defaultReq);
    expect(defaultAuth.authorized).toBe(true);
    expect(defaultAuth.actor).toBe('admin:default');
  });

  it('rejects invalid or unrecognized keys', () => {
    process.env.ADMIN_KEYS = ADMIN_KEYS;

    const invalidReq = new Request('http://localhost/api/vendors', {
      headers: { 'x-admin-key': 'unrecognized_key_attempt' },
    });
    const invalidAuth = authenticateRequest(invalidReq);
    expect(invalidAuth.authorized).toBe(false);
    expect(invalidAuth.actor).toBeNull();
  });
});
