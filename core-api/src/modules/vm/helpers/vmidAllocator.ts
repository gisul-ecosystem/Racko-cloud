import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';

const MAX_VMID_ATTEMPTS = 10;

/**
 * Allocate a verified free VMID on the Proxmox cluster.
 *
 * Problem with plain GET /cluster/nextid:
 *   Proxmox returns the next free ID at the moment of the call, but does not
 *   reserve it. If another operation (external API call, manual Proxmox UI action,
 *   or a parallel clone that hasn't written its conf file yet) grabs the same ID
 *   before our clone POST lands, Proxmox will reject with a lock timeout or
 *   "conf does not exist" error on the new VMID.
 *
 * Fix:
 *   After getting a candidate VMID, verify it is genuinely free by checking
 *   GET /cluster/resources?type=vm. If the ID already appears in the cluster
 *   resource list, skip it and try the next one. Repeat up to MAX_VMID_ATTEMPTS.
 *
 * This runs inside the caller's mutex so it is already serialised within the
 * process — the check just closes the external-race window.
 */
export async function allocateVerifiedVmid(node: string): Promise<number> {
  for (let attempt = 1; attempt <= MAX_VMID_ATTEMPTS; attempt++) {
    // Ask Proxmox for the next suggested free VMID
    const nextIdResponse = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
    const candidate = nextIdResponse.data.data;

    // Verify the candidate is not already in use cluster-wide
    const taken = await isVmidTaken(candidate);

    if (!taken) {
      if (attempt > 1) {
        logger.info('[VMIDAllocator] Found free VMID after skipping conflicts', {
          candidate,
          attempt,
          node,
        });
      }
      return candidate;
    }

    logger.warn('[VMIDAllocator] Candidate VMID already in use — retrying', {
      candidate,
      attempt,
      node,
    });
  }

  throw new Error(
    `Could not allocate a free VMID after ${MAX_VMID_ATTEMPTS} attempts. ` +
    `The cluster may be under heavy load or have VMID exhaustion.`
  );
}

/**
 * Returns true if the given VMID already exists anywhere in the cluster
 * (running, stopped, template, or in the process of being created).
 */
async function isVmidTaken(vmid: number): Promise<boolean> {
  try {
    const res = await proxmoxClient.get<{
      data: Array<{ vmid: number; type: string }>;
    }>('/cluster/resources?type=vm');

    return res.data.data.some((r) => r.vmid === vmid);
  } catch (err) {
    logger.warn('[VMIDAllocator] Could not verify VMID availability — assuming taken', {
      vmid,
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}
