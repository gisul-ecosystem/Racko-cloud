import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';

export type DeleteResult = 'deleted' | 'already_gone';

/**
 * Attempt to delete a VM from Proxmox with exponential backoff retry.
 *
 * - If Proxmox returns 500 with "does not exist" → VM already gone, return 'already_gone'
 * - If network timeout / connection error → retry up to VM_DELETE_MAX_RETRIES times
 * - After all retries exhausted → throw the last error
 *
 * Backoff: attempt 1 immediately, attempt 2 after baseDelay, attempt 3 after baseDelay * 2, etc.
 */
export async function retryProxmoxDelete(node: string, vmid: number): Promise<DeleteResult> {
  const maxAttempts = config.VM_DELETE_MAX_RETRIES;
  const baseDelayMs = config.VM_DELETE_RETRY_BASE_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await proxmoxClient.delete(`/nodes/${node}/qemu/${vmid}`, {
        params: { purge: 1, 'destroy-unreferenced-disks': 1 },
      });
      return 'deleted';
    } catch (err: unknown) {
      lastError = err;

      // Check if Proxmox says the VM config doesn't exist — already gone
      if (isAlreadyGoneError(err)) {
        logger.info('VM already absent from Proxmox — treating delete as success', { vmid, node });
        return 'already_gone';
      }

      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn('Proxmox delete attempt failed — retrying', {
          vmid,
          node,
          attempt,
          maxAttempts,
          retryInMs: delayMs,
          error: err instanceof Error ? err.message : String(err),
        });
        await sleep(delayMs);
      }
    }
  }

  logger.error('All Proxmox delete attempts exhausted', {
    vmid,
    node,
    maxAttempts,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw lastError;
}

/**
 * Detect Proxmox "VM does not exist" errors.
 * Proxmox returns HTTP 500 with message containing "does not exist" when
 * the VM config file is missing — meaning the VM is already gone.
 */
function isAlreadyGoneError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('no such') ||
    msg.includes('not found') ||
    msg.includes('500')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
