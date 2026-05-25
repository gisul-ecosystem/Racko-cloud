import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import type { ProxmoxNodeRaw, ProxmoxStorageRaw, NodeResources, StoragePool } from '../vm.types';

function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

/**
 * Fetch all online nodes with their current resource usage and storage pools.
 * Single source of truth — used by both resourceValidator and placementEngine.
 *
 * Returns NodeResources[] sorted by placement score descending.
 */
export async function fetchNodeCapacities(): Promise<NodeResources[]> {
  const nodesResponse = await proxmoxClient.get<{ data: ProxmoxNodeRaw[] }>('/nodes');
  const onlineNodes = nodesResponse.data.data.filter((n) => n.status === 'online');

  if (onlineNodes.length === 0) return [];

  // Fetch storage for each node in parallel (best-effort)
  const storageResults = await Promise.allSettled(
    onlineNodes.map((node) =>
      proxmoxClient
        .get<{ data: ProxmoxStorageRaw[] }>(`/nodes/${node.node}/storage`)
        .then((r) => ({ node: node.node, storage: r.data.data }))
    )
  );

  const storageByNode = new Map<string, StoragePool[]>();
  for (let i = 0; i < storageResults.length; i++) {
    const result = storageResults[i];
    const nodeName = onlineNodes[i]?.node ?? 'unknown';

    if (result.status === 'fulfilled') {
      const pools: StoragePool[] = result.value.storage
        .filter(
          (s) =>
            s.active === 1 &&
            s.enabled === 1 &&
            s.content &&
            s.content.includes('images')
        )
        .map((s) => ({
          name: s.storage,
          totalGb: bytesToGb(s.total),
          freeGb: bytesToGb(s.avail),
          type: s.type,
        }));
      storageByNode.set(result.value.node, pools);
    } else {
      logger.warn('Failed to fetch storage for node', {
        node: nodeName,
        reason:
          result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      storageByNode.set(nodeName, []);
    }
  }

  return onlineNodes.map((node) => {
    const pools = storageByNode.get(node.node) ?? [];
    const totalStorageGb = pools.reduce((sum, p) => sum + p.totalGb, 0);
    const freeStorageGb = pools.reduce((sum, p) => sum + p.freeGb, 0);
    const usedStorageGb = totalStorageGb - freeStorageGb;

    const totalMemGb = bytesToGb(node.maxmem);
    const usedMemGb = bytesToGb(node.mem);
    const freeMemGb = Math.max(0, totalMemGb - usedMemGb);

    const freeMemPercent = totalMemGb > 0 ? (freeMemGb / totalMemGb) * 100 : 0;
    const freeCpuPercent = (1 - node.cpu) * 100;
    const freeStoragePercent = totalStorageGb > 0 ? (freeStorageGb / totalStorageGb) * 100 : 0;

    // Placement score: RAM weighted highest (most constrained resource)
    const score =
      freeCpuPercent * 0.3 + freeMemPercent * 0.4 + freeStoragePercent * 0.3;

    return {
      node: node.node,
      status: 'online' as const,
      cpu: {
        total: node.maxcpu,
        used: node.cpu,
        freePercent: freeCpuPercent,
      },
      memory: {
        totalGb: totalMemGb,
        usedGb: usedMemGb,
        freeGb: freeMemGb,
        freePercent: freeMemPercent,
      },
      storage: {
        totalGb: totalStorageGb,
        usedGb: usedStorageGb,
        freeGb: freeStorageGb,
        freePercent: freeStoragePercent,
        pools,
      },
      score,
    };
  });
}

/**
 * Calculate effective free CPU for a node applying overcommit ratio.
 */
export function effectiveFreeCpu(node: NodeResources): number {
  const effective = node.cpu.total * config.VM_CPU_OVERCOMMIT_RATIO;
  const used = node.cpu.used * node.cpu.total;
  return Math.max(0, effective - used);
}

/**
 * Calculate effective free RAM for a node applying overcommit ratio.
 */
export function effectiveFreeRamGb(node: NodeResources): number {
  const effective = node.memory.totalGb * config.VM_RAM_OVERCOMMIT_RATIO;
  return Math.max(0, effective - node.memory.usedGb);
}
