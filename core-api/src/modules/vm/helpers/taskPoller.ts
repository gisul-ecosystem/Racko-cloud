import { logger } from '../../../utils/logger';
import { ProxmoxConnectionError } from '../../../utils/errors';
import { retryProxmoxDelete } from './deleteRetry';
import { pollTask, type PollResult, type PollTaskResult } from './proxmoxTaskPoll';
import { isWorkerUnavailableError } from './cloneWorkerRetry';

export type { PollResult, PollTaskResult };
export { pollTask };

/**
 * Poll a task and optionally clean up the orphaned VM on definitive failure.
 *
 * Special case: when the exitstatus indicates "no worker upid / start worker failed",
 * the clone task never ran so there is no orphan to clean up. We skip cleanup and
 * throw a ProxmoxConnectionError that embeds the exitstatus so the caller's
 * withCloneWorkerRetry wrapper can detect and retry the full clone.
 */
export async function pollTaskWithCleanup(
  upid: string,
  node: string,
  vmid: number,
  cleanupOnFail: boolean
): Promise<PollResult> {
  const pollOutcome = await pollTask(upid, node);

  if (pollOutcome.result === 'failed') {
    // Worker-unavailable errors mean the clone task never started — no VM was created,
    // so cleanup is not needed. Re-throw immediately so the retry wrapper can handle it.
    if (isWorkerUnavailableError(pollOutcome.exitstatus)) {
      logger.warn('Proxmox clone task failed — worker unavailable (no orphan to clean up)', {
        vmid,
        node,
        upid,
        exitstatus: pollOutcome.exitstatus,
      });
      throw new ProxmoxConnectionError(
        `Proxmox task failed for VM ${vmid} on node ${node} (upid: ${upid}): ${pollOutcome.exitstatus}`
      );
    }

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

  return pollOutcome.result;
}
