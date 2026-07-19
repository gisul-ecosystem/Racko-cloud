import mongoose from 'mongoose';
import { logger } from '../../../utils/logger';
import { VM } from '../vm.model';
import { VMEvent } from '../vmEvent.model';
import { softwareService } from '../../software/software.service';
import { classifyHyperVError } from './hypervErrors';
import { decodeAgentOutput } from './hypervGuestOutput';
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { config } from '../../../config';
import type { SoftwareInstallStatus } from '../vm.types';

/**
 * Software installation — Windows guests via Chocolatey + guest agent.
 * Used for single-VM create (post-clone) and golden-image seed builds.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchVmPowerState(node: string, vmid: number): Promise<string> {
  try {
    const res = await proxmoxClient.get<{ data: { status: string } }>(
      `/nodes/${node}/qemu/${vmid}/status/current`
    );
    return res.data.data.status;
  } catch (err) {
    return `unreachable (${err instanceof Error ? err.message : String(err)})`;
  }
}

function diagLog(message: string, meta: Record<string, unknown>): void {
  logger.info(`[Golden][Diag] ${message}`, meta);
}

/** Thrown when Sysprep has shut down the VM — caller should treat as success. */
export class SysprepShutdownDetected extends Error {
  constructor() {
    super('Sysprep VM shutdown detected');
    this.name = 'SysprepShutdownDetected';
  }
}

