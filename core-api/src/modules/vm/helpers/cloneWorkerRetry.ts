/**
 * cloneWorkerRetry.ts
 *
 * Handles the Proxmox "no worker upid - start worker failed" transient error.
 * When Proxmox has no free worker at clone-request time, the task is immediately
 * marked stopped with that exitstatus — the VM was never created.
 * Each retry allocates a fresh VMID and re-posts the clone request.
 */

import { logger } from '../../../utils/logger';
import { config } from '../../../config';

/** Returns true when the exitstatus indicates a transient worker exhaustion. */
export function isWorkerUnavailableError(exitstatus: string | undefined): boolean {
  if (!exitstatus) return false;
  const s = exitstatus.toLowerCase();
  return s.includes('no worker upid') || s.includes('start worker failed');
}

/** Returns true when an error message looks like a worker-unavailable failure. */
export function isWorkerUnavailableMessage(message: string): boolean {
  const s = message.toLowerCase();
  return s.includes('no worker upid') || s.includes('start worker failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a clone-attempt function with worker-retry logic.
 *
 * @param attemptClone  Async function that performs one full clone attempt
 *                      (allocate VMID + POST clone + poll). Must throw on failure.
 * @param context       Log context (jobId, vmName, node).
 *
 * On "no worker upid" failures:
 *   1. Wait VM_CLONE_WORKER_RETRY_DELAY_MS ms.
 *   2. Retry the full clone with a fresh VMID, up to VM_CLONE_WORKER_RETRY_ATTEMPTS times.
 * All other errors are re-thrown immediately without retry.
 */
export async function withCloneWorkerRetry<T>(
  attemptClone: () => Promise<T>,
  context: { jobId: string; vmName: string; node: string }
): Promise<T> {
  const maxRetries = config.VM_CLONE_WORKER_RETRY_ATTEMPTS;
  const retryDelay = config.VM_CLONE_WORKER_RETRY_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await attemptClone();
    } catch (err: unknown) {
      lastError = err;

      const message = err instanceof Error ? err.message : String(err);
      const isWorkerError = isWorkerUnavailableMessage(message);

      // Not a worker error, or we've exhausted retries — give up immediately
      if (!isWorkerError || attempt >= maxRetries) {
        throw err;
      }

      logger.warn('[CloneRetry] Proxmox worker unavailable — waiting before retry', {
        ...context,
        attempt: attempt + 1,
        maxRetries,
        retryDelayMs: retryDelay,
        error: message,
      });

      await sleep(retryDelay);

      logger.info('[CloneRetry] Retrying clone after worker-unavailable error', {
        ...context,
        attempt: attempt + 1,
        maxRetries,
      });
    }
  }

  throw lastError;
}
