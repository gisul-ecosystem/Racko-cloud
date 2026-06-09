import { logger } from '../../../utils/logger';
import { ProxmoxConnectionError } from '../../../utils/errors';
import { retryProxmoxDelete } from './deleteRetry';
import { pollTask, type PollResult, type PollTaskResult } from './proxmoxTaskPoll';

export type { PollResult, PollTaskResult };
export { pollTask };

/**
 * Poll a task and optionally clean up the orphaned VM on definitive failure.
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

  return pollOutcome.result;
}