async function waitForSysprepShutdown(
  node: string,
  vmid: number,
  jobId: string | undefined,
  deadline: number,
  startedAt: number,
  trigger: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let powerState = await fetchVmPowerState(node, vmid);
  if (powerState === 'stopped') {
    diagLog('runPowerShell — Sysprep success (VM already stopped)', {
      vmid,
      node,
      jobId,
      trigger,
      elapsedMs: Date.now() - startedAt,
    });
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  diagLog('runPowerShell — waiting for VM shutdown after Sysprep agent drop', {
    vmid,
    node,
    jobId,
    trigger,
    powerState,
    remainingMs: deadline - Date.now(),
    elapsedMs: Date.now() - startedAt,
  });

  while (Date.now() < deadline) {
    await sleep(config.HYPERV_EXEC_POLL_MS);
    powerState = await fetchVmPowerState(node, vmid);
    if (powerState === 'stopped') {
      diagLog('runPowerShell — Sysprep success (VM stopped after wait)', {
        vmid,
        node,
        jobId,
        trigger,
        elapsedMs: Date.now() - startedAt,
      });
      return { exitCode: 0, stdout: '', stderr: '' };
    }
  }

  throw new Error(
    `Sysprep did not shut down VM within timeout (lastPowerState=${powerState}).`
  );
}

export async function waitForGuestAgent(
  node: string,
  vmid: number,
  vmObjectId?: mongoose.Types.ObjectId,
  context?: { jobId?: string; label?: string; sysprepLaunched?: boolean }
): Promise<void> {
  const logLabel = context?.label ?? 'software';
  const deadline = Date.now() + config.HYPERV_AGENT_READY_TIMEOUT_MS;
  let attempt = 0;
  logger.info(`[${logLabel}] waiting for guest agent`, {
    vmid, node, jobId: context?.jobId,
    timeoutMs: config.HYPERV_AGENT_READY_TIMEOUT_MS,
  });

  while (Date.now() < deadline) {
    attempt++;

    if (vmObjectId) {
      const live = await VM.findById(vmObjectId).select('status softwareInstalls').lean();
      if (!live || live.status === 'deleted' || live.status === 'deleting') {
        throw new Error('VM has been deleted — aborting software installation.');
      }
      const allCancelled = live.softwareInstalls.every(
        (s) => s.cancelled || s.status === 'installed' || s.status === 'failed'
      );
      if (allCancelled) {
        throw new Error('All software installations were cancelled.');
      }
    }

    try {
      await proxmoxClient.post(`/nodes/${node}/qemu/${vmid}/agent/ping`, {});
      logger.info(`[${logLabel}] guest agent ping OK`, { vmid, node, attempt, jobId: context?.jobId });
      return;
    } catch (err) {
      const { retryable, message } = classifyHyperVError(err);
      const isNotRunning = /not running/i.test(message);
      if (isNotRunning && (attempt === 1 || attempt % 10 === 0)) {
        let powerState = 'unknown';
        try {
          const ps = await proxmoxClient.get<{ data: { status: string } }>(
            `/nodes/${node}/qemu/${vmid}/status/current`
          );
          powerState = ps.data.data.status;
        } catch { /* ignore */ }
        logger.warn(`[${logLabel}] guest agent ping failed — VM power state`, {
          vmid, node, attempt, powerState, error: message, jobId: context?.jobId,
        });
        if (context?.sysprepLaunched && powerState === 'stopped') {
          throw new SysprepShutdownDetected();
        }
        if (powerState !== 'running' && context?.jobId) {
          logger.info(`[${logLabel}] attempting to start VM before next agent ping`, {
            vmid, node, jobId: context.jobId, powerState,
          });
          try {
            await ensureVmRunning(node, vmid, context.jobId);
          } catch (startErr) {
            logger.warn(`[${logLabel}] failed to start VM during agent wait`, {
              vmid, node, jobId: context.jobId,
              error: startErr instanceof Error ? startErr.message : String(startErr),
            });
          }
        }
      } else {
        logger.debug(`[${logLabel}] guest agent ping failed`, {
          vmid, node, attempt, retryable, error: message, jobId: context?.jobId,
        });
      }
      if (!retryable) throw new Error(`Guest agent is not available: ${message}`);
      await sleep(config.HYPERV_AGENT_POLL_MS);
    }
  }
  throw new Error('Guest agent did not respond within timeout.');
}

export async function ensureVmRunning(node: string, vmid: number, jobId?: string): Promise<void> {
  const res = await proxmoxClient.get<{ data: { status: string } }>(
    `/nodes/${node}/qemu/${vmid}/status/current`
  );
  const currentStatus = res.data.data.status;
  logger.info('[Software] VM power state', { vmid, node, status: currentStatus, jobId });

  if (currentStatus === 'running') {
    logger.info('[Software] VM already running — skipping start', { vmid, node, jobId });
    return;
  }

  logger.info('[Software] starting VM', { vmid, node, previousStatus: currentStatus, jobId });
  const start = await proxmoxClient.post<{ data: string }>(
    `/nodes/${node}/qemu/${vmid}/status/start`,
    {}
  );
  logger.info('[Software] VM start task issued', { vmid, node, startTaskId: start.data.data, jobId });

  const deadline = Date.now() + config.SOFTWARE_VM_START_TIMEOUT_MS;
  let polls = 0;
  while (Date.now() < deadline) {
    await sleep(3000);
    polls++;
    const s = await proxmoxClient.get<{ data: { status: string } }>(
      `/nodes/${node}/qemu/${vmid}/status/current`
    );
    const status = s.data.data.status;
    if (polls === 1 || polls % 5 === 0) {
      logger.info('[Software] waiting for VM to start', { vmid, node, polls, status, jobId });
    }
    if (status === 'running') {
      logger.info('[Software] VM started', { vmid, node, polls, jobId });
      return;
    }
  }
  throw new Error(`VM did not reach running state within ${config.SOFTWARE_VM_START_TIMEOUT_MS / 1000}s (task ${start.data.data}).`);
}

/** Poll until the guest has shut down (e.g. after Sysprep). */
export async function waitForVmStopped(node: string, vmid: number, jobId?: string): Promise<void> {
  const startedAt = Date.now();
  const deadline = startedAt + config.SYSPREP_SHUTDOWN_TIMEOUT_MS;
  const initialStatus = await fetchVmPowerState(node, vmid);

  diagLog('Sysprep shutdown wait — starting', {
    vmid,
    node,
    jobId,
    initialStatus,
    timeoutMs: config.SYSPREP_SHUTDOWN_TIMEOUT_MS,
    pollIntervalMs: 5000,
  });

  let polls = 0;
  let lastStatus = initialStatus;
  const statusHistory: Array<{ poll: number; status: string; elapsedMs: number }> = [
    { poll: 0, status: initialStatus, elapsedMs: 0 },
  ];

  while (Date.now() < deadline) {
    polls++;
    const status = await fetchVmPowerState(node, vmid);
    const elapsedMs = Date.now() - startedAt;

    if (status !== lastStatus) {
      statusHistory.push({ poll: polls, status, elapsedMs });
      diagLog('Sysprep shutdown wait — power state changed', {
        vmid,
        node,
        jobId,
        polls,
        previousStatus: lastStatus,
        newStatus: status,
        elapsedMs,
      });
      if (lastStatus !== 'running' && status === 'running') {
        logger.warn('[Golden][Diag] VM returned to running during Sysprep shutdown wait — possible reboot loop or failed Sysprep', {
          vmid,
          node,
          jobId,
          polls,
          elapsedMs,
        });
      }
      lastStatus = status;
    } else if (polls === 1 || polls % 6 === 0) {
      diagLog('Sysprep shutdown wait — still waiting', {
        vmid,
        node,
        jobId,
        polls,
        status,
        elapsedMs,
        remainingMs: deadline - Date.now(),
      });
    }

    if (status === 'stopped') {
      diagLog('Sysprep shutdown wait — VM stopped', {
        vmid,
        node,
        jobId,
        polls,
        elapsedMs,
        statusHistory,
      });
      return;
    }

    await sleep(5000);
  }

  const elapsedMs = Date.now() - startedAt;
  diagLog('Sysprep shutdown wait — TIMEOUT', {
    vmid,
    node,
    jobId,
    polls,
    elapsedMs,
    lastStatus,
    statusHistory,
  });
  throw new Error(`VM did not stop within ${config.SYSPREP_SHUTDOWN_TIMEOUT_MS / 1000}s after Sysprep (last status: ${lastStatus}).`);
}

interface ExecStatus {
  exited?: number | boolean;
  exitcode?: number;
  'out-data'?: string;
  'err-data'?: string;
}

export async function runPowerShell(
  node: string,
  vmid: number,
  script: string,
  label: string,
  vmObjectId?: mongoose.Types.ObjectId,
  softwareId?: mongoose.Types.ObjectId,
  context?: { jobId?: string }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script];
  const startedAt = Date.now();
  const deadline = startedAt + config.HYPERV_EXEC_DEADLINE_MS;
  const isSysprep = label === 'sysprep';
  const jobId = context?.jobId;
  let execAttempt = 0;
  let sysprepLaunched = false;

  diagLog('runPowerShell — begin', {
    vmid,
    node,
    label,
    jobId,
    isSysprep,
    powerState: await fetchVmPowerState(node, vmid),
    execDeadlineMs: config.HYPERV_EXEC_DEADLINE_MS,
    scriptPreview: script.slice(0, 200),
  });

  while (Date.now() < deadline) {
    execAttempt++;
    const powerBeforeAgentWait = await fetchVmPowerState(node, vmid);
    diagLog('runPowerShell — waiting for guest agent before exec', {
      vmid,
      node,
      label,
      jobId,
      execAttempt,
      powerState: powerBeforeAgentWait,
      elapsedMs: Date.now() - startedAt,
      remainingMs: deadline - Date.now(),
    });

    try {
      await waitForGuestAgent(
        node,
        vmid,
        vmObjectId,
        {
          jobId,
          label: isSysprep ? 'Golden-Sysprep' : label,
          sysprepLaunched: isSysprep ? sysprepLaunched : undefined,
        }
      );
    } catch (err) {
      if (isSysprep && err instanceof SysprepShutdownDetected) {
        return waitForSysprepShutdown(node, vmid, jobId, deadline, startedAt, 'guest-agent-wait');
      }
      throw err;
    }

    let pid: number;
    try {
      const start = await proxmoxClient.post<{ data: { pid: number } }>(
        `/nodes/${node}/qemu/${vmid}/agent/exec`,
        { command }
      );
      pid = start.data.data.pid;
      if (isSysprep) sysprepLaunched = true;
      diagLog('runPowerShell — exec started', {
        vmid,
        node,
        label,
        jobId,
        execAttempt,
        pid,
        powerState: await fetchVmPowerState(node, vmid),
        elapsedMs: Date.now() - startedAt,
      });
    } catch (err) {
      const classified = classifyHyperVError(err);
      logger.warn('[Software] exec start failed', {
        vmid,
        node,
        label,
        jobId,
        execAttempt,
        retryable: classified.retryable,
        error: classified.message,
        powerState: await fetchVmPowerState(node, vmid),
        elapsedMs: Date.now() - startedAt,
      });
      if (!classified.retryable) throw new Error(classified.message);
      const isQmpTimeout = /qmp.*timeout|got timeout/i.test(classified.message);
      const retryDelay = isQmpTimeout ? config.SOFTWARE_QMP_RETRY_DELAY_MS : config.HYPERV_EXEC_POLL_MS;
      if (isQmpTimeout) {
        logger.info('[Software] QMP timeout on exec start — waiting before retry', {
          vmid, node, label, jobId, execAttempt, delayMs: retryDelay,
        });
      }
      await sleep(retryDelay);
      continue;
    }

    let agentDropped = false;
    let polls = 0;
    while (Date.now() < deadline) {
      polls++;

      if (vmObjectId) {
        const live = await VM.findById(vmObjectId).select('status softwareInstalls').lean();
        if (!live || live.status === 'deleted' || live.status === 'deleting') {
          throw new Error('VM has been deleted — aborting software installation.');
        }
        if (softwareId) {
          const thisItem = live.softwareInstalls.find(
            (s) => (s.softwareId as mongoose.Types.ObjectId).toString() === softwareId.toString()
          );
          if (thisItem?.cancelled) {
            throw new Error('Software installation was cancelled by admin.');
          }
        }
      }

      try {
        const s = await proxmoxClient.get<{ data: ExecStatus }>(
          `/nodes/${node}/qemu/${vmid}/agent/exec-status`,
          { params: { pid } }
        );
        const d = s.data.data;
        const exited = d.exited === true || d.exited === 1 || d.exitcode !== undefined;

        if (exited) {
          const stdout = decodeAgentOutput(d['out-data']);
          const stderr = decodeAgentOutput(d['err-data']);
          diagLog('runPowerShell — exec completed', {
            vmid,
            node,
            label,
            jobId,
            execAttempt,
            pid,
            polls,
            exitCode: d.exitcode ?? 1,
            powerState: await fetchVmPowerState(node, vmid),
            elapsedMs: Date.now() - startedAt,
            stdout: stdout.slice(0, 1000),
            stderr: stderr.slice(0, 1000),
          });
          return { exitCode: d.exitcode ?? 1, stdout, stderr };
        }

        if (isSysprep && (polls === 1 || polls % 10 === 0)) {
          diagLog('runPowerShell — Sysprep exec still running', {
            vmid,
            node,
            jobId,
            pid,
            polls,
            powerState: await fetchVmPowerState(node, vmid),
            elapsedMs: Date.now() - startedAt,
          });
        }
      } catch (err) {
        const classified = classifyHyperVError(err);
        const powerState = await fetchVmPowerState(node, vmid);
        logger.warn('[Software] exec-status poll failed', {
          vmid,
          node,
          label,
          jobId,
          execAttempt,
          pid,
          polls,
          retryable: classified.retryable,
          error: classified.message,
          powerState,
          elapsedMs: Date.now() - startedAt,
        });
        if (isSysprep) {
          logger.info('[Golden][Diag] Guest agent dropped during Sysprep exec-status poll — expected during generalize; waiting for VM shutdown', {
            vmid,
            node,
            jobId,
            pid,
            polls,
            powerState,
            error: classified.message,
          });
        }
        if (!classified.retryable) throw new Error(classified.message);
        agentDropped = true;
        break;
      }
      await sleep(config.HYPERV_EXEC_POLL_MS);
    }

    if (!agentDropped) break;

    if (isSysprep) {
      return waitForSysprepShutdown(node, vmid, jobId, deadline, startedAt, 'exec-status-poll');
    }

    const powerOnDrop = await fetchVmPowerState(node, vmid);
    logger.warn('[Golden][Diag] runPowerShell — agent dropped, scheduling exec retry', {
      vmid,
      node,
      label,
      jobId,
      execAttempt,
      powerState: powerOnDrop,
      retryDelayMs: config.SOFTWARE_QMP_RETRY_DELAY_MS,
      elapsedMs: Date.now() - startedAt,
      remainingMs: deadline - Date.now(),
    });
    await sleep(config.SOFTWARE_QMP_RETRY_DELAY_MS);
  }

  const finalPowerState = await fetchVmPowerState(node, vmid);
  diagLog('runPowerShell — TIMEOUT', {
    vmid,
    node,
    label,
    jobId,
    execAttempts: execAttempt,
    finalPowerState,
    elapsedMs: Date.now() - startedAt,
    execDeadlineMs: config.HYPERV_EXEC_DEADLINE_MS,
  });
  throw new Error(`Software install command did not complete within timeout (label=${label}, lastPowerState=${finalPowerState}).`);
}

