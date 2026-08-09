import crypto from 'node:crypto';

export interface AuthResult {
  authorized: boolean;
  actor: string | null;
}

/**
 * Validates x-admin-key header against configured multi-actor ADMIN_KEYS
 * or single ADMIN_API_KEY fallback using crypto.timingSafeEqual.
 * Returns the attributed actor name (e.g. 'admin:ops-lead' or 'admin:default').
 * NEVER exposes or returns the actual secret API key.
 */
export function authenticateRequest(request: Request): AuthResult {
  const providedKey = request.headers.get('x-admin-key');
  if (!providedKey) {
    return { authorized: false, actor: null };
  }

  const providedBuffer = Buffer.from(providedKey, 'utf-8');

  // 1. Check multi-key map from ADMIN_KEYS (JSON format: {"name": "key"})
  const adminKeysJson = process.env.ADMIN_KEYS?.trim();
  if (adminKeysJson) {
    try {
      const keyMap = JSON.parse(adminKeysJson) as Record<string, string>;
      for (const [keyName, secretValue] of Object.entries(keyMap)) {
        if (typeof secretValue === 'string') {
          const secretBuffer = Buffer.from(secretValue, 'utf-8');
          if (
            providedBuffer.length === secretBuffer.length &&
            crypto.timingSafeEqual(providedBuffer, secretBuffer)
          ) {
            return { authorized: true, actor: `admin:${keyName}` };
          }
        }
      }
    } catch {
      // Invalid JSON syntax in ADMIN_KEYS - fallback to single ADMIN_API_KEY
    }
  }

  // 2. Fallback to single ADMIN_API_KEY ('admin:default')
  const defaultKey = process.env.ADMIN_API_KEY || 'vc_admin_sec_placeholder_key_32bytes_min';
  const defaultBuffer = Buffer.from(defaultKey, 'utf-8');

  if (
    providedBuffer.length === defaultBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, defaultBuffer)
  ) {
    return { authorized: true, actor: 'admin:default' };
  }

  return { authorized: false, actor: null };
}

/**
 * Backward-compatible helper for basic authentication check.
 */
export function validateAdminKey(request: Request): boolean {
  return authenticateRequest(request).authorized;
}
