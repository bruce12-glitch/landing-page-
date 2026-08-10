import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET as supplyChainHandler } from '../app/api/supply-chain/latest/route';
import { EventEmitter } from 'node:events';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mock node:child_process
// ---------------------------------------------------------------------------

const mockSpawnState = {
  exitCode: 1,
  stdout: '',
  stderr: '',
  callCount: 0,
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    mockSpawnState.callCount += 1;
    const child = new EventEmitter() as any;
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    child.stdout = stdoutEmitter;
    child.stderr = stderrEmitter;

    process.nextTick(() => {
      stdoutEmitter.emit('data', Buffer.from(mockSpawnState.stdout, 'utf-8'));
      stderrEmitter.emit('data', Buffer.from(mockSpawnState.stderr, 'utf-8'));
      child.emit('close', mockSpawnState.exitCode);
    });

    return child;
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(adminKey: string): Request {
  return new Request('http://localhost/api/supply-chain/latest', {
    headers: { 'x-admin-key': adminKey },
  });
}

const ADMIN_KEY = 'vc_admin_sec_placeholder_key_32bytes_min';
const PLATFORM_DIR = path.resolve(process.cwd());
const ARTIFACTS_DIR = path.join(PLATFORM_DIR, 'artifacts');
const SBOM_DIR = path.join(ARTIFACTS_DIR, 'sbom');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Supply-Chain Self-Attestation API (Module 2, Slice 1)', () => {
  beforeEach(async () => {
    mockSpawnState.exitCode = 1;
    mockSpawnState.stdout = '';
    mockSpawnState.stderr = '';
    mockSpawnState.callCount = 0;
    await mkdir(SBOM_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(ARTIFACTS_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns 401 without admin key', async () => {
    const req = new Request('http://localhost/api/supply-chain/latest');
    const res = await supplyChainHandler(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 404 when no attestation manifest exists', async () => {
    const req = makeRequest(ADMIN_KEY);
    const res = await supplyChainHandler(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('No attestation found');
    expect(json.gitSha).toBeDefined();
  });

  it('returns verified:false when verify.sh exits non-zero (mocked)', async () => {
    const gitSha = process.env.BUILD_SHA || 'unknown';
    const manifestPath = path.join(ARTIFACTS_DIR, `manifest-${gitSha}.json`);
    const sbomPath = path.join(SBOM_DIR, `platform-${gitSha}.cdx.json`);

    await writeFile(
      manifestPath,
      JSON.stringify({
        gitSha,
        sbomPath,
        sbomSha256: 'deadbeef00000000000000000000000000000000000000000000000000000000',
        specVersion: '1.6',
        componentCount: 42,
        generatedAt: new Date().toISOString(),
        tool: 'syft',
        toolVersion: 'v1.12.2',
        provenance: 'test-mock',
      })
    );
    await writeFile(sbomPath, '{"specVersion":"1.6"}');
    await writeFile(`${sbomPath}.sig`, 'fakesig');

    mockSpawnState.exitCode = 1;
    mockSpawnState.stderr = '[verify] ERROR: cosign is not installed.';

    const req = makeRequest(ADMIN_KEY);
    const res = await supplyChainHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.gitSha).toBe(gitSha);
    expect(json.sbomSha256).toBe('deadbeef00000000000000000000000000000000000000000000000000000000');
    expect(json.signaturePresent).toBe(true);
    expect(json.verified).toBe(false); // TRUTH RULE: computed at request time
    expect(json.verifyExitCode).toBe(1);
    expect(json.verifiedAt).toBeDefined();
  });

  it('returns verified:true when verify.sh exits 0 (mocked)', async () => {
    const gitSha = process.env.BUILD_SHA || 'unknown';
    const manifestPath = path.join(ARTIFACTS_DIR, `manifest-${gitSha}.json`);
    const sbomPath = path.join(SBOM_DIR, `platform-${gitSha}.cdx.json`);

    await writeFile(
      manifestPath,
      JSON.stringify({
        gitSha,
        sbomPath,
        sbomSha256: 'cafebabe00000000000000000000000000000000000000000000000000000000',
        specVersion: '1.6',
        componentCount: 99,
        generatedAt: new Date().toISOString(),
        tool: 'syft',
        toolVersion: 'v1.12.2',
        provenance: 'test-mock',
      })
    );
    await writeFile(sbomPath, '{"specVersion":"1.6"}');
    await writeFile(`${sbomPath}.sig`, 'validsig');

    mockSpawnState.exitCode = 0;
    mockSpawnState.stdout = '[verify] ✅ SBOM signature valid.';

    const req = makeRequest(ADMIN_KEY);
    const res = await supplyChainHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.verified).toBe(true); // TRUTH RULE: computed at request time
    expect(json.verifyExitCode).toBe(0);
    expect(json.signaturePresent).toBe(true);
    expect(json.sbomSha256).toBe('cafebabe00000000000000000000000000000000000000000000000000000000');
    expect(json.specVersion).toBe('1.6');
    expect(json.componentCount).toBe(99);
  });

  it('returns signaturePresent:false when .sig file is missing', async () => {
    const gitSha = process.env.BUILD_SHA || 'unknown';
    const manifestPath = path.join(ARTIFACTS_DIR, `manifest-${gitSha}.json`);
    const sbomPath = path.join(SBOM_DIR, `platform-${gitSha}.cdx.json`);

    await writeFile(
      manifestPath,
      JSON.stringify({
        gitSha,
        sbomPath,
        sbomSha256: 'aaaaaaaa00000000000000000000000000000000000000000000000000000000',
        specVersion: '1.6',
        componentCount: 1,
        generatedAt: new Date().toISOString(),
        tool: 'syft',
        toolVersion: 'v1.12.2',
        provenance: 'test-mock',
      })
    );
    await writeFile(sbomPath, '{"specVersion":"1.6"}');
    // NO .sig file written

    mockSpawnState.exitCode = 1;
    mockSpawnState.stderr = 'missing signature';

    const req = makeRequest(ADMIN_KEY);
    const res = await supplyChainHandler(req);
    const json = await res.json();
    expect(json.signaturePresent).toBe(false);
    expect(json.verified).toBe(false);
  });

  it('never caches verified status between requests', async () => {
    const gitSha = process.env.BUILD_SHA || 'unknown';
    const manifestPath = path.join(ARTIFACTS_DIR, `manifest-${gitSha}.json`);
    const sbomPath = path.join(SBOM_DIR, `platform-${gitSha}.cdx.json`);

    await writeFile(
      manifestPath,
      JSON.stringify({
        gitSha,
        sbomPath,
        sbomSha256: 'bbbbbbbb00000000000000000000000000000000000000000000000000000000',
        specVersion: '1.6',
        componentCount: 5,
        generatedAt: new Date().toISOString(),
        tool: 'syft',
        toolVersion: 'v1.12.2',
        provenance: 'test-mock',
      })
    );
    await writeFile(sbomPath, '{"specVersion":"1.6"}');
    await writeFile(`${sbomPath}.sig`, 'sig');

    // First request: verify.sh fails
    mockSpawnState.exitCode = 1;
    mockSpawnState.stderr = 'fail';
    const req1 = makeRequest(ADMIN_KEY);
    const res1 = await supplyChainHandler(req1);
    const json1 = await res1.json();
    expect(json1.verified).toBe(false);

    // Second request: verify.sh passes (re-computed!)
    mockSpawnState.exitCode = 0;
    mockSpawnState.stdout = 'pass';
    mockSpawnState.stderr = '';
    const req2 = makeRequest(ADMIN_KEY);
    const res2 = await supplyChainHandler(req2);
    const json2 = await res2.json();
    expect(json2.verified).toBe(true);

    // Prove spawn was called twice — no caching
    expect(mockSpawnState.callCount).toBe(2);
  });
});
