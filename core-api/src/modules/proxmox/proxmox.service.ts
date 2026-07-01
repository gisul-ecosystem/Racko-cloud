import { proxmoxClient } from '../../utils/proxmoxClient';
import { logger } from '../../utils/logger';
import { ProxmoxConnectionError, ProxmoxNodeNotFoundError } from '../../utils/errors';
import type {
  ProxmoxNodeRaw,
  ProxmoxStorageRaw,
  ProxmoxVMRaw,
  ProxmoxNodeVersionRaw,
  NodeSummary,
  StorageSummary,
  VMSummary,
  ClusterOverview,
  FullClusterData,
} from './proxmox.types';

// ─── Private helpers ──────────────────────────────────────────────────────────

function bytesToGB(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

function fractionToPercent(fraction: number): number {
  // Multiply by 10000 then divide to avoid floating-point drift
  return Math.round(fraction * 10000) / 100;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return 'just started';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);

  return parts.length > 0 ? parts.join(', ') : 'just started';
}

function transformNode(raw: ProxmoxNodeRaw, version?: string): NodeSummary {
  const memUsedGB = bytesToGB(raw.mem ?? 0);
  const memTotalGB = bytesToGB(raw.maxmem ?? 0);
  const diskUsedGB = bytesToGB(raw.disk ?? 0);
  const diskTotalGB = bytesToGB(raw.maxdisk ?? 0);
  const cpu = raw.cpu ?? 0;
  const maxmem = raw.maxmem ?? 0;
  const mem = raw.mem ?? 0;
  const maxdisk = raw.maxdisk ?? 0;
  const disk = raw.disk ?? 0;

  return {
    name: raw.node,
    status: raw.status,
    cpu: {
      used: fractionToPercent(cpu),
      total: raw.maxcpu,
      usagePercent: fractionToPercent(cpu),
    },
    memory: {
      used: memUsedGB,
      total: memTotalGB,
      free: Math.round((memTotalGB - memUsedGB) * 100) / 100,
      usagePercent: maxmem > 0 ? Math.round((mem / maxmem) * 10000) / 100 : 0,
    },
    disk: {
      used: diskUsedGB,
      total: diskTotalGB,
      free: Math.round((diskTotalGB - diskUsedGB) * 100) / 100,
      usagePercent: maxdisk > 0 ? Math.round((disk / maxdisk) * 10000) / 100 : 0,
    },
    uptime: {
      seconds: raw.uptime ?? 0,
      formatted: formatUptime(raw.uptime ?? 0),
    },
    ...(version !== undefined && { proxmoxVersion: version }),
  };
}

function transformStorage(raw: ProxmoxStorageRaw): StorageSummary {
  const totalGB = bytesToGB(raw.total);
  const usedGB = bytesToGB(raw.used);
  const freeGB = bytesToGB(raw.avail);

  let status: StorageSummary['status'] = 'unknown';
  if (raw.active === 1 && raw.enabled === 1) status = 'active';
  else if (raw.enabled === 0 || raw.active === 0) status = 'inactive';

  return {
    name: raw.storage,
    type: raw.type,
    node: raw.node ?? 'unknown',
    status,
    isShared: raw.shared === 1,
    content: raw.content ? raw.content.split(',').map((c) => c.trim()) : [],
    capacity: {
      total: totalGB,
      used: usedGB,
      free: freeGB,
      usagePercent: raw.total > 0 ? Math.round((raw.used / raw.total) * 10000) / 100 : 0,
    },
  };
}

