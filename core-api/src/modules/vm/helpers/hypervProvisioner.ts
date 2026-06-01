import mongoose from 'mongoose';
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { pollTask } from './taskPoller';
import { VM } from '../vm.model';
import { VMEvent } from '../vmEvent.model';
import type { HyperVStatus } from '../vm.types';

/**
 * Hyper-V (nested virtualization) provisioning for Windows guests.
 *
 * The flow is deliberately simple and linear — exactly what the operation is:
 *
 *   start VM → wait for guest agent → enable feature → reboot → verify
 *
 * The ONLY reliable source of truth is the actual feature state reported by
 * `Get-WindowsOptionalFeature` after the reboot. We never hang waiting on a
 * guest-exec PID — if the guest agent drops (which happens when a freshly
 * cloned Windows VM auto-reboots during first-boot / sysprep specialization),
 * we re-wait for the agent and re-issue the (idempotent) command. Every guest
 * command is bounded by a single overall wall-clock deadline that intentionally
 * spans multiple boot/reboot cycles, and the final state read decides
 * success/failure.
 */

// How long to wait for the guest agent to answer after a (re)boot.
const AGENT_READY_TIMEOUT_MS = 5 * 60 * 1000;
const AGENT_POLL_MS = 5_000;

// How often to poll a running command's exec-status.
const EXEC_POLL_MS = 3_000;

// Overall wall-clock budget for a single guest command to complete. This is
// deliberately long because it must survive the agent going away and coming
// back across one or more Windows first-boot reboots. When the agent drops, we
// re-wait for it and re-issue the (idempotent) command until this deadline.
const EXEC_DEADLINE_MS = 20 * 60 * 1000;

// Give Windows a moment to start booting after we trigger a reboot.
const POST_REBOOT_SETTLE_MS = 20_000;

interface AgentExecStatus {
  exited?: number;
  exitcode?: number;
  'out-data'?: string;
  'err-data'?: string;
}

/**
 * Hyper-V is a Windows-only feature. Match real Proxmox Windows ostypes
 * (win7, win8, win10, win11, w2k variants, wvista, wxp). `l26` etc. are
 * Linux and are excluded.
 */
export function isWindowsOsType(osType?: string): boolean {
  if (!osType) return false;
  const t = osType.toLowerCase();
  return t.startsWith('win') || t.startsWith('w2k') || t === 'wvista' || t === 'wxp';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** PowerShell: emit an ASCII marker we can grep from guest-exec output. */
const HYPERV_STATE_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$s=(Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V).State.ToString().Trim()",
  "if($s -eq 'Enabled'){'HYPERV_STATE=ON'}else{'HYPERV_STATE=OFF'}",
].join('; ');

function looksLikeFeatureState(text: string): boolean {
  return /hyperv_state=(on|off)|\benabled\b|\bdisabled\b/i.test(text);
}

function bufferHexPreview(buf: Buffer, max = 32): string {
  return buf.subarray(0, max).toString('hex');
}

/**
 * Decode stdout/stderr from QEMU guest-exec `out-data` / `err-data`.
 *
 * Proxmox may return either:
 * - plain text (e.g. "Enabled") — must NOT be base64-decoded (that corrupts it), or
 * - base64-encoded bytes (often UTF-16LE on Windows).
 *
 * Words like "Enabled" are valid base64 alphabet chars, so blind decode produces garbage.
 */
