import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { TaskTimeoutError, ProxmoxConnectionError } from '../../../utils/errors';
import { retryProxmoxDelete } from './deleteRetry';
import type { ProxmoxTaskStatus } from '../vm.types';

/**
 * 3-way poll result:
 * - 'success'  — Proxmox task completed with exitstatus OK
 * - 'failed'   — Proxmox task completed with non-OK exitstatus (definitive failure)
 * - 'unknown'  — Could not reach Proxmox after all retries — task state is unknown
 *                The VM may or may not have been created. Do NOT treat as failure.
 *                Do NOT attempt cleanup. Save to MongoDB as 'creating' for reconciliation.
 */
export type PollResult = 'success' | 'failed' | 'unknown';

export interface PollTaskResult {
  result: PollResult;
  exitstatus?: string;
}

/**
 * Poll a Proxmox async task until it completes or times out.
 *
 * On network errors during polling: retries up to VM_POLL_NETWORK_RETRY_ATTEMPTS times
 * with VM_POLL_NETWORK_RETRY_DELAY_MS between each attempt before returning 'unknown'.
 *
 * CRITICAL distinction:
 * - Network error during polling ≠ task failure
 * - Only return 'failed' when Proxmox explicitly reports exitstatus ≠ OK
 * - Return 'unknown' when we genuinely cannot determine the outcome
 */
export async function pollTask(upid: string, node: string): Promise<PollTaskResult> {
  const pollInterval = config.VM_TASK_POLL_INTERVAL_MS;
  const timeout = config.VM_TASK_TIMEOUT_MS;
  const networkRetryAttempts = config.VM_POLL_NETWORK_RETRY_ATTEMPTS;
  const networkRetryDelay = config.VM_POLL_NETWORK_RETRY_DELAY_MS;
  const startTime = Date.now();

  // URL-encode the UPID — it contains colons and slashes
  const encodedUpid = encodeURIComponent(upid);

  let consecutiveNetworkErrors = 0;

  while (true) {
    if (Date.now() - startTime > timeout) {
      logger.warn('Proxmox task timed out', { upid, node, elapsedMs: Date.now() - startTime });
      throw new TaskTimeoutError(
        `Proxmox task timed out after ${timeout / 1000}s`,
        upid
      );
    }

    try {
      const response = await proxmoxClient.get<{ data: ProxmoxTaskStatus }>(
        `/nodes/${node}/tasks/${encodedUpid}/status`
      );

      // Successful poll — reset consecutive error counter
      consecutiveNetworkErrors = 0;

      const taskStatus = response.data.data;

      if (taskStatus.status === 'stopped') {
        if (taskStatus.exitstatus === 'OK') {
          logger.debug('Proxmox task completed successfully', { upid, node });
          return { result: 'success' };
        } else {
          // Proxmox explicitly reported failure — this is a definitive result
          logger.warn('Proxmox task failed', {
            upid,
            node,
            exitstatus: taskStatus.exitstatus,
          });
          return { result: 'failed', exitstatus: taskStatus.exitstatus };
        }
      }

      // Task still running — wait before next poll
      await sleep(pollInterval);
    } catch (error) {
      if (error instanceof TaskTimeoutError) throw error;

      consecutiveNetworkErrors++;

      logger.warn('Network error while polling Proxmox task — will retry', {
        upid,
        node,
        attempt: consecutiveNetworkErrors,
        maxAttempts: networkRetryAttempts,
        error: error instanceof Error ? error.message : String(error),
      });

      if (consecutiveNetworkErrors >= networkRetryAttempts) {
        // All retries exhausted — we don't know if the task succeeded or failed
        // Return 'unknown' so the caller can handle this safely (save VM, don't cleanup)
        logger.error('Polling failed after all retries — task outcome unknown', {
          upid,
          node,
          attempts: consecutiveNetworkErrors,
        });
        return { result: 'unknown' };
      }

      // Wait before retrying the poll
      await sleep(networkRetryDelay);
    }
  }
}

/**
 * Poll a task and optionally clean up the orphaned VM on definitive failure.
 *
 * IMPORTANT: cleanup only happens on 'failed' (Proxmox confirmed failure).
 * On 'unknown' (network error) — no cleanup, throws so caller can save VM to MongoDB.
 * This prevents orphaned VMs when connectivity is lost mid-poll.
 */
export async function pollTaskWithCleanup(
  upid: string,
  node: string,
  vmid: number,
  cleanupOnFail: boolean
): Promise<PollResult> {
  const pollOutcome = await pollTask(upid, node);

  if (pollOutcome.result === 'failed') {
    let cleanupFailure: string | undefined;

    if (cleanupOnFail) {
      logger.warn('VM creation task definitively failed — cleaning up orphaned VM', { vmid, node, upid });
      try {
        await retryProxmoxDelete(node, vmid);
        logger.info('Orphaned VM cleaned up successfully', { vmid, node });
      } catch (cleanupError) {
        cleanupFailure =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        logger.error('Failed to clean up orphaned VM after all purge-delete retries', {
          vmid,
          node,
          error: cleanupFailure,
        });
      }
    }

    const exitDetail = pollOutcome.exitstatus ? `: ${pollOutcome.exitstatus}` : '';
    let failureMessage = `Proxmox task failed for VM ${vmid} on node ${node} (upid: ${upid})${exitDetail}`;
    if (cleanupFailure) {
      failureMessage += `; orphan cleanup failed: ${cleanupFailure}`;
    }
    throw new ProxmoxConnectionError(failureMessage);
  }

  // 'unknown' — return it so caller (createSingleVM) can handle safely
  return pollOutcome.result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