async function setSoftwareStatus(
  vmObjectId: mongoose.Types.ObjectId,
  softwareId: mongoose.Types.ObjectId,
  status: SoftwareInstallStatus,
  lastError?: string
): Promise<void> {
  const update: Record<string, unknown> = {
    'softwareInstalls.$.status': status,
  };
  if (lastError !== undefined) update['softwareInstalls.$.lastError'] = lastError;
  if (status === 'installed') update['softwareInstalls.$.installedAt'] = new Date();

  await VM.findOneAndUpdate(
    { _id: vmObjectId, 'softwareInstalls.softwareId': softwareId },
    { $set: update }
  );
}

/** Install packages on a guest without MongoDB status tracking (golden seed). */
export async function installSoftwareOnGuest(params: {
  node: string;
  vmid: number;
  softwareIds: mongoose.Types.ObjectId[];
  jobId?: string;
}): Promise<void> {
  const { node, vmid, softwareIds, jobId } = params;
  if (softwareIds.length === 0) return;

  logger.info('[Golden] installSoftwareOnGuest — ensuring VM is running', { vmid, node, jobId });
  await ensureVmRunning(node, vmid, jobId);

  const powerAfterStart = await proxmoxClient.get<{ data: { status: string } }>(
    `/nodes/${node}/qemu/${vmid}/status/current`
  );
  logger.info('[Golden] installSoftwareOnGuest — power state after ensureVmRunning', {
    vmid, node, jobId, status: powerAfterStart.data.data.status,
  });

  await waitForGuestAgent(node, vmid, undefined, { jobId, label: 'Golden' });

  const softwareDocs = await softwareService.getByIds(softwareIds);
  const scriptMap = new Map(softwareDocs.map((s) => [s._id.toString(), s.installScript]));

  logger.info('[Golden] installSoftwareOnGuest — scripts loaded', {
    vmid, node, jobId, found: softwareDocs.length, requested: softwareIds.length,
    packageNames: softwareDocs.map((s) => s.name),
  });

  const rebootPendingPackages: string[] = [];

  for (let i = 0; i < softwareIds.length; i++) {
    const softwareId = softwareIds[i]!;
    const script = scriptMap.get(softwareId.toString());
    if (!script) {
      throw new Error(`Install script not found for software ${softwareId.toString()}.`);
    }

    const name = softwareDocs.find((s) => s._id.equals(softwareId))?.name ?? softwareId.toString();
    diagLog('installSoftwareOnGuest — package start', {
      vmid,
      node,
      jobId,
      name,
      softwareId: softwareId.toString(),
      packageIndex: i + 1,
      packageTotal: softwareIds.length,
      powerState: await fetchVmPowerState(node, vmid),
    });
    const pkgStarted = Date.now();
    const result = await runPowerShell(node, vmid, script, `install-${name}`, undefined, undefined, { jobId });

    if (result.exitCode !== 0 && result.exitCode !== 3010) {
      const errMsg = result.stderr || result.stdout || `exit code ${result.exitCode}`;
      logger.error('[Golden] package install failed', {
        vmid, node, jobId, name, exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 500), stderr: result.stderr.slice(0, 500),
      });
      throw new Error(`Software install failed for ${name}: ${errMsg}`);
    }
    if (result.exitCode === 3010) {
      rebootPendingPackages.push(name);
      logger.warn('[Golden][Diag] package reported reboot required (exit 3010) — no reboot performed before next step', {
        vmid,
        node,
        jobId,
        name,
        exitCode: result.exitCode,
      });
    }
    diagLog('installSoftwareOnGuest — package done', {
      vmid,
      node,
      jobId,
      name,
      exitCode: result.exitCode,
      rebootPending: result.exitCode === 3010,
      elapsedMs: Date.now() - pkgStarted,
      powerState: await fetchVmPowerState(node, vmid),
    });
  }

  diagLog('installSoftwareOnGuest — all packages done', {
    vmid,
    node,
    jobId,
    packageCount: softwareIds.length,
    rebootPendingPackages,
    rebootPendingCount: rebootPendingPackages.length,
    powerState: await fetchVmPowerState(node, vmid),
    warning: rebootPendingPackages.length > 0
      ? 'Windows may need reboot before Sysprep — pending reboot can cause Sysprep failure or unexpected reboot during shutdown wait'
      : undefined,
  });
}