function decodeAgentOutput(
  data?: string,
  logContext?: { vmid: number | string; node: string; label: string; stream: 'stdout' | 'stderr' }
): string {
  if (!data) return '';
  const trimmed = data.trim();
  if (!trimmed) return '';

  const candidates: { name: string; text: string }[] = [
    { name: 'plain', text: trimmed },
  ];

  // Only attempt base64 when plain text is not already a readable feature-state line.
  const tryBase64 =
    !looksLikeFeatureState(trimmed) &&
    /^[A-Za-z0-9+/]+=*$/.test(trimmed) &&
    trimmed.length >= 8 &&
    trimmed.length % 4 === 0;

  let decodedBuf: Buffer | undefined;
  if (tryBase64) {
    try {
      decodedBuf = Buffer.from(trimmed, 'base64');
      if (decodedBuf.length > 0) {
        if (decodedBuf.length >= 2 && decodedBuf[0] === 0xff && decodedBuf[1] === 0xfe) {
          candidates.push({
            name: 'b64-utf16le-bom',
            text: decodedBuf.subarray(2).toString('utf16le').replace(/\0/g, '').trim(),
          });
        }
        candidates.push(
          { name: 'b64-utf16le', text: decodedBuf.toString('utf16le').replace(/\0/g, '').trim() },
          { name: 'b64-utf8', text: decodedBuf.toString('utf8').trim() },
          { name: 'b64-latin1', text: decodedBuf.toString('latin1').trim() }
        );
      }
    } catch {
      // not valid base64 — use plain only
    }
  }

  if (logContext) {
    logger.info('[HyperV] decode out-data', {
      ...logContext,
      rawLen: trimmed.length,
      rawPreview: trimmed.slice(0, 120),
      tryBase64,
      decodedLen: decodedBuf?.length,
      decodedHex: decodedBuf ? bufferHexPreview(decodedBuf) : undefined,
      candidates: candidates.map((c) => ({ name: c.name, text: c.text.slice(0, 120) })),
    });
  }

  for (const c of candidates) {
    if (looksLikeFeatureState(c.text)) return c.text;
  }

  if (/^[\x20-\x7e\r\n\t]+$/.test(trimmed)) return trimmed;

  const utf16 = candidates.find((c) => c.name.startsWith('b64-utf16'));
  return utf16?.text ?? candidates[candidates.length - 1]?.text ?? trimmed;
}

/** Map guest PowerShell output to Hyper-V feature state. */
function parseHyperVState(stdout: string): 'Enabled' | 'Disabled' | 'unknown' {
  const text = stdout.replace(/\0/g, '').trim().toLowerCase();
  if (text.includes('hyperv_state=on') || /\benabled\b/.test(text)) return 'Enabled';
  if (text.includes('hyperv_state=off') || /\bdisabled\b/.test(text)) return 'Disabled';
  return 'unknown';
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Wait until the QEMU guest agent answers a ping (or time out). */
async function waitForGuestAgent(node: string, vmid: number): Promise<void> {
  const deadline = Date.now() + AGENT_READY_TIMEOUT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    try {
      // `ping` is a POST endpoint; a successful (even empty) reply = agent up.
      await proxmoxClient.post(`/nodes/${node}/qemu/${vmid}/agent/ping`, {});
      logger.info('[HyperV] guest agent ping OK', { vmid, node, attempt });
      return;
    } catch (err) {
      logger.warn('[HyperV] guest agent ping failed — retrying', {
        vmid, node, attempt, error: errMessage(err),
      });
      await sleep(AGENT_POLL_MS);
    }
  }
  throw new Error(
    'Guest agent did not respond. Ensure the QEMU guest agent is installed and running in the VM.'
  );
}

/** Ensure the VM is powered on. */
async function ensureVmRunning(node: string, vmid: number): Promise<void> {
  const current = await proxmoxClient.get<{ data: { status: string } }>(
    `/nodes/${node}/qemu/${vmid}/status/current`
  );
  logger.info('[HyperV] current power state', { vmid, node, status: current.data.data.status });
  if (current.data.data.status === 'running') return;

  logger.info('[HyperV] starting VM', { vmid, node });
  const start = await proxmoxClient.post<{ data: string }>(
    `/nodes/${node}/qemu/${vmid}/status/start`,
    {}
  );
  const result = await pollTask(start.data.data, node);
  logger.info('[HyperV] start task result', { vmid, node, result });
  if (result !== 'success') {
    throw new Error('Failed to power on the VM.');
  }
}

/** Reboot the VM and wait for the task to finish. */
async function rebootVm(node: string, vmid: number): Promise<void> {
  logger.info('[HyperV] rebooting VM', { vmid, node });
  const reboot = await proxmoxClient.post<{ data: string }>(
    `/nodes/${node}/qemu/${vmid}/status/reboot`,
    {}
  );
  const result = await pollTask(reboot.data.data, node);
  logger.info('[HyperV] reboot task result', { vmid, node, result });
  if (result !== 'success') {
    throw new Error('VM reboot failed.');
  }
}

/**
 * Run a PowerShell command in the guest and return its exit code + output.
 *
 * Resilient across reboots: a freshly cloned Windows VM brings the guest agent
 * up, then auto-reboots during first-boot specialization, taking the agent and
 * any in-flight command down with it. So whenever the agent disappears (exec or
 * exec-status fails, or a PID stops being pollable), we re-wait for the agent
 * to return and re-issue the (idempotent) command. The whole thing is bounded
 * by a single EXEC_DEADLINE_MS wall-clock budget that spans those reboots.
 */
