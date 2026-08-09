import { describe, it, expect } from 'vitest';
import { GET as healthHandler } from '../app/api/health/route';

describe('API Health Endpoint', () => {
  it('returns 200 OK with buildSha and timestamp without auth key', async () => {
    const res = await healthHandler();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('UP');
    expect(json.service).toBe('vendorchain-platform');
    expect(json.buildSha).toBeDefined();
    expect(json.timestamp).toBeDefined();
  });
});
