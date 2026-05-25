import { logger } from '../../../utils/logger';
import { InsufficientResourcesError } from '../../../utils/errors';
import { fetchNodeCapacities, effectiveFreeCpu, effectiveFreeRamGb } from './nodeCapacity';
import type { NodeResources, RequiredResources, StoragePool } from '../vm.types';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Select the best single node for VM placement.
 * excludeNodes: optional list of node names to skip (used for rerouting after failure).
 */
export async function selectNode(
  required: RequiredResources,
  excludeNodes: string[] = []
): Promise<NodeResources> {
  const allNodes = await fetchNodeCapacities();
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
  const allNodes = await fetchNodeCapacities();
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

  eligible.sort((a, b) => b.score - a.score);

  const allocations: Array<{ node: string; vmCount: number }> = [];
  let remaining = count;

  for (const node of eligible) {
    if (remaining <= 0) break;

    let nodeCapacity: number;

    if (required.cloneType === 'dedicated_storage') {
      const storageCapacity = Math.floor(node.storage.freeGb / required.diskGb);
      const ramCapacity = Math.floor(effectiveFreeRamGb(node) / required.memoryGb);
      const cpuCapacity = Math.floor(effectiveFreeCpu(node) / required.cpuCores);
      nodeCapacity = Math.min(storageCapacity, ramCapacity, cpuCapacity);
    } else {
      // dynamic_storage: distribute proportionally by score
      const totalScore = eligible.reduce((sum, n) => sum + n.score, 0);
      const proportion = totalScore > 0 ? node.score / totalScore : 1 / eligible.length;
      nodeCapacity = Math.ceil(count * proportion);
    }

    if (nodeCapacity <= 0) continue;

    const vmCount = Math.min(nodeCapacity, remaining);
    allocations.push({ node: node.node, vmCount });
    remaining -= vmCount;
  }

  if (remaining > 0 && required.cloneType === 'dedicated_storage') {
    const maxPossible = count - remaining;
    if (maxPossible === 0) {
      throw new InsufficientResourcesError(
        `Insufficient resources. You can create maximum ${maxPossible} VMs with these specs.`,
        count,
        maxPossible,
        'storage'
      );
    }
    logger.warn('Partial bulk allocation due to insufficient resources', {
      requested: count,
      allocated: maxPossible,
    });
  }

  return allocations.filter((a) => a.vmCount > 0);
}

/**
 * Get the best storage pool on a node for VM placement.
 */
export function getBestStoragePool(node: NodeResources): string | undefined {
  if (node.storage.pools.length === 0) return undefined;
  const sorted = [...node.storage.pools].sort((a: StoragePool, b: StoragePool) => b.freeGb - a.freeGb);
  return sorted[0]?.name;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function filterEligibleNodes(
  nodes: NodeResources[],
  required: RequiredResources
): NodeResources[] {
  return nodes.filter((node) => {
    if (effectiveFreeCpu(node) < required.cpuCores) return false;
    if (effectiveFreeRamGb(node) < required.memoryGb) return false;
    if (required.cloneType === 'dedicated_storage' && node.storage.freeGb < required.diskGb) return false;
    return true;
  });
}

function calculateMaxPossible(nodes: NodeResources[], required: RequiredResources): number {
  let total = 0;
  for (const node of nodes) {
    if (required.cloneType === 'dedicated_storage') {
      const storageCapacity = required.diskGb > 0 ? Math.floor(node.storage.freeGb / required.diskGb) : 0;
      const ramCapacity = required.memoryGb > 0 ? Math.floor(effectiveFreeRamGb(node) / required.memoryGb) : 0;
      const cpuCapacity = required.cpuCores > 0 ? Math.floor(effectiveFreeCpu(node) / required.cpuCores) : 0;
      total += Math.min(storageCapacity, ramCapacity, cpuCapacity);
    } else {
      const ramCapacity = required.memoryGb > 0 ? Math.floor(effectiveFreeRamGb(node) / required.memoryGb) : 999;
      const cpuCapacity = required.cpuCores > 0 ? Math.floor(effectiveFreeCpu(node) / required.cpuCores) : 999;
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

  const totalFreeRam = nodes.reduce((sum, n) => sum + effectiveFreeRamGb(n), 0);
  const totalFreeStorage = nodes.reduce((sum, n) => sum + n.storage.freeGb, 0);

  if (required.cloneType === 'dedicated_storage' && totalFreeStorage < required.diskGb) {
    return 'storage';
  }
  if (totalFreeRam < required.memoryGb) return 'memory';
  return 'cpu';
}