async function runPowerShell(
  node: string,
  vmid: number,
  script: string,
  label: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script];
  const deadline = Date.now() + EXEC_DEADLINE_MS;
  let lastError = 'no result from guest agent';
  let attempt = 0;

  logger.info('[HyperV] exec begin', { vmid, node, label, deadlineMs: EXEC_DEADLINE_MS });

  while (Date.now() < deadline) {
    attempt++;

    // The agent may be down (booting/rebooting). Wait for it before issuing.
    try {
      await waitForGuestAgent(node, vmid);
    } catch (err) {
      lastError = errMessage(err);
      logger.warn('[HyperV] agent did not return before issuing command', {
        vmid, node, label, attempt, error: lastError,
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
      // Agent went away between ping and exec (reboot window) — retry.
      lastError = errMessage(err);
      logger.warn('[HyperV] exec start failed — agent likely rebooting, will retry', {
        vmid, node, label, attempt, error: lastError,
      });
      await sleep(EXEC_POLL_MS);
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
          logger.info('[HyperV] exec-status raw (first poll)', { vmid, node, label, pid, data });
        }
        if (data.exited === 1) {
          const logCtx = { vmid, node, label };
          const out = {
            exitCode: data.exitcode ?? 1,
            stdout: decodeAgentOutput(data['out-data'], { ...logCtx, stream: 'stdout' }),
            stderr: decodeAgentOutput(data['err-data'], { ...logCtx, stream: 'stderr' }),
          };
          logger.info('[HyperV] exec completed', {
            vmid, node, label, attempt, pid, polls,
            exitCode: out.exitCode,
            outDataRawLen: data['out-data']?.length ?? 0,
            outDataRawPreview: data['out-data']?.slice(0, 120),
            stdout: out.stdout.slice(0, 500),
            stderr: out.stderr.slice(0, 500),
          });
          return out;
        }
        // still running
      } catch (err) {
        // Agent dropped mid-command (guest rebooted). Re-wait + re-issue.
        lastError = errMessage(err);
        logger.warn('[HyperV] exec-status poll failed — agent dropped, will re-wait and re-issue', {
          vmid, node, label, attempt, pid, polls, error: lastError,
        });
        agentDropped = true;
        break;
      }
      await sleep(EXEC_POLL_MS);
    }

    // Inner loop ended without the agent dropping → we hit the overall deadline
    // while the command was still running. Nothing more to do.
    if (!agentDropped) break;
  }

  logger.error('[HyperV] exec gave up', { vmid, node, label, lastError });
  throw new Error(`Guest command did not complete (${lastError}).`);
}

/** Read the current Hyper-V feature state from the guest. */
async function readHyperVState(
  node: string,
  vmid: number,
  label: string
): Promise<'Enabled' | 'Disabled' | 'unknown'> {
  const result = await runPowerShell(node, vmid, HYPERV_STATE_SCRIPT, label);
  const state = parseHyperVState(result.stdout);
  logger.info('[HyperV] feature state read', { vmid, node, label, raw: result.stdout.trim(), state });
  return state;
}

async function setStatus(
  vmObjectId: mongoose.Types.ObjectId,
  status: HyperVStatus,
  lastError = ''
): Promise<void> {
  await VM.findByIdAndUpdate(vmObjectId, { hyperVStatus: status, hyperVLastError: lastError });
}

async function recordEvent(
  params: { vmObjectId: mongoose.Types.ObjectId; vmid: number; adminId: mongoose.Types.ObjectId },
  event: 'HYPERV_ENABLED' | 'HYPERV_ENABLE_FAILED' | 'HYPERV_DISABLED',
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
  }).catch(() => undefined);
}

/**
 * Enable Hyper-V inside a Windows VM:
 *   start → wait for agent → enable → reboot → wait for agent → verify state.
 */
