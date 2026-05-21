import { proxmoxClient } from '../../../utils/proxmoxClient';
import { config } from '../../../config';
import { ValidationError } from '../../../utils/errors';
import type { CreateVMDto, ResourceValidationResult, TemplateSpecs, ProxmoxNodeRaw } from '../vm.types';

function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

/**
 * Validate that requested resources are sufficient and within platform limits.
 *
 * For dedicated_storage (full clone):
 *   - Checks combined storage, RAM, CPU across all nodes
 *   - Returns maxPossibleCount if insufficient
 *
 * For dynamic_storage (linked clone):
 *   - No storage reservation check — overcommit allowed
 *   - Only requires at least 1 online node
 *
 * Always validates:
 *   - cpu/memory/disk overrides are >= template values
 *   - count is within VM_MAX_BULK_COUNT
 */
export async function validateResources(
  dto: CreateVMDto,
  templateSpecs: TemplateSpecs
): Promise<ResourceValidationResult> {
  const count = dto.count;

  // Validate count against platform max
  if (count > config.VM_MAX_BULK_COUNT) {
    throw new ValidationError(
      `Cannot create more than ${config.VM_MAX_BULK_COUNT} VMs at once.`
    );
  }

  // Resolve final specs (override or template defaults)
  const cpuCores = dto.cpuCores ?? templateSpecs.cpuCores;
  const memoryGb = dto.memoryGb ?? templateSpecs.memoryGb;
  const diskGb = dto.diskGb ?? templateSpecs.diskGb;

  // Validate overrides are not below template values
  if (dto.cpuCores !== undefined && dto.cpuCores < templateSpecs.cpuCores) {
    throw new ValidationError(
      `cpuCores (${dto.cpuCores}) cannot be less than template value (${templateSpecs.cpuCores}).`
    );
  }
  if (dto.memoryGb !== undefined && dto.memoryGb < templateSpecs.memoryGb) {
    throw new ValidationError(
      `memoryGb (${dto.memoryGb}) cannot be less than template value (${templateSpecs.memoryGb}).`
    );
  }
  if (dto.diskGb !== undefined && dto.diskGb < templateSpecs.diskGb) {
    throw new ValidationError(
      `diskGb (${dto.diskGb}) cannot be less than template value (${templateSpecs.diskGb}).`
    );
  }

  // Fetch all nodes dynamically — never hardcode
  const nodesResponse = await proxmoxClient.get<{ data: ProxmoxNodeRaw[] }>('/nodes');
  const onlineNodes = nodesResponse.data.data.filter((n) => n.status === 'online');

  if (onlineNodes.length === 0) {
    return {
      canCreate: false,
      requestedCount: count,
      maxPossibleCount: 0,
      reason: 'No online nodes available in the cluster.',
      nodeAllocations: [],
    };
  }

  if (dto.cloneType === 'dynamic_storage') {
    // Linked clone: no storage reservation — only need at least 1 online node
    // Distribute evenly across online nodes for the response
    const perNode = Math.ceil(count / onlineNodes.length);
    const nodeAllocations = onlineNodes.map((node, idx) => ({
      node: node.node,
      vmCount: idx === onlineNodes.length - 1
        ? count - perNode * (onlineNodes.length - 1)
        : perNode,
    })).filter((a) => a.vmCount > 0);

    return {
      canCreate: true,
      requestedCount: count,
      maxPossibleCount: count,
      nodeAllocations,
    };
  }

  // dedicated_storage: check actual resource availability across all nodes
  const totalRequiredStorageGb = diskGb * count;
  const totalRequiredRamGb = memoryGb * count;
  const totalRequiredCpu = cpuCores * count;

  // Aggregate available resources across all online nodes
  let totalFreeStorageGb = 0;
  let totalFreeRamGb = 0;
  let totalFreeCpu = 0;

  const nodeCapacities: Array<{ node: string; maxVms: number }> = [];

  for (const node of onlineNodes) {
    // Fetch storage for this node
    try {
      const storageResponse = await proxmoxClient.get<{
        data: Array<{ storage: string; avail: number; total: number; active: number; enabled: number; content: string }>;
      }>(`/nodes/${node.node}/storage`);

      const activeStorage = storageResponse.data.data.filter(
        (s) => s.active === 1 && s.enabled === 1 && s.content?.includes('images')
      );
      const nodeFreeStorageGb = activeStorage.reduce((sum, s) => sum + bytesToGb(s.avail), 0);
      totalFreeStorageGb += nodeFreeStorageGb;

      const effectiveRamGb = bytesToGb(node.maxmem) * config.VM_RAM_OVERCOMMIT_RATIO;
      const usedRamGb = bytesToGb(node.mem);
      const nodeFreeRamGb = Math.max(0, effectiveRamGb - usedRamGb);
      totalFreeRamGb += nodeFreeRamGb;

      const effectiveCpu = node.maxcpu * config.VM_CPU_OVERCOMMIT_RATIO;
      const usedCpu = node.cpu * node.maxcpu;
      const nodeFreeCpu = Math.max(0, effectiveCpu - usedCpu);
      totalFreeCpu += nodeFreeCpu;

      // Per-node capacity
      const storageCapacity = diskGb > 0 ? Math.floor(nodeFreeStorageGb / diskGb) : 0;
      const ramCapacity = memoryGb > 0 ? Math.floor(nodeFreeRamGb / memoryGb) : 0;
      const cpuCapacity = cpuCores > 0 ? Math.floor(nodeFreeCpu / cpuCores) : 0;
      const nodeMax = Math.min(storageCapacity, ramCapacity, cpuCapacity);

      nodeCapacities.push({ node: node.node, maxVms: nodeMax });
    } catch {
      // Node storage fetch failed — skip this node for capacity calculation
      nodeCapacities.push({ node: node.node, maxVms: 0 });
    }
  }

  const maxPossibleCount = nodeCapacities.reduce((sum, n) => sum + n.maxVms, 0);

  if (
    totalFreeStorageGb < totalRequiredStorageGb ||
    totalFreeRamGb < totalRequiredRamGb ||
    totalFreeCpu < totalRequiredCpu
  ) {
    let reason = 'Insufficient resources: ';
    const reasons: string[] = [];
    if (totalFreeStorageGb < totalRequiredStorageGb) {
      reasons.push(`storage (need ${totalRequiredStorageGb.toFixed(1)}GB, have ${totalFreeStorageGb.toFixed(1)}GB)`);
    }
    if (totalFreeRamGb < totalRequiredRamGb) {
      reasons.push(`RAM (need ${totalRequiredRamGb.toFixed(1)}GB, have ${totalFreeRamGb.toFixed(1)}GB)`);
    }
    if (totalFreeCpu < totalRequiredCpu) {
      reasons.push(`CPU (need ${totalRequiredCpu} cores, have ${totalFreeCpu.toFixed(1)} effective cores)`);
    }
    reason += reasons.join('; ');

    return {
      canCreate: false,
      requestedCount: count,
      maxPossibleCount,
      reason,
      nodeAllocations: [],
    };
  }

  // Build node allocations — fill nodes in order of capacity
  const nodeAllocations: Array<{ node: string; vmCount: number }> = [];
  let remaining = count;

  for (const nc of nodeCapacities.sort((a, b) => b.maxVms - a.maxVms)) {
    if (remaining <= 0) break;
    const vmCount = Math.min(nc.maxVms, remaining);
    if (vmCount > 0) {
      nodeAllocations.push({ node: nc.node, vmCount });
      remaining -= vmCount;
    }
  }

  return {
    canCreate: true,
    requestedCount: count,
    maxPossibleCount,
    nodeAllocations,
  };
}
