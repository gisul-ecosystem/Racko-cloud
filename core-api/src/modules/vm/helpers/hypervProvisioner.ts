import mongoose from 'mongoose';
import { config } from '../../../config';
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { pollTask } from './taskPoller';
import { VM } from '../vm.model';
import { VMEvent } from '../vmEvent.model';
import type { HyperVStatus } from '../vm.types';
import {
  HYPERV_STATE_SCRIPT,
  decodeAgentOutput,
  parseHyperVState,
  isProcessExited,
} from './hypervGuestOutput';
import { classifyHyperVError } from './hypervErrors';
import { updateHyperVStatus } from './hypervStatus';

/**
 * Hyper-V (nested virtualization) provisioning for Windows guests.
 *
 * Linear flow: start VM → wait for guest agent → enable feature → reboot → verify
 */

interface AgentExecStatus {
  exited?: number | boolean;
  exitcode?: number;
  'out-data'?: string;
  'err-data'?: string;
}

/**
 * Hyper-V is a Windows-only feature. Match real Proxmox Windows ostypes
 * (win7, win8, win10, win11, w2k variants, wvista, wxp).
 */
export function isWindowsOsType(osType?: string): boolean {
  if (!osType) return false;
  const t = osType.toLowerCase();
  return t.startsWith('win') || t.startsWith('w2k') || t === 'wvista' || t === 'wxp';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the QEMU guest agent answers a ping (or time out). */
async function waitForGuestAgent(node: string, vmid: number, vmObjectId?: mongoose.Types.ObjectId): Promise<void> {
  const deadline = Date.now() + config.HYPERV_AGENT_READY_TIMEOUT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;

    // Liveness + cancellation check — abort if VM deleted or cancelled
    if (vmObjectId) {
      const live = await VM.findById(vmObjectId).select('status hyperVCancelled').lean();
      if (!live || live.status === 'deleted' || live.status === 'deleting') {
        throw new Error('VM has been deleted — aborting HyperV provisioning.');
      }
      if (live.hyperVCancelled) {
        throw new Error('HyperV operation was cancelled by admin.');
      }
    }

    try {
      await proxmoxClient.post(`/nodes/${node}/qemu/${vmid}/agent/ping`, {});
      logger.info('[HyperV] guest agent ping OK', { vmid, node, attempt });
      return;
    } catch (err) {
      const { message, retryable } = classifyHyperVError(err);
      if (!retryable) throw new Error(message);
      logger.warn('[HyperV] guest agent ping failed — retrying', {
        vmid,
        node,
        attempt,
        error: message,
      });
      await sleep(config.HYPERV_AGENT_POLL_MS);
    }
  }
  throw new Error(
    'Guest agent did not respond. Ensure the QEMU guest agent is installed and running in the VM.'
  );
}

async function getPowerState(node: string, vmid: number): Promise<'running' | 'stopped'> {
  const current = await proxmoxClient.get<{ data: { status: string } }>(
    `/nodes/${node}/qemu/${vmid}/status/current`
  );
  return current.data.data.status === 'running' ? 'running' : 'stopped';
}

/** Ensure the VM is running; returns the power state it was in beforehand. */
async function ensureVmRunning(node: string, vmid: number): Promise<'running' | 'stopped'> {
  const prior = await getPowerState(node, vmid);
  logger.info('[HyperV] current power state', { vmid, node, status: prior });
  if (prior === 'running') return prior;

  logger.info('[HyperV] starting VM', { vmid, node });
  const start = await proxmoxClient.post<{ data: string }>(
    `/nodes/${node}/qemu/${vmid}/status/start`,
    {}
  );
  const result = await pollTask(start.data.data, node);
  logger.info('[HyperV] start task result', { vmid, node, result });
  if (result.result !== 'success') {
    throw new Error('Failed to power on the VM.');
  }
  return prior;
}

async function stopVm(node: string, vmid: number): Promise<void> {
  logger.info('[HyperV] stopping VM to restore prior power state', { vmid, node });
  const stop = await proxmoxClient.post<{ data: string }>(
    `/nodes/${node}/qemu/${vmid}/status/shutdown`,
    {}
  );
  const result = await pollTask(stop.data.data, node);
  logger.info('[HyperV] stop task result', { vmid, node, result });
  if (result.result !== 'success') {
    throw new Error('VM shutdown failed.');
  }
}

/**
 * Persist the power state the VM had before we touched it, so the final state
 * can be restored even if a later attempt is resumed by the sweeper.
 */
