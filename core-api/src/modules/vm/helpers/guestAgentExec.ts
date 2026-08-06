/**
 * Shared QEMU guest-agent exec for Windows PowerShell.
 *
 * Proxmox VE 8 requires POST /agent/exec body shape:
 *   { command: ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script] }
 * A string `command` + separate `args` key returns HTTP 400 (schema).
 *
 * All call sites (console fixups, Hyper-V, software) must go through this
 * helper so the argv-array body cannot drift.
 */
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { decodeAgentOutput, isProcessExited } from './hypervGuestOutput';

export interface GuestExecResult {
  pid: number;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface AgentExecStatus {
  exited?: number | boolean;
  exitcode?: number;
  'out-data'?: string;
  'err-data'?: string;
}

export interface RunGuestPowerShellOptions {
  /** Log prefix (e.g. VMConsolePoll, HyperV). */
  logLabel?: string;
  /** Interval between exec-status polls. Default 500ms. */
  pollIntervalMs?: number;
  /** Max status polls when no deadlineMs. Default 20 (~10s at 500ms). */
  maxPolls?: number;
  /** Absolute wall-clock deadline (Date.now()-based). Overrides maxPolls when set. */
  deadlineMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** PVE 8 argv array for a PowerShell -Command script. */
export function powershellCommandArgv(script: string): string[] {
  return ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script];
}

/**
 * One-shot guest PowerShell: POST agent/exec (argv array) then poll
 * agent/exec-status until the process exits (or budget exhausted).
 * Throws on Proxmox API / agent errors — callers decide retry vs swallow.
 */
export async function runGuestPowerShellOnce(
  node: string,
  vmid: number,
  script: string,
  options: RunGuestPowerShellOptions = {}
): Promise<GuestExecResult> {
  const logLabel = options.logLabel ?? 'GuestExec';
  // Default ~10s window (20 × 500ms) so netsh / RDP fixups usually finish
  // within a single startIpPolling attempt instead of timing out at polls=8.
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const maxPolls = options.maxPolls ?? 20;
  const deadlineMs = options.deadlineMs;
  const command = powershellCommandArgv(script);

  const start = await proxmoxClient.post<{ data: { pid: number } }>(
    `/nodes/${node}/qemu/${vmid}/agent/exec`,
    { command }
  );
  const pid = start.data.data.pid;
  logger.info(`[${logLabel}] guest exec started`, { node, vmid, pid });

  let polls = 0;
  while (true) {
    if (deadlineMs !== undefined) {
      if (Date.now() >= deadlineMs) break;
    } else if (polls >= maxPolls) {
      break;
    }

    polls++;
    await sleep(pollIntervalMs);

    const status = await proxmoxClient.get<{ data: AgentExecStatus }>(
      `/nodes/${node}/qemu/${vmid}/agent/exec-status`,
      { params: { pid } }
    );
    const data = status.data.data;
    if (isProcessExited(data)) {
      const result: GuestExecResult = {
        pid,
        exitCode: data.exitcode ?? 1,
        stdout: decodeAgentOutput(data['out-data']),
        stderr: decodeAgentOutput(data['err-data']),
      };
      logger.info(`[${logLabel}] guest exec completed`, {
        node,
        vmid,
        pid,
        polls,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 500),
        stderr: result.stderr.slice(0, 500),
      });
      return result;
    }
  }

  throw new Error(
    `Guest exec pid=${pid} did not report exited=true within poll budget (polls=${polls})`
  );
}