function transformVM(raw: ProxmoxVMRaw): VMSummary {
  const memAllocGB = bytesToGB(raw.maxmem);
  const memUsedGB = bytesToGB(raw.mem);
  const diskAllocGB = bytesToGB(raw.maxdisk);
  const diskUsedGB = bytesToGB(raw.disk);
  const netInMB = Math.round((raw.netin / 1024 / 1024) * 100) / 100;
  const netOutMB = Math.round((raw.netout / 1024 / 1024) * 100) / 100;

  return {
    vmid: raw.vmid,
    name: raw.name,
    status: raw.status,
    node: raw.node,
    type: raw.type,
    isTemplate: raw.template === 1,
    cpu: {
      allocated: raw.cpus,
      usagePercent: fractionToPercent(raw.cpu),
    },
    memory: {
      allocated: memAllocGB,
      used: memUsedGB,
      usagePercent: raw.maxmem > 0 ? Math.round((raw.mem / raw.maxmem) * 10000) / 100 : 0,
    },
    disk: {
      allocated: diskAllocGB,
      used: diskUsedGB,
    },
    network: {
      in: netInMB,
      out: netOutMB,
    },
    uptime: {
      seconds: raw.uptime,
      formatted: formatUptime(raw.uptime),
    },
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ProxmoxService {
  /**
   * Fetch all nodes in the cluster.
   * Right now returns 1 node; when more nodes are added, same code returns N.
   * NEVER hardcode node names — always discover dynamically.
   */
  async getNodes(): Promise<ProxmoxNodeRaw[]> {
    try {
      const response = await proxmoxClient.get<{ data: ProxmoxNodeRaw[] }>('/nodes');
      return response.data.data;
    } catch (error) {
      if (error instanceof ProxmoxConnectionError || error instanceof ProxmoxNodeNotFoundError) {
        throw error;
      }
      throw new ProxmoxConnectionError(`Failed to fetch nodes: ${String(error)}`);
    }
  }

  /**
   * Get detailed status of a specific node.
   */
  async getNodeStatus(nodeName: string): Promise<ProxmoxNodeRaw> {
    const nodes = await this.getNodes();
    const node = nodes.find((n) => n.node === nodeName);

    if (!node) {
      throw new ProxmoxNodeNotFoundError(nodeName);
    }

    try {
      // Fetch detailed status — richer than the cluster list entry
      const response = await proxmoxClient.get<{ data: Omit<ProxmoxNodeRaw, 'node'> }>(
        `/nodes/${nodeName}/status`
      );
      return { ...response.data.data, node: nodeName };
    } catch (error) {
      if (error instanceof ProxmoxNodeNotFoundError) throw error;
      // Fall back to cluster list data if detailed endpoint fails
      logger.warn('Falling back to cluster list data for node status', { nodeName });
      return node;
    }
  }

  /**
   * Get Proxmox version running on a specific node.
   */
  async getNodeVersion(nodeName: string): Promise<ProxmoxNodeVersionRaw> {
    const response = await proxmoxClient.get<{ data: ProxmoxNodeVersionRaw }>(
      `/nodes/${nodeName}/version`
    );
    return response.data.data;
  }

  /**
   * Fetch all storage pools across ALL nodes dynamically.
   * Deduplicates shared storage (appears on multiple nodes).
   * Uses Promise.allSettled — one node failing never crashes the response.
   */
  async getAllStorage(): Promise<ProxmoxStorageRaw[]> {
    // Always discover nodes dynamically — never hardcode
    const nodes = await this.getNodes();

    const results = await Promise.allSettled(
      nodes.map(async (node) => {
        const response = await proxmoxClient.get<{ data: ProxmoxStorageRaw[] }>(
          `/nodes/${node.node}/storage`
        );
        // Tag each storage entry with its node
        return response.data.data.map((s) => ({ ...s, node: node.node }));
      })
    );

    const allStorage: ProxmoxStorageRaw[] = [];
    const seenShared = new Set<string>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        for (const storage of result.value) {
          if (storage.shared === 1) {
            // Deduplicate shared storage — only include once
            if (seenShared.has(storage.storage)) continue;
            seenShared.add(storage.storage);
          }
          allStorage.push(storage);
        }
      } else {
        logger.warn('Failed to fetch storage for node', {
          node: nodes[i]?.node ?? 'unknown',
          reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    return allStorage;
  }

  /**
   * Fetch all VMs and LXC containers across ALL nodes dynamically.
   * Combines QEMU VMs + LXC containers. Filters out templates.
   * Uses Promise.allSettled — partial failure is acceptable.
   *
   * EVENT_SLOT: emit 'cluster.vms.fetched' event to message queue
   */
  async getAllVMs(): Promise<ProxmoxVMRaw[]> {
    // Always discover nodes dynamically — never hardcode
    const nodes = await this.getNodes();

    const results = await Promise.allSettled(
      nodes.flatMap((node) => [
        proxmoxClient
          .get<{ data: Omit<ProxmoxVMRaw, 'node' | 'type'>[] }>(`/nodes/${node.node}/qemu`)
          .then((r) =>
            r.data.data.map((vm) => ({ ...vm, node: node.node, type: 'qemu' as const }))
          ),
        proxmoxClient
          .get<{ data: Omit<ProxmoxVMRaw, 'node' | 'type'>[] }>(`/nodes/${node.node}/lxc`)
          .then((r) =>
            r.data.data.map((ct) => ({ ...ct, node: node.node, type: 'lxc' as const }))
          ),
      ])
    );

    const allVMs: ProxmoxVMRaw[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        // Filter out templates — keep only real VMs/containers
        const vms = result.value.filter((vm) => vm.template !== 1);
        allVMs.push(...vms);
      } else {
        const nodeIndex = Math.floor(i / 2);
        const vmType = i % 2 === 0 ? 'qemu' : 'lxc';
        logger.warn('Failed to fetch VMs for node', {
          node: nodes[nodeIndex]?.node ?? 'unknown',
          type: vmType,
          reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    return allVMs;
  }

  /**
   * Aggregate cluster-wide overview stats.
   * Runs all three fetches in parallel.
   */
  async getClusterOverview(): Promise<ClusterOverview> {
    const [nodes, storage, vms] = await Promise.all([
      this.getNodes(),
      this.getAllStorage(),
      this.getAllVMs(),
    ]);

    const onlineNodes = nodes.filter((n) => n.status === 'online').length;
    const runningVMs = vms.filter((v) => v.status === 'running').length;

    const totalCPUCores = nodes.reduce((sum, n) => sum + n.maxcpu, 0);
    const totalMemoryGB = bytesToGB(nodes.reduce((sum, n) => sum + (n.maxmem ?? 0), 0));
    const usedMemoryGB = bytesToGB(nodes.reduce((sum, n) => sum + (n.mem ?? 0), 0));
    const totalStorageGB = bytesToGB(storage.reduce((sum, s) => sum + s.total, 0));
    const usedStorageGB = bytesToGB(storage.reduce((sum, s) => sum + s.used, 0));

    return {
      totalNodes: nodes.length,
      onlineNodes,
      offlineNodes: nodes.length - onlineNodes,
      totalVMs: vms.length,
      runningVMs,
      stoppedVMs: vms.filter((v) => v.status === 'stopped').length,
      totalCPUCores,
      totalMemoryGB,
      usedMemoryGB,
      totalStorageGB,
      usedStorageGB,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Master method — fetches everything for the super_admin dashboard.
   * All data fetched in parallel, transformed to frontend-friendly format.
   *
   * CACHE_SLOT: check Redis cache here (key: 'cluster:full', TTL: 30s)
   */
  async getFullClusterData(): Promise<FullClusterData> {
    // Fetch all raw data in parallel
    const [rawNodes, rawStorage, rawVMs] = await Promise.all([
      this.getNodes(),
      this.getAllStorage(),
      this.getAllVMs(),
    ]);

    // Fetch versions for all online nodes in parallel (best-effort)
    const versionResults = await Promise.allSettled(
      rawNodes
        .filter((n) => n.status === 'online')
        .map(async (n) => {
          const ver = await this.getNodeVersion(n.node);
          return { node: n.node, version: `${ver.version}-${ver.release}` };
        })
    );

    const versionMap = new Map<string, string>();
    for (const result of versionResults) {
      if (result.status === 'fulfilled') {
        versionMap.set(result.value.node, result.value.version);
      }
    }

    // Transform raw data to frontend-friendly format
    const nodes = rawNodes.map((n) => transformNode(n, versionMap.get(n.node)));
    const storage = rawStorage.map(transformStorage);
    const vms = rawVMs.map(transformVM);

    // Build cluster overview from already-fetched raw data
    const onlineNodes = rawNodes.filter((n) => n.status === 'online').length;
    const runningVMs = rawVMs.filter((v) => v.status === 'running').length;

    const cluster: ClusterOverview = {
      totalNodes: rawNodes.length,
      onlineNodes,
      offlineNodes: rawNodes.length - onlineNodes,
      totalVMs: rawVMs.length,
      runningVMs,
      stoppedVMs: rawVMs.filter((v) => v.status === 'stopped').length,
      totalCPUCores: rawNodes.reduce((sum, n) => sum + n.maxcpu, 0),
      totalMemoryGB: bytesToGB(rawNodes.reduce((sum, n) => sum + (n.maxmem ?? 0), 0)),
      usedMemoryGB: bytesToGB(rawNodes.reduce((sum, n) => sum + (n.mem ?? 0), 0)),
      totalStorageGB: bytesToGB(rawStorage.reduce((sum, s) => sum + s.total, 0)),
      usedStorageGB: bytesToGB(rawStorage.reduce((sum, s) => sum + s.used, 0)),
      fetchedAt: new Date().toISOString(),
    };

    // CACHE_SLOT: write to Redis cache after successful fetch

    return {
      cluster,
      nodes,
      storage,
      vms,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export const proxmoxService = new ProxmoxService();

// ─── Node Monitoring ──────────────────────────────────────────────────────────
// Import here to avoid circular deps — NodeAlert is a standalone model
import { NodeAlert } from '../../models/nodeAlert.model';
import { config } from '../../config';
import { ProxmoxNodeService } from '../proxmoxNode/proxmoxNode.service';

/**
 * Start periodic node resource monitoring.
 * Called once on app startup.
 * Checks CPU, RAM, storage against configured thresholds.
 * Creates/updates/resolves NodeAlert records.
 *
 * CACHE_SLOT: cache alert state in Redis to prevent duplicate alerts across restarts
 * WEBSOCKET_SLOT: push real-time alerts to super_admin dashboard via WebSocket
 * AUTO_EXPAND_SLOT: when storage hits critical on Ceph — trigger volume expansion
 */
export function startNodeMonitoring(): void {
  logger.info('Node monitoring started', {
    intervalMs: config.NODE_MONITOR_INTERVAL_MS,
  });

  setInterval(() => {
    // Fire-and-forget — never crash on monitoring error
    void runMonitoringCycle().catch((err: unknown) => {
      logger.error('Node monitoring cycle failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, config.NODE_MONITOR_INTERVAL_MS);
}

async function runMonitoringCycle(): Promise<void> {
  let nodes: ProxmoxNodeRaw[];
  try {
    nodes = await proxmoxService.getNodes();
  } catch (err) {
    logger.error('Monitoring: failed to fetch nodes', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Only monitor nodes that are registered as active in the platform.
  // Falls back to all online nodes if none are registered yet.
  const activeNodeNames = await ProxmoxNodeService.getActiveNodeNames();
  const onlineNodes = nodes.filter((n) => {
    if (n.status !== 'online') return false;
    if (activeNodeNames.length > 0) return activeNodeNames.includes(n.node);
    return true;
  });
  let alertsCreated = 0;
  let alertsResolved = 0;

  for (const node of onlineNodes) {
    try {
      await checkNodeAlerts(node);
    } catch (err) {
      logger.warn('Monitoring: failed to check node', {
        node: node.node,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Node monitoring cycle complete', {
    nodesChecked: onlineNodes.length,
    alertsCreated,
    alertsResolved,
  });
}

async function checkNodeAlerts(node: ProxmoxNodeRaw): Promise<void> {
  const cpuPercent = Math.round((node.cpu ?? 0) * 10000) / 100;
  const maxmem = node.maxmem ?? 0;
  const mem = node.mem ?? 0;
  const ramPercent = maxmem > 0 ? Math.round((mem / maxmem) * 10000) / 100 : 0;

  // Check CPU
  await evaluateAlert(node.node, 'cpu', cpuPercent, {
    warning: config.ALERT_CPU_WARNING,
    critical: config.ALERT_CPU_CRITICAL,
    full: config.ALERT_CPU_FULL,
  });

  // Check RAM
  await evaluateAlert(node.node, 'ram', ramPercent, {
    warning: config.ALERT_RAM_WARNING,
    critical: config.ALERT_RAM_CRITICAL,
    full: config.ALERT_RAM_FULL,
  });

  // Check storage pools
  try {
    const storageResponse = await proxmoxClient.get<{
      data: Array<{
        storage: string;
        total: number;
        used: number;
        avail: number;
        active: number;
        enabled: number;
        content: string;
      }>;
    }>(`/nodes/${node.node}/storage`);

    const activePools = storageResponse.data.data.filter(
      (s) => s.active === 1 && s.enabled === 1 && s.content?.includes('images')
    );

    for (const pool of activePools) {
      const storagePercent =
        pool.total > 0 ? Math.round((pool.used / pool.total) * 10000) / 100 : 0;

      await evaluateAlert(
        node.node,
        'storage',
        storagePercent,
        {
          warning: config.ALERT_STORAGE_WARNING,
          critical: config.ALERT_STORAGE_CRITICAL,
          full: config.ALERT_STORAGE_FULL,
        },
        pool.storage
      );
    }
  } catch (err) {
    logger.warn('Monitoring: failed to fetch storage for node', {
      node: node.node,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function evaluateAlert(
  node: string,
  resource: 'cpu' | 'ram' | 'storage',
  currentPercent: number,
  thresholds: { warning: number; critical: number; full: number },
  storagePool?: string
): Promise<void> {
  // Determine severity
  let severity: 'warning' | 'critical' | 'full' | null = null;
  let thresholdPercent = 0;

  if (currentPercent >= thresholds.full) {
    severity = 'full';
    thresholdPercent = thresholds.full;
  } else if (currentPercent >= thresholds.critical) {
    severity = 'critical';
    thresholdPercent = thresholds.critical;
  } else if (currentPercent >= thresholds.warning) {
    severity = 'warning';
    thresholdPercent = thresholds.warning;
  }

  const alertQuery: Record<string, unknown> = { node, resource, status: 'active' };
  if (storagePool) alertQuery['storagePool'] = storagePool;

  const existingAlert = await NodeAlert.findOne(alertQuery);

  if (severity !== null) {
    if (existingAlert) {
      // Update existing active alert
      existingAlert.currentPercent = currentPercent;
      existingAlert.severity = severity;
      existingAlert.thresholdPercent = thresholdPercent;
      await existingAlert.save();
    } else {
      // Create new alert
      await NodeAlert.create({
        node,
        resource,
        severity,
        currentPercent,
        thresholdPercent,
        status: 'active',
        ...(storagePool && { storagePool }),
      });
      logger.warn('Node alert created', { node, resource, severity, currentPercent, storagePool });
    }
  } else if (existingAlert) {
    // Usage dropped below threshold — resolve
    existingAlert.status = 'resolved';
    existingAlert.resolvedAt = new Date();
    await existingAlert.save();
    logger.info('Node alert resolved', { node, resource, currentPercent });
  }
}

/**
 * Get all active node alerts, sorted by severity then createdAt.
 */
export async function getActiveAlerts() {
  const severityOrder = { full: 0, critical: 1, warning: 2 };
  const alerts = await NodeAlert.find({ status: 'active' }).lean();
  return alerts.sort((a, b) => {
    const diff = severityOrder[a.severity] - severityOrder[b.severity];
    if (diff !== 0) return diff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Get alert history (active + resolved), most recent first.
 */
export async function getAlertHistory(limit: number) {
  return NodeAlert.find().sort({ createdAt: -1 }).limit(limit).lean();
}
