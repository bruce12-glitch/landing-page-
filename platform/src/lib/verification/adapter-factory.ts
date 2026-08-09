import type { VerificationAdapter } from './types';
import { GstSandboxAdapter } from './gst-sandbox-adapter';
import { GstnAdapter } from './gstn-adapter';

export function getVerificationAdapter(adapterName?: string): VerificationAdapter {
  const chosen = adapterName || process.env.VERIFICATION_ADAPTER || 'sandbox';

  if (chosen.toLowerCase() === 'gstn') {
    return new GstnAdapter();
  }

  return new GstSandboxAdapter();
}
