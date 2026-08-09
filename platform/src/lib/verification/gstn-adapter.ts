import type { VerificationAdapter, VerificationJob, Verdict } from './types';

export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotConfiguredError';
  }
}

/**
 * Production GSTN Government API Portal Adapter Stub.
 * Throws NotConfiguredError as live production credentials are not wired in sandbox mode.
 */
export class GstnAdapter implements VerificationAdapter {
  public readonly name = 'GstnAdapter';

  public async verify(_job: VerificationJob): Promise<Verdict> {
    throw new NotConfiguredError(
      'Government GSTN Production Adapter is not configured in this environment. Set VERIFICATION_ADAPTER=sandbox for testing.'
    );
  }
}
