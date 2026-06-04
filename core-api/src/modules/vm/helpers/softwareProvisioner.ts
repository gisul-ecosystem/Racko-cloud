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
 * Software installation provisioner — Windows guests via Chocolatey + guest agent.
 *
 * Runs after the VM is created (and after HyperV if that was also requested).
 * Each package is installed sequentially so errors are isolated per-package.
 * Exit code 3010 = success-but-reboot-required — treated as success (choco handles it).
 */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForGuestAgent(node: string, vmid: number, vmObjectId?: mongoose.Types.ObjectId): Promise<void> {
  const deadline = Date.now() + config.HYPERV_AGENT_READY_TIMEOUT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;

    // Liveness + cancellation check — abort if VM deleted or all installs cancelled
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
      logger.info('[Software] guest agent ping OK', { vmid, node, attempt });
      return;
    } catch (err) {
      const { retryable, message } = classifyHyperVError(err);
      logger.debug('[Software] guest agent ping failed', { vmid, node, attempt, retryable, error: message });
      if (!retryable) throw new Error(`Guest agent is not available: ${message}`);
      await sleep(config.HYPERV_AGENT_POLL_MS);
    }
  }
  throw new Error('Guest agent did not respond within timeout.');
}

async function ensureVmRunning(node: string, vmid: number): Promise<void> {
  const res = await proxmoxClient.get<{ data: { status: string } }>(
    `/nodes/${node}/qemu/${vmid}/status/current`
  );
  const currentStatus = res.data.data.status;
  logger.info('[Software] VM power state', { vmid, node, status: currentStatus });

  if (currentStatus !== 'running') {
    logger.info('[Software] starting VM', { vmid, node });
    const start = await proxmoxClient.post<{ data: string }>(
      `/nodes/${node}/qemu/${vmid}/status/start`,
      {}
    );
    const deadline = Date.now() + config.SOFTWARE_VM_START_TIMEOUT_MS;
    let polls = 0;
    while (Date.now() < deadline) {
      await sleep(3000);
      polls++;
      const s = await proxmoxClient.get<{ data: { status: string } }>(
        `/nodes/${node}/qemu/${vmid}/status/current`
      );
      logger.debug('[Software] waiting for VM to start', { vmid, node, polls, status: s.data.data.status });
      if (s.data.data.status === 'running') {
        logger.info('[Software] VM started', { vmid, node, polls });
        return;
      }
    }
    throw new Error(`VM did not reach running state within ${config.SOFTWARE_VM_START_TIMEOUT_MS / 1000}s (task ${start.data.data}).`);
  }
}

interface ExecStatus {
  exited?: number | boolean;
  exitcode?: number;
  'out-data'?: string;
  'err-data'?: string;
}

