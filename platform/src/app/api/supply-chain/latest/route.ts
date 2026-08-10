import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

interface AttestationManifest {
  gitSha: string;
  sbomPath: string;
  sbomSha256: string;
  specVersion: string;
  componentCount: number;
  generatedAt: string;
  tool: string;
  toolVersion: string;
  provenance: string;
}

/**
 * Runs verify.sh synchronously and returns { exitCode, stdout, stderr }.
 * TRUTH RULE: We NEVER cache or store the verification result.
 * Every request re-computes by spawning verify.sh at request time.
 */
async function runVerifyScript(): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const platformDir = path.resolve(process.cwd());
  const verifyScript = path.join(platformDir, 'scripts', 'verify.sh');

  return new Promise((resolve) => {
    const child = spawn('bash', [verifyScript], {
      cwd: platformDir,
      env: { ...process.env, COSIGN_KEYLESS: process.env.COSIGN_KEYLESS || 'dev' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8');
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8');
    });

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on('error', () => {
      resolve({ exitCode: 1, stdout, stderr });
    });
  });
}

/**
 * GET /api/supply-chain/latest
 *
 * Admin-only endpoint that returns the current build's attestation status.
 * The `verified` field is computed by ACTUALLY spawning verify.sh at request
 * time — never a stored claim. No attestation → honest 404.
 */
export async function GET(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const gitSha = process.env.BUILD_SHA || 'unknown';
  const platformDir = path.resolve(process.cwd());
  const manifestPath = path.join(platformDir, 'artifacts', `manifest-${gitSha}.json`);
  const sbomPath = path.join(
    platformDir,
    'artifacts',
    'sbom',
    `platform-${gitSha}.cdx.json`
  );

  // --- Honest 404: no attestation artifacts exist ---
  let manifest: AttestationManifest | null = null;
  try {
    const raw = await readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as AttestationManifest;
  } catch {
    return NextResponse.json(
      {
        error: 'No attestation found',
        detail: 'SBOM has not been generated for this build. Run npm run sbom in CI.',
        gitSha,
      },
      { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  // --- Check signature presence ---
  const sbomSigPath = `${sbomPath}.sig`;
  let signaturePresent = false;
  try {
    await readFile(sbomSigPath);
    signaturePresent = true;
  } catch {
    signaturePresent = false;
  }

  // --- TRUTH RULE: Compute verification by spawning verify.sh NOW ---
  const verifyResult = await runVerifyScript();
  const verified = verifyResult.exitCode === 0;

  return NextResponse.json(
    {
      gitSha: manifest.gitSha,
      sbomSha256: manifest.sbomSha256,
      signaturePresent,
      verified,
      verifiedAt: new Date().toISOString(),
      verifyExitCode: verifyResult.exitCode,
      // In CI, these are produced by the supply-chain workflow.
      // Locally, cosign/syft may be absent — verified will be false.
      provenance: manifest.provenance,
      specVersion: manifest.specVersion,
      componentCount: manifest.componentCount,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
