import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { InsufficientResourcesError } from '../../../utils/errors';
import type { NodeResources, RequiredResources, ProxmoxNodeRaw, ProxmoxStorageRaw, StoragePool } from '../vm.types';

// ─── Private helpers ──────────────────────────────────────────────────────────

function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

/**
 * Fetch all online nodes with their current resource usage.
 * CRITICAL: Never hardcode node names — always discover dynamically.
 */
async function fetchNodeResources(): Promise<NodeResources[]> {
  // Step 1: Discover all nodes dynamically
  const nodesResponse = await proxmoxClient.get<{ data: ProxmoxNodeRaw[] }>('/nodes');
  const allNodes = nodesResponse.data.data;

  // Step 2: Filter online nodes only
  const onlineNodes = allNodes.filter((n) => n.status === 'online');

  if (onlineNodes.length === 0) {
    throw new InsufficientResourcesError(
      'No online nodes available in the cluster.',
      0,
      0,
      'nodes'
    );
  }

  // Step 3: Fetch storage for each online node in parallel (best-effort)
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
      // Only include active, enabled storage that supports VM images
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
      logger.warn('Failed to fetch storage for node during placement', {
        node: nodeName,
        reason:
          result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      storageByNode.set(nodeName, []);
    }
  }

  // Step 4: Build NodeResources for each online node
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
 * Filter nodes eligible for the given resource requirements.
 * Applies overcommit ratios from config.
 */
function filterEligibleNodes(
  nodes: NodeResources[],
  required: RequiredResources
): NodeResources[] {
  return nodes.filter((node) => {
    // CPU check with overcommit ratio
    const effectiveCpuCapacity = node.cpu.total * config.VM_CPU_OVERCOMMIT_RATIO;
    const usedCpu = node.cpu.used * node.cpu.total;
    const freeCpu = effectiveCpuCapacity - usedCpu;
    if (freeCpu < required.cpuCores) return false;

    // RAM check with overcommit ratio
    const effectiveRamGb = node.memory.totalGb * config.VM_RAM_OVERCOMMIT_RATIO;
    const freeRamGb = effectiveRamGb - node.memory.usedGb;
    if (freeRamGb < required.memoryGb) return false;

    // Storage check — only for dedicated_storage (full clone)
    if (required.cloneType === 'dedicated_storage') {
      if (node.storage.freeGb < required.diskGb) return false;
    }
    // dynamic_storage (linked clone): no storage reservation check

    return true;
  });
}

/**
 * Select the best single node for VM placement.
 * Scores nodes and returns the highest-scored eligible node.
 * excludeNodes: optional list of node names to skip (used for rerouting after failure).
 */
export async function selectNode(
  required: RequiredResources,
  excludeNodes: string[] = []
): Promise<NodeResources> {
  const allNodes = await fetchNodeResources();
  const filtered = excludeNodes.length > 0
    ? allNodes.filter((n) => !excludeNodes.includes(n.node))
    : allNodes;
  const eligible = filterEligibleNodes(filtered, required);

  if (eligible.length === 0) {
    const maxPossible = calculateMaxPossible(filtered, required);
    throw new InsufficientResourcesError(
      `Insufficient resources. You can create maximum ${maxPossible} VMs with these specs.`,
      1,
      maxPossible,
      determineBottleneck(filtered, required)
    );
  }

  // Sort by score descending — highest score = most available resources
  eligible.sort((a, b) => b.score - a.score);
  return eligible[0]!;
}

/**
 * Select nodes for bulk VM creation, distributing VMs intelligently across nodes.
 * Returns array of {node, vmCount} allocations.
 */
export async function selectNodesForBulk(
  required: RequiredResources,
  count: number
): Promise<Array<{ node: string; vmCount: number }>> {
  const allNodes = await fetchNodeResources();
  const eligible = filterEligibleNodes(allNodes, required);

  if (eligible.length === 0) {
    const maxPossible = calculateMaxPossible(allNodes, required);
    throw new InsufficientResourcesError(
      `Insufficient resources. You can create maximum ${maxPossible} VMs with these specs.`,
      count,
      maxPossible,
      determineBottleneck(allNodes, required)
    );
  }

  // Sort by score descending
  eligible.sort((a, b) => b.score - a.score);

  const allocations: Array<{ node: string; vmCount: number }> = [];
  let remaining = count;

  for (const node of eligible) {
    if (remaining <= 0) break;

    let nodeCapacity: number;

    if (required.cloneType === 'dedicated_storage') {
      // Calculate how many VMs this node can fit based on storage
      const storageCapacity = Math.floor(node.storage.freeGb / required.diskGb);

      // Also check RAM capacity with overcommit
      const effectiveRamGb = node.memory.totalGb * config.VM_RAM_OVERCOMMIT_RATIO;
      const freeRamGb = effectiveRamGb - node.memory.usedGb;
      const ramCapacity = Math.floor(freeRamGb / required.memoryGb);

      // Also check CPU capacity with overcommit
      const effectiveCpuCapacity = node.cpu.total * config.VM_CPU_OVERCOMMIT_RATIO;
      const usedCpu = node.cpu.used * node.cpu.total;
      const freeCpu = effectiveCpuCapacity - usedCpu;
      const cpuCapacity = Math.floor(freeCpu / required.cpuCores);

      nodeCapacity = Math.min(storageCapacity, ramCapacity, cpuCapacity);
    } else {
      // dynamic_storage: distribute by load score — no hard storage limit
      // Distribute proportionally based on score
      const totalScore = eligible.reduce((sum, n) => sum + n.score, 0);
      const proportion = totalScore > 0 ? node.score / totalScore : 1 / eligible.length;
      nodeCapacity = Math.ceil(count * proportion);
    }

    if (nodeCapacity <= 0) continue;

    const vmCount = Math.min(nodeCapacity, remaining);
    allocations.push({ node: node.node, vmCount });
    remaining -= vmCount;
  }

  if (remaining > 0) {
    if (required.cloneType === 'dedicated_storage') {
      // For dedicated storage, we can't exceed physical capacity
      const maxPossible = count - remaining;
      if (maxPossible === 0) {
        throw new InsufficientResourcesError(
          `Insufficient resources. You can create maximum ${maxPossible} VMs with these specs.`,
          count,
          maxPossible,
          'storage'
        );
      }
      // Partial allocation — return what we can
      logger.warn('Partial bulk allocation due to insufficient resources', {
        requested: count,
        allocated: maxPossible,
      });
    }
    // dynamic_storage: proceed with what's possible
  }

  return allocations.filter((a) => a.vmCount > 0);
}

/**
 * Get the best storage pool on a node for VM placement.
 * Returns the pool with the most free space.
 */
export function getBestStoragePool(node: NodeResources): string | undefined {
  if (node.storage.pools.length === 0) return undefined;
  const sorted = [...node.storage.pools].sort((a, b) => b.freeGb - a.freeGb);
  return sorted[0]?.name;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function calculateMaxPossible(nodes: NodeResources[], required: RequiredResources): number {
  let total = 0;
  for (const node of nodes) {
    if (required.cloneType === 'dedicated_storage') {
      const storageCapacity = required.diskGb > 0 ? Math.floor(node.storage.freeGb / required.diskGb) : 0;
      const effectiveRamGb = node.memory.totalGb * config.VM_RAM_OVERCOMMIT_RATIO;
      const freeRamGb = Math.max(0, effectiveRamGb - node.memory.usedGb);
      const ramCapacity = required.memoryGb > 0 ? Math.floor(freeRamGb / required.memoryGb) : 0;
      const effectiveCpuCapacity = node.cpu.total * config.VM_CPU_OVERCOMMIT_RATIO;
      const usedCpu = node.cpu.used * node.cpu.total;
      const freeCpu = Math.max(0, effectiveCpuCapacity - usedCpu);
      const cpuCapacity = required.cpuCores > 0 ? Math.floor(freeCpu / required.cpuCores) : 0;
      total += Math.min(storageCapacity, ramCapacity, cpuCapacity);
    } else {
      // dynamic_storage: limited by RAM and CPU only
      const effectiveRamGb = node.memory.totalGb * config.VM_RAM_OVERCOMMIT_RATIO;
      const freeRamGb = Math.max(0, effectiveRamGb - node.memory.usedGb);
      const ramCapacity = required.memoryGb > 0 ? Math.floor(freeRamGb / required.memoryGb) : 999;
      const effectiveCpuCapacity = node.cpu.total * config.VM_CPU_OVERCOMMIT_RATIO;
      const usedCpu = node.cpu.used * node.cpu.total;
      const freeCpu = Math.max(0, effectiveCpuCapacity - usedCpu);
      const cpuCapacity = required.cpuCores > 0 ? Math.floor(freeCpu / required.cpuCores) : 999;
      total += Math.min(ramCapacity, cpuCapacity);
    }
  }
  return total;
}

function determineBottleneck(
  nodes: NodeResources[],
  required: RequiredResources
): 'cpu' | 'memory' | 'storage' | 'nodes' {
  if (nodes.length === 0) return 'nodes';

  const totalFreeRam = nodes.reduce((sum, n) => {
    const effective = n.memory.totalGb * config.VM_RAM_OVERCOMMIT_RATIO;
    return sum + Math.max(0, effective - n.memory.usedGb);
  }, 0);

  const totalFreeStorage = nodes.reduce((sum, n) => sum + n.storage.freeGb, 0);

  if (required.cloneType === 'dedicated_storage' && totalFreeStorage < required.diskGb) {
    return 'storage';
  }
  if (totalFreeRam < required.memoryGb) return 'memory';
  return 'cpu';
}
