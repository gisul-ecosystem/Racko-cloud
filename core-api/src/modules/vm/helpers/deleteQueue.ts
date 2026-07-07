import { config } from '../../../config';
import { logger } from '../../../utils/logger';

interface NodeDeleteSlot {
  active: number;
  waiters: Array<() => void>;
}

const slotsByNode = new Map<string, NodeDeleteSlot>();

function getSlot(node: string): NodeDeleteSlot {
  let slot = slotsByNode.get(node);
  if (!slot) {
    slot = { active: 0, waiters: [] };
    slotsByNode.set(node, slot);
  }
  return slot;
}

function acquire(node: string, maxConcurrent: number): Promise<void> {
  const slot = getSlot(node);
  if (slot.active < maxConcurrent) {
    slot.active++;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    slot.waiters.push(() => {
      slot.active++;
      resolve();
    });
  });
}

function release(node: string): void {
  const slot = getSlot(node);
  slot.active = Math.max(0, slot.active - 1);
  const next = slot.waiters.shift();
  if (next) next();
}

/**
 * Limit concurrent Proxmox VM destroy operations per node (configurable via env).
 */
export async function runThrottledNodeDelete<T>(
  node: string,
  operation: () => Promise<T>
): Promise<T> {
  const maxConcurrent = config.VM_DELETE_MAX_CONCURRENT_PER_NODE;

  if (maxConcurrent <= 0) {
    return operation();
  }

  await acquire(node, maxConcurrent);

  logger.debug('[VMDelete] Acquired destroy slot', {
    node,
    maxConcurrent,
    activeAfterAcquire: getSlot(node).active,
  });

  try {
    return await operation();
  } finally {
    release(node);
    logger.debug('[VMDelete] Released destroy slot', {
      node,
      activeAfterRelease: getSlot(node).active,
      queued: getSlot(node).waiters.length,
    });
  }
}
