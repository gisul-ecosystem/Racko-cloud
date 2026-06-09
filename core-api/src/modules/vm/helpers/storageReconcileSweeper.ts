import { proxmoxClient } from '../../../utils/proxmoxClient';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { VM } from '../vm.model';

const CLOUDINIT_VOL_PATTERN = /^vm-(\d+)-cloudinit$/;

interface StorageContentItem {
  volid: string;
  content?: string;
}

/**
 * Remove orphan cloudinit LVs: no Proxmox VM config and no non-deleted record in MongoDB.
 * Does not touch VMs that exist in Proxmox (any power state) or active DB records.
 */
export function startStorageReconcileSweeper(): void {
  if (!config.VM_STORAGE_RECONCILE_ENABLED) {
    logger.info('[StorageReconcile] sweeper disabled (VM_STORAGE_RECONCILE_ENABLED=false)');
    return;
  }

  const intervalMs = config.VM_STORAGE_RECONCILE_INTERVAL_MS;

  const tick = (): void => {
    void runStorageReconciliation().catch((err: unknown) => {
      logger.warn('[StorageReconcile] sweeper tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  tick();
  setInterval(tick, intervalMs);

  logger.info('[StorageReconcile] sweeper started', {
    intervalMs,
    dryRun: config.VM_STORAGE_RECONCILE_DRY_RUN,
  });
}

export async function runStorageReconciliation(): Promise<void> {
  const nodesResponse = await proxmoxClient.get<{
    data: Array<{ node: string; status: string }>;
  }>('/nodes');

  const onlineNodes = nodesResponse.data.data.filter((n) => n.status === 'online');

  for (const { node } of onlineNodes) {
    await reconcileNode(node);
  }
}

async function reconcileNode(node: string): Promise<void> {
  const proxmoxVmids = await fetchProxmoxVmids(node);
  const protectedDbVmids = await fetchProtectedDbVmids(node);

  const storageResponse = await proxmoxClient.get<{
    data: Array<{ storage: string; active: number; enabled: number; content: string }>;
  }>(`/nodes/${node}/storage`);

  const imageStorages = storageResponse.data.data.filter(
    (s) => s.active === 1 && s.enabled === 1 && s.content?.includes('images')
  );

  for (const pool of imageStorages) {
    await reconcileStoragePool(node, pool.storage, proxmoxVmids, protectedDbVmids);
  }
}

async function fetchProxmoxVmids(node: string): Promise<Set<number>> {
  const response = await proxmoxClient.get<{
    data: Array<{ vmid: number }>;
  }>(`/nodes/${node}/qemu`);

  return new Set(response.data.data.map((vm) => vm.vmid));
}

/** VMIDs that must never have storage removed by reconciliation. */
async function fetchProtectedDbVmids(node: string): Promise<Set<number>> {
  const vms = await VM.find({
    node,
    status: { $ne: 'deleted' },
  })
    .select('vmid')
    .lean();

  return new Set(vms.map((vm) => vm.vmid));
}

async function reconcileStoragePool(
  node: string,
  storage: string,
  proxmoxVmids: Set<number>,
  protectedDbVmids: Set<number>
): Promise<void> {
  let items: StorageContentItem[];

  try {
    const contentResponse = await proxmoxClient.get<{ data: StorageContentItem[] }>(
      `/nodes/${node}/storage/${storage}/content`,
      { params: { content: 'images' } }
    );
    items = contentResponse.data.data ?? [];
  } catch (err) {
    logger.warn('[StorageReconcile] failed to list storage content', {
      node,
      storage,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (const item of items) {
    const volName = item.volid.includes(':')
      ? item.volid.split(':').slice(1).join(':')
      : item.volid;

    const match = CLOUDINIT_VOL_PATTERN.exec(volName);
    if (!match) continue;

    const vmid = Number(match[1]);

    if (proxmoxVmids.has(vmid)) {
      logger.debug('[StorageReconcile] skip — VM config exists in Proxmox', {
        node,
        storage,
        vmid,
        volid: item.volid,
      });
      continue;
    }

    if (protectedDbVmids.has(vmid)) {
      logger.debug('[StorageReconcile] skip — active VM record in database', {
        node,
        storage,
        vmid,
        volid: item.volid,
      });
      continue;
    }

    if (config.VM_STORAGE_RECONCILE_DRY_RUN) {
      logger.warn('[StorageReconcile] DRY RUN — would remove orphan volume', {
        node,
        storage,
        vmid,
        volid: item.volid,
      });
      continue;
    }

    try {
      const encodedVolume = encodeURIComponent(item.volid);
      await proxmoxClient.delete(
        `/nodes/${node}/storage/${storage}/content/${encodedVolume}`
      );
      logger.info('[StorageReconcile] removed orphan cloudinit volume', {
        node,
        storage,
        vmid,
        volid: item.volid,
      });
    } catch (err) {
      logger.error('[StorageReconcile] failed to remove orphan volume', {
        node,
        storage,
        vmid,
        volid: item.volid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
