import { describe, it, expect } from 'vitest';
import { validateAdminKey } from '../lib/auth';
import { checkRateLimit } from '../lib/rate-limiter';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Security Guards & Baseline Controls (F5, F6)', () => {
  it('validates x-admin-key securely using timingSafeEqual', () => {
    process.env.ADMIN_API_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';

    const validReq = new Request('http://localhost/api/vendors', {
      headers: { 'x-admin-key': 'vc_admin_sec_placeholder_key_32bytes_min' },
    });
    expect(validateAdminKey(validReq)).toBe(true);

    const invalidReq = new Request('http://localhost/api/vendors', {
      headers: { 'x-admin-key': 'wrong_key_value' },
    });
    expect(validateAdminKey(invalidReq)).toBe(false);

    const missingReq = new Request('http://localhost/api/vendors');
    expect(validateAdminKey(missingReq)).toBe(false);
  });

  it('enforces 30 req/min rate limit per IP address', () => {
    const testIp = '198.51.100.42';

    // First 30 requests should succeed
    for (let i = 0; i < 30; i++) {
      const res = checkRateLimit(testIp);
      expect(res.allowed).toBe(true);
    }

    // 31st request must be blocked
    const blockedRes = checkRateLimit(testIp);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.remaining).toBe(0);
  });

  it('guarantees ZERO console.log statements across production src directory', async () => {
    async function scanDir(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip test directory when scanning production sources
          if (entry.name !== 'tests') {
            files.push(...(await scanDir(fullPath)));
          }
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const srcDir = path.resolve(__dirname, '..');
    const sourceFiles = await scanDir(srcDir);
    expect(sourceFiles.length).toBeGreaterThan(5);

    for (const file of sourceFiles) {
      const content = await fs.readFile(file, 'utf-8');
      expect(content.includes('console.log')).toBe(false);
    }
  });
});
