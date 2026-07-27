import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { TaskTimeoutError } from '../../../utils/errors';
import type { ProxmoxTaskStatus } from '../vm.types';

export type PollResult = 'success' | 'failed' | 'unknown';

export interface PollTaskResult {
  result: PollResult;
  exitstatus?: string;
}

/**
 * Poll a Proxmox async task until it completes or times out.
 */
export async function pollTask(upid: string, node: string): Promise<PollTaskResult> {
  const pollInterval = config.VM_TASK_POLL_INTERVAL_MS;
  const timeout = config.VM_TASK_TIMEOUT_MS;
  const networkRetryAttempts = config.VM_POLL_NETWORK_RETRY_ATTEMPTS;
  const networkRetryDelay = config.VM_POLL_NETWORK_RETRY_DELAY_MS;
  const startTime = Date.now();

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

      consecutiveNetworkErrors = 0;
      const taskStatus = response.data.data;

      if (taskStatus.status === 'stopped') {
        if (taskStatus.exitstatus === 'OK') {
          logger.debug('Proxmox task completed successfully', { upid, node });
          return { result: 'success' };
        }

        logger.warn('Proxmox task failed', {
          upid,
          node,
          exitstatus: taskStatus.exitstatus,
        });
        return { result: 'failed', exitstatus: taskStatus.exitstatus };
      }

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
        logger.error('Polling failed after all retries — task outcome unknown', {
          upid,
          node,
          attempts: consecutiveNetworkErrors,
        });
        return { result: 'unknown' };
      }

      await sleep(networkRetryDelay);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
