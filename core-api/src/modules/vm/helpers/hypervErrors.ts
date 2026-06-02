import { ProxmoxConnectionError, ProxmoxAuthError } from '../../../utils/errors';

export function errMessage(err: unknown): string {
  return classifyHyperVError(err).message;
}

export function isRetryableHyperVError(err: unknown): boolean {
  return classifyHyperVError(err).retryable;
}

/** Map thrown errors to a user-visible message and whether to retry. */
export function classifyHyperVError(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof ProxmoxConnectionError) {
    const msg = err.internalMessage.trim() || err.message;
    if (/guest agent is not running/i.test(msg)) {
      return { message: 'Guest agent is not available. Ensure the VM is running and the QEMU guest agent is installed.', retryable: true };
    }
    return { message: msg, retryable: err.isRetryable };
  }
  if (err instanceof ProxmoxAuthError) {
    return { message: 'Could not authenticate with the virtualization host.', retryable: false };
  }
  if (err instanceof Error) return { message: err.message, retryable: false };
  return { message: String(err), retryable: false };
}
