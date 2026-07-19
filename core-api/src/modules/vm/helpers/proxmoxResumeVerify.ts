import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import type { ProxmoxVMCurrentStatus } from '../vm.types';

export interface ProxmoxVmProbe {
  status: string;
  qmpstatus?: string;
  uptime?: number;
}

export async function probeProxmoxVmState(
  node: string,
  vmid: number
): Promise<ProxmoxVmProbe | { error: string }> {
  try {
    const statusRes = await proxmoxClient.get<{ data: ProxmoxVMCurrentStatus }>(
      `/nodes/${node}/qemu/${vmid}/status/current`
    );
    const data = statusRes.data.data;
    return {
      status: data.status,
      qmpstatus: data.qmpstatus,
      uptime: data.uptime,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchProxmoxTaskLog(node: string, upid: string): Promise<string> {
  try {
    const encodedUpid = encodeURIComponent(upid);
    const response = await proxmoxClient.get<{ data: Array<{ n: number; t: string }> }>(
      `/nodes/${node}/tasks/${encodedUpid}/log`
    );
    return (response.data.data ?? []).map((line) => line.t).join('\n');
  } catch (err) {
    logger.debug('[VMPowerOn] Failed to fetch Proxmox task log', {
      node,
      upid,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

export function taskLogIndicatesFailedVmStateRestore(log: string): boolean {
  if (!log) return false;
  return (
    /Error while loading VM state/i.test(log) ||
    /kvm:\s*Missing section footer/i.test(log)
  );
}

export function isQmpFullyRunning(qmpstatus?: string): boolean {
  if (!qmpstatus) return false;
  return qmpstatus.toLowerCase() === 'running';
}

export function isQmpPrelaunch(qmpstatus?: string): boolean {
  if (!qmpstatus) return false;
  return qmpstatus.toLowerCase() === 'prelaunch';
}

export async function probeGuestAgentAlive(node: string, vmid: number): Promise<boolean> {
  try {
    await proxmoxClient.get(`/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`);
    return true;
  } catch {
    return false;
  }
}

export interface ResumeVerifyResult {
  needsRetry: boolean;
  reason: string | null;
  taskLogSnippet: string | null;
  qmpstatus: string | null;
}

export async function assessResumeOutcome(
  node: string,
  vmid: number,
  upid: string
): Promise<ResumeVerifyResult> {
  const taskLog = await fetchProxmoxTaskLog(node, upid);
  const taskLogSnippet = taskLog ? taskLog.slice(-500) : null;

  if (taskLogIndicatesFailedVmStateRestore(taskLog)) {
    return {
      needsRetry: true,
      reason: 'task_log_vm_state_load_failed',
      taskLogSnippet,
      qmpstatus: null,
    };
  }

  const probe = await probeProxmoxVmState(node, vmid);
  if ('error' in probe) {
    return { needsRetry: false, reason: null, taskLogSnippet, qmpstatus: null };
  }

  if (probe.status === 'running' && isQmpPrelaunch(probe.qmpstatus)) {
    return {
      needsRetry: true,
      reason: 'qmp_prelaunch',
      taskLogSnippet,
      qmpstatus: probe.qmpstatus ?? null,
    };
  }

  return {
    needsRetry: false,
    reason: null,
    taskLogSnippet,
    qmpstatus: probe.qmpstatus ?? null,
  };
}

export async function waitForVmGuestReady(
  node: string,
  vmid: number,
  options: { maxWaitMs?: number; pollIntervalMs?: number } = {}
): Promise<boolean> {
  const maxWaitMs = options.maxWaitMs ?? 90_000;
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const probe = await probeProxmoxVmState(node, vmid);
    if ('error' in probe) {
      await sleep(pollIntervalMs);
      continue;
    }

    if (probe.status !== 'running' || isQmpPrelaunch(probe.qmpstatus)) {
      await sleep(pollIntervalMs);
      continue;
    }

    if (isQmpFullyRunning(probe.qmpstatus) || !probe.qmpstatus) {
      if (await probeGuestAgentAlive(node, vmid)) return true;
    }

    await sleep(pollIntervalMs);
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DbPowerStatus = 'running' | 'stopped' | 'paused' | 'suspended';

export interface VmStatusDbSyncPlan {
  /** When true, do not change DB status or isHibernated (proxmoxStatus may still update). */
  skipStatusSync: boolean;
  status?: DbPowerStatus;
  isHibernated?: boolean;
  reason?: string;
}

function mapProxmoxPowerStatus(proxmoxStatus: string): DbPowerStatus | 'error' {
  switch (proxmoxStatus) {
    case 'running':
      return 'running';
    case 'stopped':
      return 'stopped';
    case 'paused':
      return 'paused';
    case 'suspended':
      return 'suspended';
    default:
      return 'error';
  }
}

/**
 * Decide whether getVMStatus may sync DB power fields from a live Proxmox probe.
 * Avoids clobbering in-flight hibernate/resume transitions.
 */
export function planVmStatusDbSync(
  live: { status: string; qmpstatus?: string },
  db: { status: string; isHibernated: boolean }
): VmStatusDbSyncPlan {
  if (isQmpPrelaunch(live.qmpstatus)) {
    return { skipStatusSync: true, reason: 'qmp_prelaunch' };
  }

  const mapped = mapProxmoxPowerStatus(live.status);
  if (mapped === 'error') {
    return { skipStatusSync: true, reason: 'unknown_proxmox_status' };
  }

  const qmp = live.qmpstatus?.toLowerCase();

  // Transient: Proxmox briefly stopped while portal still shows running (resume/hibernate).
  if (db.status === 'running' && (mapped === 'stopped' || mapped === 'paused')) {
    return { skipStatusSync: true, reason: 'no_running_to_stopped_downgrade' };
  }

  // Require full QEMU run state before promoting to running / clearing hibernate.
  if (mapped === 'running' && qmp && qmp !== 'running') {
    return { skipStatusSync: true, reason: 'qmp_not_running' };
  }

  const plan: VmStatusDbSyncPlan = { skipStatusSync: false };

  if (mapped !== db.status) {
    plan.status = mapped;
  }

  if (mapped === 'running' && db.isHibernated) {
    plan.isHibernated = false;
  }

  return plan;
}