export async function installSoftwareForVM(params: {
  vmObjectId: mongoose.Types.ObjectId;
  node: string;
  vmid: number;
  adminId: mongoose.Types.ObjectId;
  vmName: string;
}): Promise<void> {
  const { vmObjectId, node, vmid, vmName } = params;

  const vm = await VM.findById(vmObjectId).select('softwareInstalls').lean();
  if (!vm) {
    logger.warn('[Software] VM not found, skipping', { vmid, node });
    return;
  }

  const pending = vm.softwareInstalls.filter((s) => s.status === 'pending');
  if (pending.length === 0) {
    logger.info('[Software] no pending installs', { vmid, node });
    return;
  }

  logger.info('[Software] === INSTALL start ===', { vmid, node, vmName, count: pending.length });

  try {
    await ensureVmRunning(node, vmid);
    await waitForGuestAgent(node, vmid, vmObjectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[Software] VM not ready, marking all pending as failed', { vmid, node, message });
    for (const item of pending) {
      await setSoftwareStatus(vmObjectId, item.softwareId as mongoose.Types.ObjectId, 'failed', message);
    }
    return;
  }

  const softwareDocs = await softwareService.getByIds(
    pending.map((p) => p.softwareId as mongoose.Types.ObjectId)
  );
  const scriptMap = new Map(softwareDocs.map((s) => [s._id.toString(), s.installScript]));

  for (const item of pending) {
    const softwareId = item.softwareId as mongoose.Types.ObjectId;
    const script = scriptMap.get(softwareId.toString());

    if (!script) {
      await setSoftwareStatus(vmObjectId, softwareId, 'failed', 'Install script not found.');
      continue;
    }

    const freshVm = await VM.findById(vmObjectId).select('softwareInstalls').lean();
    const freshItem = freshVm?.softwareInstalls.find(
      (s) => (s.softwareId as mongoose.Types.ObjectId).toString() === softwareId.toString()
    );
    if (freshItem?.cancelled) {
      await setSoftwareStatus(vmObjectId, softwareId, 'failed', 'Cancelled by admin.');
      continue;
    }

    await setSoftwareStatus(vmObjectId, softwareId, 'installing');

    try {
      const result = await runPowerShell(node, vmid, script, `install-${item.name}`, vmObjectId, softwareId);

      if (result.exitCode === 0 || result.exitCode === 3010) {
        await setSoftwareStatus(vmObjectId, softwareId, 'installed');
        await VMEvent.create({
          vmId: vmObjectId,
          vmid,
          adminId: params.adminId,
          event: 'SOFTWARE_INSTALLED',
          status: 'success',
          details: { node, vmName, softwareId: softwareId.toString(), name: item.name, exitCode: result.exitCode },
          ipAddress: 'software-provisioner',
          userAgent: 'software-provisioner',
        }).catch(() => undefined);
      } else {
        const errMsg = result.stderr || result.stdout || `exit code ${result.exitCode}`;
        await setSoftwareStatus(vmObjectId, softwareId, 'failed', errMsg);
        await VMEvent.create({
          vmId: vmObjectId,
          vmid,
          adminId: params.adminId,
          event: 'SOFTWARE_INSTALL_FAILED',
          status: 'failed',
          details: { node, vmName, softwareId: softwareId.toString(), name: item.name, exitCode: result.exitCode },
          ipAddress: 'software-provisioner',
          userAgent: 'software-provisioner',
        }).catch(() => undefined);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await setSoftwareStatus(vmObjectId, softwareId, 'failed', message);
    }
  }

  logger.info('[Software] === INSTALL done ===', { vmid, node, vmName });
}

const SYSPREP_SCRIPT =
  "$ErrorActionPreference='Stop'; & \"$env:WINDIR\\System32\\Sysprep\\Sysprep.exe\" /oobe /generalize /quiet /shutdown";

/** Run Sysprep and wait for the guest to shut down. */
export async function runSysprepAndShutdown(node: string, vmid: number, jobId?: string): Promise<void> {
  const sysprepStarted = Date.now();
  const powerBefore = await fetchVmPowerState(node, vmid);

  diagLog('runSysprepAndShutdown — starting', {
    vmid,
    node,
    jobId,
    powerState: powerBefore,
    sysprepScript: SYSPREP_SCRIPT,
    execDeadlineMs: config.HYPERV_EXEC_DEADLINE_MS,
    shutdownTimeoutMs: config.SYSPREP_SHUTDOWN_TIMEOUT_MS,
  });

  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await runPowerShell(node, vmid, SYSPREP_SCRIPT, 'sysprep', undefined, undefined, { jobId });
  } catch (err) {
    const powerAfterError = await fetchVmPowerState(node, vmid);
    const message = err instanceof Error ? err.message : String(err);
    diagLog('runSysprepAndShutdown — runPowerShell failed', {
      vmid,
      node,
      jobId,
      error: message,
      powerState: powerAfterError,
      elapsedMs: Date.now() - sysprepStarted,
      hint: 'If powerState is running/stopped and agent dropped, Sysprep may still have started — check shutdown wait logs',
    });
    throw err;
  }

  const powerAfterExec = await fetchVmPowerState(node, vmid);
  diagLog('runSysprepAndShutdown — exec returned', {
    vmid,
    node,
    jobId,
    exitCode: result.exitCode,
    powerBefore,
    powerAfterExec,
    elapsedMs: Date.now() - sysprepStarted,
    stdout: result.stdout.slice(0, 500),
    stderr: result.stderr.slice(0, 500),
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `Sysprep failed (exit ${result.exitCode})`);
  }

  await waitForVmStopped(node, vmid, jobId);

  diagLog('runSysprepAndShutdown — complete', {
    vmid,
    node,
    jobId,
    totalElapsedMs: Date.now() - sysprepStarted,
    finalPowerState: await fetchVmPowerState(node, vmid),
  });
}