async function rememberPrePowerState(
  vmObjectId: mongoose.Types.ObjectId,
  state: 'running' | 'stopped'
): Promise<'running' | 'stopped'> {
  const existing = await VM.findById(vmObjectId).select('hyperVPrePowerState').lean();
  const remembered = existing?.hyperVPrePowerState ?? state;
  if (!existing?.hyperVPrePowerState) {
    await VM.findByIdAndUpdate(vmObjectId, { hyperVPrePowerState: remembered });
  }
  return remembered;
}

/**
 * Restore the VM to its remembered pre-operation power state and reflect it on
 * the VM document. Enabling/disabling boots a stopped VM to run PowerShell;
 * this puts it back to stopped if that is how the admin left it.
 */
async function finalizePowerState(
  vmObjectId: mongoose.Types.ObjectId,
  node: string,
  vmid: number,
  prePowerState: 'running' | 'stopped'
): Promise<void> {
  if (prePowerState === 'stopped') {
    try {
      await stopVm(node, vmid);
      await VM.findByIdAndUpdate(vmObjectId, {
        status: 'stopped',
        proxmoxStatus: 'stopped',
        $unset: { hyperVPrePowerState: 1 },
      });
      return;
    } catch (err) {
      // If the restore stop fails, leave it running rather than failing the op.
      logger.warn('[HyperV] could not restore stopped state — leaving VM running', {
        vmid,
        node,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  await VM.findByIdAndUpdate(vmObjectId, {
    status: 'running',
    proxmoxStatus: 'running',
    $unset: { hyperVPrePowerState: 1 },
  });
}

async function rebootVm(node: string, vmid: number): Promise<void> {
  logger.info('[HyperV] rebooting VM', { vmid, node });
  const reboot = await proxmoxClient.post<{ data: string }>(
    `/nodes/${node}/qemu/${vmid}/status/reboot`,
    {}
  );
  const result = await pollTask(reboot.data.data, node);
  logger.info('[HyperV] reboot task result', { vmid, node, result });
  if (result.result !== 'success') {
    throw new Error('VM reboot failed.');
  }
}

async function settleAfterReboot(node: string, vmid: number, vmObjectId: mongoose.Types.ObjectId): Promise<void> {
  logger.info('[HyperV] waiting for post-reboot settle', {
    vmid,
    node,
    ms: config.HYPERV_POST_REBOOT_SETTLE_MS,
  });
  await sleep(config.HYPERV_POST_REBOOT_SETTLE_MS);
  await waitForGuestAgent(node, vmid, vmObjectId);
}

async function runPowerShell(
  node: string,
  vmid: number,
  script: string,
  label: string,
  vmObjectId?: mongoose.Types.ObjectId
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script];
  const deadline = Date.now() + config.HYPERV_EXEC_DEADLINE_MS;
  let lastError = 'no result from guest agent';
  let attempt = 0;

  logger.info('[HyperV] exec begin', {
    vmid,
    node,
    label,
    deadlineMs: config.HYPERV_EXEC_DEADLINE_MS,
  });

  while (Date.now() < deadline) {
    attempt++;

    try {
      await waitForGuestAgent(node, vmid, vmObjectId);
    } catch (err) {
      lastError = classifyHyperVError(err).message;
      logger.warn('[HyperV] agent did not return before issuing command', {
        vmid,
        node,
        label,
        attempt,
        error: lastError,
      });
      break;
    }

    let pid: number;
    try {
      const start = await proxmoxClient.post<{ data: { pid: number } }>(
        `/nodes/${node}/qemu/${vmid}/agent/exec`,
        { command }
      );
      pid = start.data.data.pid;
      logger.info('[HyperV] exec started', { vmid, node, label, attempt, pid });
    } catch (err) {
      const classified = classifyHyperVError(err);
      lastError = classified.message;
      if (!classified.retryable) {
        throw new Error(lastError);
      }
      logger.warn('[HyperV] exec start failed — will retry', {
        vmid,
        node,
        label,
        attempt,
        error: lastError,
      });
      await sleep(config.HYPERV_EXEC_POLL_MS);
      continue;
    }

    let polls = 0;
    let agentDropped = false;
    while (Date.now() < deadline) {
      polls++;
      try {
        const status = await proxmoxClient.get<{ data: AgentExecStatus }>(
          `/nodes/${node}/qemu/${vmid}/agent/exec-status`,
          { params: { pid } }
        );
        const data = status.data.data;
        if (polls === 1) {
          logger.debug('[HyperV] exec-status raw (first poll)', { vmid, node, label, pid, data });
        }
        if (isProcessExited(data)) {
          const stdout = decodeAgentOutput(data['out-data'], (payload) =>
            logger.debug('[HyperV] decode out-data', { vmid, node, label, stream: 'stdout', ...payload })
          );
          const stderr = decodeAgentOutput(data['err-data'], (payload) =>
            logger.debug('[HyperV] decode out-data', { vmid, node, label, stream: 'stderr', ...payload })
          );
          const out = {
            exitCode: data.exitcode ?? 1,
            stdout,
            stderr,
          };
          logger.info('[HyperV] exec completed', {
            vmid,
            node,
            label,
            attempt,
            pid,
            polls,
            exitCode: out.exitCode,
            stdout: out.stdout.slice(0, 500),
            stderr: out.stderr.slice(0, 500),
          });
          return out;
        }
      } catch (err) {
        const classified = classifyHyperVError(err);
        lastError = classified.message;
        if (!classified.retryable) {
          throw new Error(lastError);
        }
        logger.warn('[HyperV] exec-status poll failed — agent dropped, will re-issue', {
          vmid,
          node,
          label,
          attempt,
          pid,
          polls,
          error: lastError,
        });
        agentDropped = true;
        break;
      }
      await sleep(config.HYPERV_EXEC_POLL_MS);
    }

    if (!agentDropped) break;
  }

  logger.error('[HyperV] exec gave up', { vmid, node, label, lastError });
  throw new Error(`Guest command did not complete (${lastError}).`);
}

async function readHyperVState(
  node: string,
  vmid: number,
  label: string
): Promise<'Enabled' | 'Disabled' | 'unknown'> {
  const result = await runPowerShell(node, vmid, HYPERV_STATE_SCRIPT, label);
  const state = parseHyperVState(result.stdout);
  logger.info('[HyperV] feature state read', {
    vmid,
    node,
    label,
    raw: result.stdout.trim(),
    state,
  });
  return state;
}

async function setStatus(
  vmObjectId: mongoose.Types.ObjectId,
  status: HyperVStatus,
  lastError = '',
  resetAttempts = false
): Promise<void> {
  await updateHyperVStatus(vmObjectId, status, {
    lastError,
    resetAttempts: resetAttempts || status === 'enabled' || status === 'disabled',
  });
}

type HyperVEvent =
  | 'HYPERV_ENABLED'
  | 'HYPERV_ENABLE_FAILED'
  | 'HYPERV_DISABLED'
  | 'HYPERV_DISABLE_FAILED';

async function recordEvent(
  params: { vmObjectId: mongoose.Types.ObjectId; vmid: number; adminId: mongoose.Types.ObjectId },
  event: HyperVEvent,
  status: 'success' | 'failed',
  details: Record<string, unknown>
): Promise<void> {
  await VMEvent.create({
    vmId: params.vmObjectId,
    vmid: params.vmid,
    adminId: params.adminId,
    event,
    status,
    details,
    ipAddress: 'hyperv-provisioner',
    userAgent: 'hyperv-provisioner',
  }).catch((err: unknown) => {
    logger.warn('[HyperV] failed to record audit event', {
      vmid: params.vmid,
      event,
      status,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export async function provisionHyperVForVM(params: {
  vmObjectId: mongoose.Types.ObjectId;
  node: string;
  vmid: number;
  adminId: mongoose.Types.ObjectId;
  vmName: string;
}): Promise<HyperVStatus> {
  const { vmObjectId, node, vmid, vmName } = params;

  logger.info('[HyperV] === ENABLE start ===', { vmid, node, vmName });
  await updateHyperVStatus(vmObjectId, 'enabling', { lastError: '' });

  try {
    const prior = await ensureVmRunning(node, vmid);
    const prePowerState = await rememberPrePowerState(vmObjectId, prior);
    await waitForGuestAgent(node, vmid, vmObjectId);

    if ((await readHyperVState(node, vmid, 'pre-check')) === 'Enabled') {
      await finalizePowerState(vmObjectId, node, vmid, prePowerState);
      await setStatus(vmObjectId, 'enabled');
      await recordEvent(params, 'HYPERV_ENABLED', 'success', { node, vmName, alreadyEnabled: true });
      logger.info('[HyperV] Already enabled', { vmid, node, vmName });
      return 'enabled';
    }

    const enable = await runPowerShell(
      node,
      vmid,
      [
        "$ErrorActionPreference='Stop'",
        "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All -NoRestart | Out-Null",
        "Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -NoRestart | Out-Null",
        "Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart | Out-Null",
        "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart | Out-Null",
      ].join('; '),
      'enable',
      vmObjectId
    );
    if (enable.exitCode !== 0 && enable.exitCode !== 3010) {
      throw new Error(enable.stderr || enable.stdout || `enable failed (exit ${enable.exitCode})`);
    }

    await rebootVm(node, vmid);
    await settleAfterReboot(node, vmid, vmObjectId);

    if (config.HYPERV_SECOND_REBOOT && (await readHyperVState(node, vmid, 'verify-1')) !== 'Enabled') {
      logger.info('[HyperV] feature not yet enabled — performing second reboot', { vmid, node });
      await rebootVm(node, vmid);
      await settleAfterReboot(node, vmid, vmObjectId);
    }

    if ((await readHyperVState(node, vmid, 'verify')) !== 'Enabled') {
      throw new Error('Hyper-V did not report as enabled after reboot.');
    }

    await finalizePowerState(vmObjectId, node, vmid, prePowerState);
    await setStatus(vmObjectId, 'enabled');
    await recordEvent(params, 'HYPERV_ENABLED', 'success', { node, vmName });
    logger.info('[HyperV] Enabled successfully', { vmid, node, vmName });
    return 'enabled';
  } catch (err) {
    const message = classifyHyperVError(err).message;
    await setStatus(vmObjectId, 'failed', message);
    await recordEvent(params, 'HYPERV_ENABLE_FAILED', 'failed', { node, vmName, error: message });
    logger.warn('[HyperV] Enable failed', { vmid, node, vmName, error: message });
    return 'failed';
  }
}

export async function disableHyperVForVM(params: {
  vmObjectId: mongoose.Types.ObjectId;
  node: string;
  vmid: number;
  adminId: mongoose.Types.ObjectId;
  vmName: string;
}): Promise<HyperVStatus> {
  const { vmObjectId, node, vmid, vmName } = params;

  logger.info('[HyperV] === DISABLE start ===', { vmid, node, vmName });
  await updateHyperVStatus(vmObjectId, 'disabling', { lastError: '' });

  try {
    const prior = await ensureVmRunning(node, vmid);
    const prePowerState = await rememberPrePowerState(vmObjectId, prior);
    await waitForGuestAgent(node, vmid, vmObjectId);

    if ((await readHyperVState(node, vmid, 'pre-check')) === 'Disabled') {
      await finalizePowerState(vmObjectId, node, vmid, prePowerState);
      await updateHyperVStatus(vmObjectId, 'disabled', {
        lastError: '',
        enableVirtualization: false,
        resetAttempts: true,
      });
      await recordEvent(params, 'HYPERV_DISABLED', 'success', { node, vmName, alreadyDisabled: true });
      return 'disabled';
    }

    const disable = await runPowerShell(
      node,
      vmid,
      [
        "$ErrorActionPreference='Stop'",
        "Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -NoRestart | Out-Null",
        "Disable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -NoRestart | Out-Null",
      ].join('; '),
      'disable',
      vmObjectId
    );
    if (disable.exitCode !== 0 && disable.exitCode !== 3010) {
      throw new Error(disable.stderr || disable.stdout || `disable failed (exit ${disable.exitCode})`);
    }

    await rebootVm(node, vmid);
    await settleAfterReboot(node, vmid, vmObjectId);

    if ((await readHyperVState(node, vmid, 'verify')) !== 'Disabled') {
      throw new Error('Hyper-V did not report as disabled after reboot.');
    }

    await finalizePowerState(vmObjectId, node, vmid, prePowerState);
    await updateHyperVStatus(vmObjectId, 'disabled', {
      lastError: '',
      enableVirtualization: false,
      resetAttempts: true,
    });
    await recordEvent(params, 'HYPERV_DISABLED', 'success', { node, vmName });
    logger.info('[HyperV] Disabled successfully', { vmid, node, vmName });
    return 'disabled';
  } catch (err) {
    const message = classifyHyperVError(err).message;
    await setStatus(vmObjectId, 'failed', message);
    await recordEvent(params, 'HYPERV_DISABLE_FAILED', 'failed', { node, vmName, error: message });
    logger.warn('[HyperV] Disable failed', { vmid, node, vmName, error: message });
    return 'failed';
  }
}
