import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanSbom } from '../lib/supply-chain/cve-scanner';
import { GET as supplyChainHandler } from '../app/api/supply-chain/latest/route';
import { EventEmitter } from 'node:events';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mock node:child_process (isolated to this test file)
// ---------------------------------------------------------------------------
const mockSpawnState = {
  exitCode: 1,
  stdout: '',
  stderr: '',
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
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

function cyclex(specVersion: string, components: Array<{ name: string; version: string }>) {
  return {
    bomFormat: 'CycloneDX',
    specVersion,
    components,
  };
}

async function writeAttestation(opts: {
  componentCount: number;
  sbom: unknown;
  signed: boolean;
  spawnExit: number;
  spawnStdout?: string;
  spawnStderr?: string;
}) {
  const gitSha = process.env.BUILD_SHA || 'unknown';
  const manifestPath = path.join(ARTIFACTS_DIR, `manifest-${gitSha}.json`);
  const sbomPath = path.join(SBOM_DIR, `platform-${gitSha}.cdx.json`);

  await writeFile(
    manifestPath,
    JSON.stringify({
      gitSha,
      sbomPath,
      sbomSha256: '0'.repeat(64),
      specVersion: '1.6',
      componentCount: opts.componentCount,
      generatedAt: new Date().toISOString(),
      tool: 'syft',
      toolVersion: 'v1.12.2',
      provenance: 'test-policy',
    })
  );
  await writeFile(sbomPath, JSON.stringify(opts.sbom));
  if (opts.signed) await writeFile(`${sbomPath}.sig`, 'fakesig');

  mockSpawnState.exitCode = opts.spawnExit;
  mockSpawnState.stdout = opts.spawnStdout ?? '';
  mockSpawnState.stderr = opts.spawnStderr ?? '';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Vulnerability Policy Engine & Supply-Chain Policy (Module 2, Slice 2)', () => {
  beforeEach(async () => {
    mockSpawnState.exitCode = 1;
    mockSpawnState.stdout = '';
    mockSpawnState.stderr = '';
    await mkdir(SBOM_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(ARTIFACTS_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // --- Test 1: Clean SBOM → PASS, riskScore < 20 ---
  it('Clean SBOM yields policyVerdict PASS and riskScore < 20', () => {
    const result = scanSbom(
      cyclex('1.6', [
        { name: 'lodash', version: '4.17.21' },
        { name: 'express', version: '4.17.3' },
        { name: 'chalk', version: '4.1.0' },
      ])
    );

    expect(result.totalPackages).toBe(3);
    expect(result.vulnerabilities).toHaveLength(0);
    expect(result.criticalCount).toBe(0);
    expect(result.highCount).toBe(0);
    expect(result.policyVerdict).toBe('PASS');
    expect(result.riskScore).toBeLessThan(20);
  });

  // --- Test 2: Known critical CVE → fail-closed BLOCK ---
  it('SBOM with known critical CVE fails-closed with policyVerdict BLOCK', () => {
    const result = scanSbom(
      cyclex('1.6', [{ name: 'xz', version: '5.6.1' }])
    );

    expect(result.criticalCount).toBeGreaterThan(0);
    expect(result.policyVerdict).toBe('BLOCK');
    expect(result.riskScore).toBeGreaterThanOrEqual(90);
    expect(result.vulnerabilities[0]?.id).toBe('CVE-2024-3094');
    expect(result.vulnerabilities[0]?.cvssScore).toBeGreaterThanOrEqual(9.0);
  });

  // --- Test 3: HIGH-only SBOM → WARN, riskScore 40-89 ---
  it('SBOM with only HIGH vulnerabilities yields WARN and riskScore 40-89', () => {
    const result = scanSbom(
      cyclex('1.6', [{ name: 'lodash', version: '4.17.20' }])
    );

    expect(result.highCount).toBeGreaterThan(0);
    expect(result.criticalCount).toBe(0);
    expect(result.policyVerdict).toBe('WARN');
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(result.riskScore).toBeLessThanOrEqual(89);
  });

  // --- Test 4: Non-vulnerable version matches nothing (deterministic) ---
  it('Non-vulnerable pinned version produces zero matches', () => {
    const result = scanSbom(
      cyclex('1.6', [
        { name: 'xz', version: '5.6.2' }, // fixed
        { name: 'lodash', version: '4.17.21' }, // fixed
      ])
    );

    expect(result.vulnerabilities).toHaveLength(0);
    expect(result.policyVerdict).toBe('PASS');
    expect(result.totalPackages).toBe(2);
  });

  // --- Test 5: Malformed / empty SBOM degrades to empty scan ---
  it('Empty or malformed SBOM degrades to an empty scan without throwing', () => {
    expect(scanSbom(null).totalPackages).toBe(0);
    expect(scanSbom('not-an-object').policyVerdict).toBe('PASS');
    expect(scanSbom({ components: [] }).totalPackages).toBe(0);
  });

  // --- Test 6: Unsigned artifact fails-closed with status FLAGGED ---
  it('Unsigned artifact fails-closed with status FLAGGED', async () => {
    await writeAttestation({
      componentCount: 0,
      sbom: cyclex('1.6', []),
      signed: false,
      spawnExit: 1,
      spawnStderr: 'missing signature',
    });

    const res = await supplyChainHandler(makeRequest(ADMIN_KEY));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.signaturePresent).toBe(false);
    expect(json.verified).toBe(false);
    expect(json.status).toBe('FLAGGED');
  });

  // --- Test 7: E2E endpoint returns new scanResult JSON schema ---
  it('E2E endpoint asserts the new scanResult response schema', async () => {
    await writeAttestation({
      componentCount: 2,
      sbom: cyclex('1.6', [
        { name: 'lodash', version: '4.17.21' },
        { name: 'express', version: '4.17.3' },
      ]),
      signed: true,
      spawnExit: 0,
      spawnStdout: '[verify] ✅ SBOM signature valid.',
    });

    const res = await supplyChainHandler(makeRequest(ADMIN_KEY));
    expect(res.status).toBe(200);
    const json = await res.json();

    // New schema surface
    expect(json.verified).toBe(true);
    expect(json.status).toBe('VERIFIED');
    expect(json.scanResult).toBeDefined();
    expect(json.scanResult.totalPackages).toBe(2);
    expect(json.scanResult.policyVerdict).toBe('PASS');
    expect(typeof json.scanResult.riskScore).toBe('number');
    expect(typeof json.scanResult.scannedAt).toBe('string');
    expect(Array.isArray(json.scanResult.vulnerabilities)).toBe(true);
    expect(json.scanResult.criticalCount).toBe(0);
    expect(json.scanResult.highCount).toBe(0);
  });

  // --- Test 8: Signed TROJAN — valid signature + critical CVE → FLAGGED ---
  it('Signed artifact with critical CVE still fails closed (signed-trojan defense)', async () => {
    await writeAttestation({
      componentCount: 1,
      sbom: cyclex('1.6', [{ name: 'xz', version: '5.6.1' }]),
      signed: true,
      spawnExit: 0, // cosign verifies provenance
      spawnStdout: '[verify] ✅ SBOM signature valid.',
    });

    const res = await supplyChainHandler(makeRequest(ADMIN_KEY));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Signature is valid (provenance OK)...
    expect(json.verified).toBe(true);
    expect(json.signaturePresent).toBe(true);
    // ...but the vulnerability policy BLOCKS it — build is NOT trusted.
    expect(json.scanResult.policyVerdict).toBe('BLOCK');
    expect(json.scanResult.criticalCount).toBe(1);
    expect(json.status).toBe('FLAGGED');
  });
});