export async function provisionHyperVForVM(params: {
  vmObjectId: mongoose.Types.ObjectId;
  node: string;
  vmid: number;
  adminId: mongoose.Types.ObjectId;
  vmName: string;
}): Promise<HyperVStatus> {
  const { vmObjectId, node, vmid, vmName } = params;

  logger.info('[HyperV] === ENABLE start ===', { vmid, node, vmName });
  await setStatus(vmObjectId, 'enabling');

  try {
    await ensureVmRunning(node, vmid);
    await waitForGuestAgent(node, vmid);

    // Idempotent: if it's already on, we're done.
    if ((await readHyperVState(node, vmid, 'pre-check')) === 'Enabled') {
      await setStatus(vmObjectId, 'enabled');
      await recordEvent(params, 'HYPERV_ENABLED', 'success', { node, vmName, alreadyEnabled: true });
      logger.info('[HyperV] Already enabled', { vmid, node, vmName });
      return 'enabled';
    }

    const enable = await runPowerShell(
      node,
      vmid,
      "$ErrorActionPreference='Stop'; Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All -NoRestart | Out-Null",
      'enable'
    );
    // 0 = ok, 3010 = ok but reboot required. Anything else is a real failure.
    if (enable.exitCode !== 0 && enable.exitCode !== 3010) {
      throw new Error(enable.stderr || enable.stdout || `enable failed (exit ${enable.exitCode})`);
    }

    await rebootVm(node, vmid);
    logger.info('[HyperV] waiting for post-reboot settle', { vmid, node, ms: POST_REBOOT_SETTLE_MS });
    await sleep(POST_REBOOT_SETTLE_MS);
    await waitForGuestAgent(node, vmid);

    if ((await readHyperVState(node, vmid, 'verify')) !== 'Enabled') {
      throw new Error('Hyper-V did not report as enabled after reboot.');
    }

    await setStatus(vmObjectId, 'enabled');
    await VM.findByIdAndUpdate(vmObjectId, { status: 'running', proxmoxStatus: 'running' });
    await recordEvent(params, 'HYPERV_ENABLED', 'success', { node, vmName });
    logger.info('[HyperV] Enabled successfully', { vmid, node, vmName });
    return 'enabled';
  } catch (err) {
    const message = errMessage(err);
    await setStatus(vmObjectId, 'failed', message);
    await recordEvent(params, 'HYPERV_ENABLE_FAILED', 'failed', { node, vmName, error: message });
    logger.warn('[HyperV] Enable failed', { vmid, node, vmName, error: message });
    return 'failed';
  }
}

/**
 * Disable Hyper-V inside a Windows VM (same linear flow, inverse verify).
 */
export async function disableHyperVForVM(params: {
  vmObjectId: mongoose.Types.ObjectId;
  node: string;
  vmid: number;
  adminId: mongoose.Types.ObjectId;
  vmName: string;
}): Promise<HyperVStatus> {
  const { vmObjectId, node, vmid, vmName } = params;

  logger.info('[HyperV] === DISABLE start ===', { vmid, node, vmName });
  await setStatus(vmObjectId, 'enabling');

  try {
    await ensureVmRunning(node, vmid);
    await waitForGuestAgent(node, vmid);

    if ((await readHyperVState(node, vmid, 'pre-check')) === 'Disabled') {
      await VM.findByIdAndUpdate(vmObjectId, {
        hyperVStatus: 'disabled',
        hyperVLastError: '',
        enableVirtualization: false,
      });
      await recordEvent(params, 'HYPERV_DISABLED', 'success', { node, vmName, alreadyDisabled: true });
      return 'disabled';
    }

    const disable = await runPowerShell(
      node,
      vmid,
      "$ErrorActionPreference='Stop'; Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -NoRestart | Out-Null",
      'disable'
    );
    if (disable.exitCode !== 0 && disable.exitCode !== 3010) {
      throw new Error(disable.stderr || disable.stdout || `disable failed (exit ${disable.exitCode})`);
    }

    await rebootVm(node, vmid);
    logger.info('[HyperV] waiting for post-reboot settle', { vmid, node, ms: POST_REBOOT_SETTLE_MS });
    await sleep(POST_REBOOT_SETTLE_MS);
    await waitForGuestAgent(node, vmid);

    if ((await readHyperVState(node, vmid, 'verify')) !== 'Disabled') {
      throw new Error('Hyper-V did not report as disabled after reboot.');
    }

    await VM.findByIdAndUpdate(vmObjectId, {
      hyperVStatus: 'disabled',
      hyperVLastError: '',
      enableVirtualization: false,
    });
    await recordEvent(params, 'HYPERV_DISABLED', 'success', { node, vmName });
    logger.info('[HyperV] Disabled successfully', { vmid, node, vmName });
    return 'disabled';
  } catch (err) {
    const message = errMessage(err);
    await setStatus(vmObjectId, 'failed', message);
    await recordEvent(params, 'HYPERV_ENABLE_FAILED', 'failed', { node, vmName, error: message, operation: 'disable' });
    logger.warn('[HyperV] Disable failed', { vmid, node, vmName, error: message });
    return 'failed';
  }
}
