import { config } from '../../../config';
import { ValidationError } from '../../../utils/errors';
import { fetchNodeCapacities, effectiveFreeCpu, effectiveFreeRamGb } from './nodeCapacity';
import type { CreateVMDto, ResourceValidationResult, TemplateSpecs } from '../vm.types';

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

  if (count > config.VM_MAX_BULK_COUNT) {
    throw new ValidationError(
      `Cannot create more than ${config.VM_MAX_BULK_COUNT} VMs at once.`
    );
  }

  const cpuCores = dto.cpuCores ?? templateSpecs.cpuCores;
  const memoryGb = dto.memoryGb ?? templateSpecs.memoryGb;
  const diskGb = dto.diskGb ?? templateSpecs.diskGb;

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

  const onlineNodes = await fetchNodeCapacities();

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
    const perNode = Math.ceil(count / onlineNodes.length);
    const nodeAllocations = onlineNodes
      .map((node, idx) => ({
        node: node.node,
        vmCount:
          idx === onlineNodes.length - 1
            ? count - perNode * (onlineNodes.length - 1)
            : perNode,
      }))
      .filter((a) => a.vmCount > 0);

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

  let totalFreeStorageGb = 0;
  let totalFreeRamGb = 0;
  let totalFreeCpu = 0;

  const nodeCapacities: Array<{ node: string; maxVms: number }> = [];

  for (const node of onlineNodes) {
    const nodeFreeStorageGb = node.storage.freeGb;
    const nodeFreeRamGb = effectiveFreeRamGb(node);
    const nodeFreeCpu = effectiveFreeCpu(node);

    totalFreeStorageGb += nodeFreeStorageGb;
    totalFreeRamGb += nodeFreeRamGb;
    totalFreeCpu += nodeFreeCpu;

    const storageCapacity = diskGb > 0 ? Math.floor(nodeFreeStorageGb / diskGb) : 0;
    const ramCapacity = memoryGb > 0 ? Math.floor(nodeFreeRamGb / memoryGb) : 0;
    const cpuCapacity = cpuCores > 0 ? Math.floor(nodeFreeCpu / cpuCores) : 0;

    nodeCapacities.push({ node: node.node, maxVms: Math.min(storageCapacity, ramCapacity, cpuCapacity) });
  }

  const maxPossibleCount = nodeCapacities.reduce((sum, n) => sum + n.maxVms, 0);

  if (
    totalFreeStorageGb < totalRequiredStorageGb ||
    totalFreeRamGb < totalRequiredRamGb ||
    totalFreeCpu < totalRequiredCpu
  ) {
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

    return {
      canCreate: false,
      requestedCount: count,
      maxPossibleCount,
      reason: `Insufficient resources: ${reasons.join('; ')}`,
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
