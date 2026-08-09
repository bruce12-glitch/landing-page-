import crypto from 'node:crypto';

/**
 * Validates x-admin-key header against the configured ADMIN_API_KEY.
 * Uses crypto.timingSafeEqual to eliminate timing attack vectors.
 */
export function validateAdminKey(request: Request): boolean {
  const providedKey = request.headers.get('x-admin-key');
  const expectedKey = process.env.ADMIN_API_KEY || 'vc_admin_sec_placeholder_key_32bytes_min';

  if (!providedKey || !expectedKey) {
    return false;
  }

  const providedBuffer = Buffer.from(providedKey, 'utf-8');
  const expectedBuffer = Buffer.from(expectedKey, 'utf-8');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}
