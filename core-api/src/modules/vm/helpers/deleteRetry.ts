import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { ProxmoxConnectionError } from '../../../utils/errors';
import { pollTask } from './proxmoxTaskPoll';
import { runThrottledNodeDelete } from './deleteQueue';

export type DeleteResult = 'deleted' | 'already_gone';

/** Query params sent on every Proxmox VM purge delete (logged for diagnostics). */
export const PROXMOX_PURGE_DELETE_PARAMS = {
  purge: 1,
  'destroy-unreferenced-disks': 1,
} as const;

/**
 * Attempt to delete a VM from Proxmox with exponential backoff retry.
 * Waits for async qmdestroy UPID tasks before returning success.
 */
export async function retryProxmoxDelete(node: string, vmid: number): Promise<DeleteResult> {
  return runThrottledNodeDelete(node, () => retryProxmoxDeleteInner(node, vmid));
}

async function retryProxmoxDeleteInner(node: string, vmid: number): Promise<DeleteResult> {
  const maxAttempts = config.VM_DELETE_MAX_RETRIES;
  const baseDelayMs = config.VM_DELETE_RETRY_BASE_DELAY_MS;

  let lastError: unknown;
  const endpoint = `/nodes/${node}/qemu/${vmid}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info('[VMDelete] Sending Proxmox purge delete', {
      vmid,
      node,
      attempt,
      maxAttempts,
      method: 'DELETE',
      endpoint,
      queryParams: PROXMOX_PURGE_DELETE_PARAMS,
    });

    try {
      const response = await proxmoxClient.delete<{ data?: string }>(endpoint, {
        params: { ...PROXMOX_PURGE_DELETE_PARAMS },
      });

      const upid = extractDestroyUpid(response.data);

      if (upid) {
        logger.info('[VMDelete] Polling qmdestroy task', { vmid, node, upid, attempt });
        const destroyOutcome = await pollTask(upid, node);

        if (destroyOutcome.result === 'failed') {
          const exitDetail = destroyOutcome.exitstatus ? `: ${destroyOutcome.exitstatus}` : '';
          throw new ProxmoxConnectionError(
            `Proxmox destroy task failed for VM ${vmid} on node ${node} (upid: ${upid})${exitDetail}`
          );
        }

        if (destroyOutcome.result === 'unknown') {
          throw new ProxmoxConnectionError(
            `Proxmox destroy task outcome unknown for VM ${vmid} on node ${node} (upid: ${upid})`
          );
        }

        logger.info('[VMDelete] qmdestroy task completed OK', { vmid, node, upid, attempt });
      } else {
        logger.info('[VMDelete] Proxmox purge delete completed synchronously (no UPID)', {
          vmid,
          node,
          attempt,
          httpStatus: response.status,
        });
      }

      logger.info('[VMDelete] Proxmox purge delete succeeded', {
        vmid,
        node,
        attempt,
        httpStatus: response.status,
        proxmoxResponse: response.data ?? null,
      });
      return 'deleted';
    } catch (err: unknown) {
      lastError = err;

      const errorDetail = proxmoxErrorDetail(err);
      const httpStatus = err instanceof ProxmoxConnectionError ? err.httpStatus : undefined;

      if (isAlreadyGoneError(err)) {
        logger.warn('[VMDelete] Proxmox VM config already absent — treating as deleted', {
          vmid,
          node,
          attempt,
          httpStatus,
          proxmoxError: errorDetail,
          note: 'Config missing does not guarantee cloudinit LVs were purged — reconciliation may clean up',
        });
        return 'already_gone';
      }

      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn('[VMDelete] Proxmox purge delete failed — retrying', {
          vmid,
          node,
          attempt,
          maxAttempts,
          retryInMs: delayMs,
          httpStatus,
          proxmoxError: errorDetail,
        });
        await sleep(delayMs);
      } else {
        logger.error('[VMDelete] Proxmox purge delete failed on final attempt', {
          vmid,
          node,
          attempt,
          httpStatus,
          proxmoxError: errorDetail,
        });
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

function extractDestroyUpid(data: { data?: string } | undefined): string | undefined {
  const upid = data?.data;
  if (typeof upid === 'string' && upid.startsWith('UPID:')) {
    return upid;
  }
  return undefined;
}

function proxmoxErrorDetail(err: unknown): string {
  if (err instanceof ProxmoxConnectionError) {
    return err.internalMessage || err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function isAlreadyGoneError(err: unknown): boolean {
  const msg = proxmoxErrorDetail(err).toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('no such') ||
    msg.includes('not found')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