async function runPowerShell(
  node: string,
  vmid: number,
  script: string,
  label: string,
  vmObjectId?: mongoose.Types.ObjectId,
  softwareId?: mongoose.Types.ObjectId
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  // decodeAgentOutput handles all encoding variants (UTF-16LE, UTF-8, latin1)
  const command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script];
  const deadline = Date.now() + config.HYPERV_EXEC_DEADLINE_MS;

  logger.info('[Software] exec begin', { vmid, node, label, script: script.slice(0, 200) });

  while (Date.now() < deadline) {
    await waitForGuestAgent(node, vmid, vmObjectId);

    let pid: number;
    try {
      const start = await proxmoxClient.post<{ data: { pid: number } }>(
        `/nodes/${node}/qemu/${vmid}/agent/exec`,
        { command }
      );
      pid = start.data.data.pid;
      logger.info('[Software] exec started', { vmid, node, label, pid });
    } catch (err) {
      const classified = classifyHyperVError(err);
      logger.warn('[Software] exec start failed', { vmid, node, label, retryable: classified.retryable, error: classified.message });
      if (!classified.retryable) throw new Error(classified.message);
      // QMP timeout on exec start — zombie process may hold lock, wait longer before retry
      const isQmpTimeout = /qmp.*timeout|got timeout/i.test(classified.message);
      const retryDelay = isQmpTimeout ? config.SOFTWARE_QMP_RETRY_DELAY_MS : config.HYPERV_EXEC_POLL_MS;
      if (isQmpTimeout) {
        logger.info('[Software] QMP timeout on exec start — waiting before retry to let zombie process settle', { vmid, node, label, delayMs: retryDelay });
      }
      await sleep(retryDelay);
      continue;
    }

    let agentDropped = false;
    let polls = 0;
    while (Date.now() < deadline) {
      polls++;

      // Cancellation check inside the poll loop — exit immediately if cancelled mid-install
      if (vmObjectId) {
        const live = await VM.findById(vmObjectId).select('status softwareInstalls').lean();
        if (!live || live.status === 'deleted' || live.status === 'deleting') {
          throw new Error('VM has been deleted — aborting software installation.');
        }
        // Check if the specific package being installed was cancelled
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

        if (polls === 1) {
          logger.debug('[Software] exec-status first poll', { vmid, node, label, pid, data: d });
        }

        if (exited) {
          const stdout = decodeAgentOutput(d['out-data']);
          const stderr = decodeAgentOutput(d['err-data']);
          logger.info('[Software] exec completed', {
            vmid, node, label, pid, polls,
            exitCode: d.exitcode ?? 1,
            stdout: stdout.slice(0, 1000),
            stderr: stderr.slice(0, 1000),
          });
          return { exitCode: d.exitcode ?? 1, stdout, stderr };
        }

        logger.debug('[Software] exec still running', { vmid, node, label, pid, polls });
      } catch (err) {
        const classified = classifyHyperVError(err);
        logger.warn('[Software] exec-status poll failed', { vmid, node, label, pid, polls, retryable: classified.retryable, error: classified.message });
        if (!classified.retryable) throw new Error(classified.message);
        agentDropped = true;
        break;
      }
      await sleep(config.HYPERV_EXEC_POLL_MS);
    }

    if (!agentDropped) break;
    // Wait before retrying after agent drop — gives any zombie Chocolatey process
    // inside the VM time to finish or die and release file locks before we re-issue.
    logger.info('[Software] agent dropped — waiting before retry to let zombie process settle', { vmid, node, label });
    await sleep(config.SOFTWARE_QMP_RETRY_DELAY_MS);
  }

  throw new Error('Software install command did not complete within timeout.');
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

  // Ensure VM is running and guest agent is up
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

  // Fetch full software docs so we have the installScript
  const softwareDocs = await softwareService.getByIds(
    pending.map((p) => p.softwareId as mongoose.Types.ObjectId)
  );
  const scriptMap = new Map(softwareDocs.map((s) => [s._id.toString(), s.installScript]));
  logger.info('[Software] scripts loaded', { vmid, node, found: softwareDocs.length, requested: pending.length });

  // Install each package sequentially — one failure does not stop others
  for (const item of pending) {
    const softwareId = item.softwareId as mongoose.Types.ObjectId;
    const script = scriptMap.get(softwareId.toString());

    if (!script) {
      logger.warn('[Software] script not found for package', { vmid, node, name: item.name, softwareId: softwareId.toString() });
      await setSoftwareStatus(vmObjectId, softwareId, 'failed', 'Install script not found.');
      continue;
    }

    // Re-read cancellation state from DB (snapshot may be stale if cancel happened after provisioner started)
    const freshVm = await VM.findById(vmObjectId).select('softwareInstalls').lean();
    const freshItem = freshVm?.softwareInstalls.find(
      (s) => (s.softwareId as mongoose.Types.ObjectId).toString() === softwareId.toString()
    );
    if (freshItem?.cancelled) {
      logger.info('[Software] package cancelled, skipping', { vmid, node, name: item.name });
      await setSoftwareStatus(vmObjectId, softwareId, 'failed', 'Cancelled by admin.');
      continue;
    }

    logger.info('[Software] starting install', { vmid, node, name: item.name, softwareId: softwareId.toString(), scriptLength: script.length });
    await setSoftwareStatus(vmObjectId, softwareId, 'installing');

    try {
      const result = await runPowerShell(node, vmid, script, `install-${item.name}`, vmObjectId, softwareId);

      // 0 = success, 3010 = success + reboot required
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
        logger.info('[Software] installed successfully', { vmid, node, name: item.name, exitCode: result.exitCode });
      } else {
        const errMsg = result.stderr || result.stdout || `exit code ${result.exitCode}`;
        await setSoftwareStatus(vmObjectId, softwareId, 'failed', errMsg);
        await VMEvent.create({
          vmId: vmObjectId,
          vmid,
          adminId: params.adminId,
          event: 'SOFTWARE_INSTALL_FAILED',
          status: 'failed',
          details: { node, vmName, softwareId: softwareId.toString(), name: item.name, exitCode: result.exitCode, stdout: result.stdout.slice(0, 500), stderr: result.stderr.slice(0, 500) },
          ipAddress: 'software-provisioner',
          userAgent: 'software-provisioner',
        }).catch(() => undefined);
        logger.warn('[Software] install failed', {
          vmid, node, name: item.name,
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 500),
          stderr: result.stderr.slice(0, 500),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await setSoftwareStatus(vmObjectId, softwareId, 'failed', message);
      logger.error('[Software] install threw exception', { vmid, node, name: item.name, error: message });
    }
  }

  logger.info('[Software] === INSTALL done ===', { vmid, node, vmName });
}
