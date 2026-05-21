import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { TaskTimeoutError, ProxmoxConnectionError } from '../../../utils/errors';
import type { ProxmoxTaskStatus } from '../vm.types';

/**
 * Poll a Proxmox async task until it completes or times out.
 *
 * Proxmox operations are async — they return a UPID (task ID).
 * We must poll GET /nodes/{node}/tasks/{upid}/status until done.
 *
 * @returns 'success' | 'failed'
 */
export async function pollTask(upid: string, node: string): Promise<'success' | 'failed'> {
  const pollInterval = config.VM_TASK_POLL_INTERVAL_MS;
  const timeout = config.VM_TASK_TIMEOUT_MS;
  const startTime = Date.now();

  // URL-encode the UPID — it contains colons and slashes
  const encodedUpid = encodeURIComponent(upid);

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

      const taskStatus = response.data.data;

      if (taskStatus.status === 'stopped') {
        if (taskStatus.exitstatus === 'OK') {
          logger.debug('Proxmox task completed successfully', { upid, node });
          return 'success';
        } else {
          logger.warn('Proxmox task failed', {
            upid,
            node,
            exitstatus: taskStatus.exitstatus,
          });
          return 'failed';
        }
      }

      // Task still running — wait before next poll
      await sleep(pollInterval);
    } catch (error) {
      if (error instanceof TaskTimeoutError) throw error;

      // Node unreachable during polling
      logger.error('Failed to poll Proxmox task status', {
        upid,
        node,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ProxmoxConnectionError(
        `Failed to poll task ${upid} on node ${node}: ${String(error)}`
      );
    }
  }
}

/**
 * Poll a task and optionally clean up the orphaned VM on failure.
 * Used during VM creation — if task fails, we delete the partial VM.
 */
export async function pollTaskWithCleanup(
  upid: string,
  node: string,
  vmid: number,
  cleanupOnFail: boolean
): Promise<void> {
  const result = await pollTask(upid, node);

  if (result === 'failed') {
    if (cleanupOnFail) {
      logger.warn('VM creation task failed — cleaning up orphaned VM', { vmid, node, upid });
      try {
        await proxmoxClient.delete(`/nodes/${node}/qemu/${vmid}`);
        logger.info('Orphaned VM cleaned up successfully', { vmid, node });
      } catch (cleanupError) {
        // Log but don't throw — cleanup is best-effort
        logger.error('Failed to clean up orphaned VM', {
          vmid,
          node,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    }
    throw new ProxmoxConnectionError(
      `Proxmox task failed for VM ${vmid} on node ${node} (upid: ${upid})`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
