import type { Request } from 'express';
import mongoose from 'mongoose';
import { proxmoxClient } from '../../utils/proxmoxClient';
import { guacamoleClient, type GuacamoleProtocol } from '../../utils/guacamoleClient';
import { logger } from '../../utils/logger';
import { VM } from './vm.model';
import { VMJob } from './vmJob.model';
import { VMEvent } from './vmEvent.model';
import { VmTemplate } from './vmTemplate.model';
import { AdminVmTemplate } from '../adminVmTemplate/adminVmTemplate.model';
import { validateResources } from './helpers/resourceValidator';
import {
  sumProxmoxProvisionedDiskBytes,
  sumGuestFilesystemUsedBytes,
  getProxmoxAllocatedCores,
  getProxmoxAllocatedMemoryMb,
} from './helpers/diskMetrics';
import { pollTask } from './helpers/taskPoller';
import {
  assessResumeOutcome,
  isQmpPrelaunch,
  planVmStatusDbSync,
  probeProxmoxVmState,
  waitForVmGuestReady,
} from './helpers/proxmoxResumeVerify';
import { processBulkCreation } from './helpers/bulkProcessor';
import { processBulkDeletion } from './helpers/bulkDeleteProcessor';
import { processVmClone } from './helpers/cloneProcessor';
import { retryProxmoxDelete } from './helpers/deleteRetry';
import { releaseIP } from './ipAllocator.service';
import { decrypt } from '../../utils/crypto';
import { ProxmoxNodeService } from '../proxmoxNode/proxmoxNode.service';
import { config } from '../../config';
import { isWindowsOsType } from './helpers/hypervProvisioner';
import { runGuestPowerShellOnce } from './helpers/guestAgentExec';
import { scheduleHyperVEnable, scheduleHyperVDisable } from './helpers/hypervQueue';
import { isHyperVInProgress, updateHyperVStatus } from './helpers/hypervStatus';
import { softwareService } from '../software/software.service';
import {
  assertUserCanPowerVm,
  getAutomationPowerInfo,
  getAutomationPowerInfoBatch,
  type AutomationPowerInfo,
} from '../vmAutomation/vmAutomationPowerGuard';
import {
  AccessWindowDeniedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  VMNotFoundError,
  VMOwnershipError,
  VMOperationError,
  TemplateNotFoundError,
  InsufficientResourcesError,
  ProxmoxConnectionError,
  ProxmoxAuthError,
} from '../../utils/errors';
import {
  parseAccessScheduleInput,
  accessSchedulePublicView,
  type AccessScheduleInput,
} from '../vmAccessSchedule/accessScheduleParse';
import {
  assertVmAccessibleForUser,
  cancelSchedule,
  checkAccessWindow,
  scheduleDisconnect,
  unblockUserSession,
  expirePortalSessions,
  blockUserSession,
} from '../vmAccessSchedule/scheduleManager';
import { User } from '../../models/user.model';
import type { ProxmoxVMRaw } from '../proxmox/proxmox.types';
import { managedUsersService } from '../managedUsers/managedUsers.service';
import type {
  CreateVMDto,
  ProxmoxTemplate,
  TemplateDetails,
  VMOperationResult,
  VMStatus,
  VMFilters,
  VMDetails,
  JobVMCredential,
  VirtualizationStatus,
  ProxmoxVMCurrentStatus,
  ProxmoxNetworkInterface,
  ProxmoxFsInfo,
  ProxmoxNodeRaw,
  BulkAssignPairsDto,
  BulkAssignPairsResult,
  BulkAssignPairRow,
} from './vm.types';
import type { IVM } from './vm.model';
import type { IVMJob } from './vmJob.model';
import type { IVMEvent } from './vmEvent.model';
import type { AuthenticatedRequest } from '../../types';

// ─── Private helpers ──────────────────────────────────────────────────────────

function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return 'just started';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(' ') : 'just started';
}

/**
 * Derive the Guacamole console protocol from the template OS type.
 * Windows guests use RDP; everything else defaults to SSH.
 */
function deriveConsoleProtocol(osType?: string): 'rdp' | 'ssh' {
  const normalized = (osType ?? '').toLowerCase();
  return normalized.includes('win') ? 'rdp' : 'ssh';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Surface ProxmoxConnectionError/AuthError internals in fixup logs (public message is sanitized). */
function proxmoxErrFields(err: unknown): Record<string, unknown> {
  if (err instanceof ProxmoxConnectionError) {
    return {
      error: err.message,
      internalMessage: err.internalMessage,
      httpStatus: err.httpStatus,
      isRetryable: err.isRetryable,
    };
  }
  if (err instanceof ProxmoxAuthError) {
    return { error: err.message, code: err.code };
  }
  return { error: err instanceof Error ? err.message : String(err) };
}

/**
 * Console passwords for private-network VMs are stored AES-256-CBC encrypted
 * (see bulkProcessor.ts createSingleVM). Public-network VMs keep the existing
 * plaintext storage untouched. Decrypt here — the single place every caller
 * reads consolePassword for actual use/display — so callers never need to know
 * which network type a VM has.
 */
function resolveConsolePassword(vm: { consolePassword?: string; networkType?: string }): string | undefined {
  if (!vm.consolePassword || vm.networkType !== 'private') return vm.consolePassword;
  try {
    return decrypt(vm.consolePassword);
  } catch (err) {
    logger.warn('[VM] Failed to decrypt private VM console password — returning raw value', {
      error: err instanceof Error ? err.message : String(err),
    });
    return vm.consolePassword;
  }
}

/** Best-effort Proxmox power state for diagnostics (never throws). */
async function probeProxmoxPowerState(
  node: string,
  vmid: number
): Promise<{ status: string; qmpstatus?: string } | { error: string }> {
  const probe = await probeProxmoxVmState(node, vmid);
  if ('error' in probe) return probe;
  return { status: probe.status, qmpstatus: probe.qmpstatus };
}

interface ConsolePollOptions {
  mode?: 'cold-start' | 'resume';
}

/**
 * Windows guests don't always apply the static IP Proxmox hands them via
 * cloud-init's ipconfig0 — cloudbase-init is inconsistent about re-running
 * network config on clones (some base templates carry over a NIC config
 * baked in at capture time), so the clone can boot with a stale/wrong
 * address instead of the freshly-allocated custnet1 address. This is a
 * guest-exec fallback for PRIVATE Windows VMs only: force the primary "Up"
 * adapter (named "Ethernet" on these templates) onto the assigned static
 * IP/gateway/DNS/MTU via `netsh`.
 *
 * Deliberately uses `netsh interface ipv4 set address ... static` (via the
 * shared guestAgentExec helper) rather than PowerShell networking cmdlets that
 * fail when a default-gateway route already exists: those leave the adapter
 * with no IPv4 at all, which is worse than the original mismatch. `netsh set
 * address` replaces the address + gateway atomically in one call and is
 * naturally idempotent (re-running with the same values is a no-op), so no
 * "only if not already set" guard is needed.
 *
 * Verifies the GUEST-side result via agent/exec-status (exitCode + stdout/
 * stderr). If no "Up" adapter is ready yet the script exits 2 with
 * NO_ADAPTER — treated as "not done" so the next poll attempt retries.
 * Success is only logged when exitCode is 0 and an adapter was configured.
 *
 * Best-effort only — never throws. A failure here must not block the
 * console-readiness poll from continuing to retry.
 */
async function fixPrivateNetworkGuestIp(
  node: string,
  vmid: number,
  assignedIp: string,
  gateway: string
): Promise<void> {
  try {
    const subnetMask = '255.255.0.0'; // custnet1 is a flat /16 — see bulkProcessor.ts ipconfig0
    const mtu = 1400; // custnet1/VXLAN carries 1450 — 1400 leaves headroom and matches net0's mtu=1400
    // Exit 2 + NO_ADAPTER when no NIC is Up yet so callers can retry instead
    // of treating a silent no-op as success.
    const script =
      `$ip='${assignedIp}'; $gw='${gateway}'; $mask='${subnetMask}'; $mtu=${mtu}; ` +
      "$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1; " +
      "if (-not $adapter) { Write-Output 'NO_ADAPTER'; exit 2 }; " +
      "netsh interface ipv4 set address name=\"$($adapter.Name)\" static $ip $mask $gw | Out-Null; " +
      "netsh interface ipv4 set dns name=\"$($adapter.Name)\" static 8.8.8.8 | Out-Null; " +
      // Same adapter selected above — the guacd RDP graphics pipeline times out over the
      // 1450-byte custnet1/VXLAN path without this, even though the IP itself is reachable.
      "netsh interface ipv4 set subinterface \"$($adapter.Name)\" mtu=$mtu store=persistent | Out-Null; " +
      "Write-Output ('OK:' + $adapter.Name);";

    const { pid, exitCode, stdout, stderr } = await runGuestPowerShellOnce(node, vmid, script, {
      logLabel: 'VMConsolePoll',
    });

    // NO_ADAPTER (exit 2) or any non-zero exit — NIC not ready / netsh failed.
    // Do NOT log success; startIpPolling will re-invoke on the next attempt.
    if (exitCode !== 0 || stdout.includes('NO_ADAPTER')) {
      logger.warn('[VMConsolePoll] Private-network guest IP fixup — not done (will retry)', {
        node,
        vmid,
        pid,
        exitCode,
        stdout: stdout.slice(0, 1000),
        stderr: stderr.slice(0, 1000),
        assignedIp,
        gateway,
      });
      return;
    }

    logger.info('[VMConsolePoll] Private-network guest IP + MTU fixup executed (netsh)', {
      node,
      vmid,
      assignedIp,
      gateway,
      mtu,
      pid,
      exitCode,
      stdout: stdout.slice(0, 500),
    });
  } catch (err) {
    logger.warn('[VMConsolePoll] Private-network guest IP + MTU fixup failed — continuing anyway', {
      node,
      vmid,
      assignedIp,
      gateway,
      ...proxmoxErrFields(err),
    });
  }
}

/**
 * Cloned accounts can inherit an expired-password or "must change password
 * at next logon" flag from the template's local account policy, which
 * silently fails RDP logins with "Your credentials did not work" even
 * though the account is otherwise unlocked. Idempotent — safe to re-run.
 * Best-effort only — never throws.
 */
async function fixWindowsPasswordPolicy(node: string, vmid: number, username: string): Promise<void> {
  try {
    const safeUsername = username.replace(/["'$`]/g, '');
    const script =
      `Set-LocalUser -Name '${safeUsername}' -PasswordNeverExpires $true -ErrorAction SilentlyContinue; ` +
      `net user "${safeUsername}" /logonpasswordchg:no`;

    const { pid, exitCode, stdout, stderr } = await runGuestPowerShellOnce(node, vmid, script, {
      logLabel: 'VMConsolePoll',
    });
    logger.info('[VMConsolePoll] Windows password-policy fixup executed', {
      node,
      vmid,
      username: safeUsername,
      pid,
      exitCode,
      stdout: stdout.slice(0, 500),
      stderr: stderr.slice(0, 500),
    });
  } catch (err) {
    logger.warn('[VMConsolePoll] Windows password-policy fixup failed — continuing anyway', {
      node,
      vmid,
      username,
      ...proxmoxErrFields(err),
    });
  }
}

/**
 * Fresh Windows templates often ship with the built-in Administrator account
 * disabled/expired, RDP not enabled (fDenyTSConnections=1), the "Remote
 * Desktop" firewall group off, and NLA-only auth — any one of which silently
 * blocks Guacamole logins. Runs a one-shot guest-exec PowerShell fixup via
 * the Proxmox QEMU agent so every new Windows VM is RDP-ready without manual
 * intervention.
 *
 * NOTE: this deliberately does NOT touch fEnableWddmDriver — disabling the
 * WDDM graphics driver requires a reboot to take effect and must be baked
 * into the template itself, not applied as a runtime/no-reboot fixup here.
 *
 * Idempotent — every statement is a no-op if already applied, so it's safe
 * to call more than once (e.g. both mid-poll on the private-IP path and
 * again once consoleReady flips true).
 *
 * Best-effort only — never throws. A failure here must not block consoleReady
 * or any other part of the boot flow (guest agent may not support exec on all
 * templates, WinRM policies may block it, etc.).
 */
async function fixWindowsRdpAccess(node: string, vmid: number): Promise<void> {
  try {
    const script =
      "Enable-LocalUser -Name 'Administrator'; Set-LocalUser -Name 'Administrator' -PasswordNeverExpires $true; $user = [ADSI]'WinNT://./Administrator,user'; $user.PasswordExpired = 0; $user.SetInfo(); Add-LocalGroupMember -Group 'Remote Desktop Users' -Member 'Administrator' -ErrorAction SilentlyContinue; Set-ItemProperty 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name fDenyTSConnections -Value 0 -ErrorAction SilentlyContinue; Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -ErrorAction SilentlyContinue; Set-ItemProperty 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -Name UserAuthentication -Value 0; $nlm = [Activator]::CreateInstance([Type]::GetTypeFromCLSID([Guid]'{DCB00C01-570F-4A9B-8D69-199FDBA5723B}')); $nlm.GetNetworkConnections() | ForEach-Object { $_.GetNetwork().SetCategory(1) };";

    const { pid, exitCode, stdout, stderr } = await runGuestPowerShellOnce(node, vmid, script, {
      logLabel: 'VMConsolePoll',
    });
    logger.info('[VMConsolePoll] Windows RDP access fixup executed', {
      node,
      vmid,
      pid,
      exitCode,
      stdout: stdout.slice(0, 500),
      stderr: stderr.slice(0, 500),
    });
  } catch (err) {
    logger.warn('[VMConsolePoll] Windows RDP access fixup failed — continuing anyway', {
      node,
      vmid,
      ...proxmoxErrFields(err),
    });
  }
}

/**
 * Fire-and-forget poll for a VM's console-readiness after it starts.
 *
 * Waits for the guest agent to come up, then queries network-get-interfaces.
 * vm.ipAddress is already known and stored in the DB before the VM boots (set
 * at IP-allocation time — see bulkProcessor.ts), so for PUBLIC VMs we only
 * need to confirm the guest agent is responsive; we no longer match a
 * specific address (that exact-match gate was removed to fix a boot-timing
 * connectivity bug — see commit 98d489b).
 *
 * PRIVATE VMs (custnet1, 10.110.x.x) are gated more strictly: consoleReady is
 * only set once the guest agent reports vm.ipAddress verbatim among its
 * interfaces. This is a newer, less-proven path (custnet1 bridge + cloud-init
 * ipconfig0 on a /16), so we deliberately verify the assigned address actually
 * came up rather than assuming cloud-init succeeded — an exact match, never a
 * prefix check, so a stray address on the same subnet can't false-positive.
 * After attempt 1 (cloud-init's natural first chance), if the assigned IP still
 * hasn't shown up and the VM is a Windows/RDP guest, we force-apply the full
 * set of no-reboot console prerequisites via guest-exec on EVERY subsequent
 * attempt until the guest reports vm.ipAddress (cloudbase-init doesn't always
 * re-run network config on clones, and the IP alone isn't enough for Guacamole
 * to connect): fixPrivateNetworkGuestIp() (static IP + same-adapter MTU), then
 * fixWindowsRdpAccess() (RDP enabled/firewall/NLA/admin unlock), then
 * fixWindowsPasswordPolicy() (no forced password-change/expiry surprises).
 * Each attempt's guest-agent query + fixup is wrapped in try/catch so a
 * transient throw never aborts the poll loop.
 *
 * All Proxmox/agent errors are swallowed and retried — this never throws and
 * never blocks the caller (the start API responds immediately; readiness
 * resolves in the background).
 */
async function startIpPolling(
  vm: Pick<IVM, '_id' | 'node' | 'vmid' | 'ipAddress' | 'consoleProtocol' | 'networkType' | 'consoleUsername'>,
  trigger = 'unknown',
  options: ConsolePollOptions = {}
): Promise<void> {
  const vmObjectId = vm._id;
  const { node, vmid } = vm;
  const isResume = options.mode === 'resume';
  const maxRetries = isResume ? 8 : 12;
  const delayMs = isResume ? 5_000 : 10_000;
  const initialWaitMs = isResume ? 3_000 : 15_000;
  const cloudbaseGraceMs = isResume ? 5_000 : 15_000;

  const dbBefore = await VM.findById(vmObjectId).select('status isHibernated consoleReady ipAddress').lean();
  const proxmoxBefore = await probeProxmoxPowerState(node, vmid);

  logger.debug('[VMConsolePoll] Started IP / console-ready polling', {
    vmId: vmObjectId.toString(),
    vmid,
    node,
    trigger,
    initialWaitMs,
    maxRetries,
    delayMs,
    mode: options.mode ?? 'cold-start',
    dbStatus: dbBefore?.status,
    dbIsHibernated: dbBefore?.isHibernated,
    dbConsoleReady: dbBefore?.consoleReady,
    dbIpAddress: dbBefore?.ipAddress ?? null,
    proxmoxPowerState: 'status' in proxmoxBefore ? proxmoxBefore.status : null,
    proxmoxProbeError: 'error' in proxmoxBefore ? proxmoxBefore.error : null,
  });

  // Give the VM time to boot before the first guest-agent query.
  await sleep(initialWaitMs);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const proxmoxLive = await probeProxmoxPowerState(node, vmid);

    try {
      const res = await proxmoxClient.get<{ data: { result: ProxmoxNetworkInterface[] } }>(
        `/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`
      );
      const interfaces = res.data.data.result ?? [];
      const isPrivateNetwork = vm.networkType === 'private';

      // Collect all seen IPv4s. For public VMs this is for logging only — we no
      // longer match against vm.ipAddress there (see doc comment above). For
      // private VMs it doubles as the exact-match check gating consoleReady.
      const seenIps: string[] = [];
      let exactMatchFound = false;
      for (const iface of interfaces) {
        if (iface.name === 'lo') continue;
        for (const addr of iface['ip-addresses'] ?? []) {
          if (addr['ip-address-type'] === 'ipv4') {
            seenIps.push(`${iface.name}:${addr['ip-address']}`);
            if (addr['ip-address'] === vm.ipAddress) exactMatchFound = true;
          }
        }
      }

      logger.info(`[BulkVM] [vmid=${vmid}] STEP: startIpPolling attempt ${attempt}/${maxRetries} | data: guestAgentResponded=true interfacesReturned=${interfaces.length} seenIps=${seenIps.join(',') || 'none'} assignedIp=${vm.ipAddress} networkType=${vm.networkType ?? 'public'} exactMatchFound=${exactMatchFound}`);

      if (isPrivateNetwork && !exactMatchFound) {
        // custnet1 + cloud-init ipconfig0 hasn't come up with the assigned
        // address yet (or failed) — do not flag console-ready. Keep retrying;
        // exhausting all retries here means the private IP never came up.
        logger.warn('[VMConsolePoll] Private VM — guest agent responded but assigned IP not seen yet', {
          vmId: vmObjectId.toString(),
          vmid,
          node,
          trigger,
          attempt,
          assignedIp: vm.ipAddress,
          allIpv4Seen: seenIps,
        });

        // Skip attempt 1 so cloud-init gets one natural chance. From attempt 2
        // onward keep re-applying the no-reboot console prerequisites until
        // exactMatchFound — a prior one-shot attempt===2 gate meant a single
        // transient guest-agent throw permanently skipped the fixup for the
        // whole poll cycle. fEnableWddmDriver is deliberately NOT touched here
        // — it requires a reboot and must be set in the template, not fixed
        // at runtime.
        if (attempt >= 2 && vm.consoleProtocol === 'rdp' && vm.ipAddress) {
          try {
            await fixPrivateNetworkGuestIp(node, vmid, vm.ipAddress, config.PRIVATE_POOL_GATEWAY); // IP + same-adapter MTU
            await fixWindowsRdpAccess(node, vmid); // RDP enabled + firewall + NLA + admin unlocked
            if (vm.consoleUsername) {
              await fixWindowsPasswordPolicy(node, vmid, vm.consoleUsername); // no "credentials expired" surprises
            }
          } catch (fixupErr) {
            logger.warn('[VMConsolePoll] Private-VM fixup threw — will retry next attempt', {
              vmid,
              attempt,
              error: fixupErr instanceof Error ? fixupErr.message : String(fixupErr),
            });
          }
        }
      } else {
        // Guest agent responded (and, for private VMs, the assigned IP was
        // confirmed) — VM is booted and ready.
        await sleep(cloudbaseGraceMs);
        const consoleReadyAt = new Date().toISOString();
        await VM.findByIdAndUpdate(vmObjectId, { consoleReady: true });
        logger.info(`[BulkVM] [vmid=${vmid}] STEP: consoleReady set to true | data: timestamp=${consoleReadyAt} assignedIp=${vm.ipAddress}`);

        if (vm.consoleProtocol === 'rdp') {
          await fixWindowsRdpAccess(node, vmid);
        }

        logger.debug('[VMConsolePoll] consoleReady=true — guest agent confirmed boot', {
          vmId: vmObjectId.toString(),
          vmid,
          node,
          trigger,
          attempt,
          assignedIp: vm.ipAddress,
          networkType: vm.networkType ?? 'public',
          allIpv4Seen: seenIps,
          cloudbaseGraceMs,
        });
        return;
      }
    } catch (err) {
      // Guest agent not ready yet, VM still booting, transient Proxmox error, etc.
      // Log and continue — a throw on one attempt must not abort the poll loop.
      logger.warn('[VMConsolePoll] Guest-agent poll failed — will retry', {
        vmId: vmObjectId.toString(),
        vmid,
        node,
        trigger,
        attempt,
        proxmoxPowerState: 'status' in proxmoxLive ? proxmoxLive.status : null,
        proxmoxProbeError: 'error' in proxmoxLive ? proxmoxLive.error : null,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (attempt < maxRetries) await sleep(delayMs);
  }

  const dbAfter = await VM.findById(vmObjectId).select('status isHibernated consoleReady ipAddress').lean();
  const proxmoxAfter = await probeProxmoxPowerState(node, vmid);

  logger.warn('[VMConsolePoll] Exhausted all retries — consoleReady still false', {
    vmId: vmObjectId.toString(),
    vmid,
    node,
    trigger,
    attempts: maxRetries,
    dbStatus: dbAfter?.status,
    dbIsHibernated: dbAfter?.isHibernated,
    dbConsoleReady: dbAfter?.consoleReady,
    dbIpAddress: dbAfter?.ipAddress ?? null,
    proxmoxPowerState: 'status' in proxmoxAfter ? proxmoxAfter.status : null,
    proxmoxProbeError: 'error' in proxmoxAfter ? proxmoxAfter.error : null,
  });
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  return req.ip ?? 'unknown';
}

function getUserAgent(req: Request): string {
  return req.headers['user-agent'] ?? 'unknown';
}

/**
 * Check VM access. Super admins bypass. Admins must own the VM.
 * Users may only access VMs assigned to them (assignedTo).
 */
function assertOwnership(vm: IVM, requestingUserId: string, requestingRole: string): void {
  if (requestingRole === 'super_admin') return;
  if (requestingRole === 'user') {
    if (!vm.assignedTo || vm.assignedTo.toString() !== requestingUserId) {
      throw new VMOwnershipError('You do not have permission to access this VM.');
    }
    return;
  }
  if (vm.adminId.toString() !== requestingUserId) {
    throw new VMOwnershipError('You do not have permission to access this VM.');
  }
}

async function fetchProxmoxTemplates(): Promise<ProxmoxTemplate[]> {
  const nodesResponse = await proxmoxClient.get<{ data: ProxmoxNodeRaw[] }>('/nodes');
  const allOnlineNodes = nodesResponse.data.data.filter((n) => n.status === 'online');

  // Only query nodes registered as active in the platform — avoids 30s timeouts from dead nodes.
  // Falls back to all online nodes if none are registered yet.
  const activeNodeNames = await ProxmoxNodeService.getActiveNodeNames();
  const onlineNodes = activeNodeNames.length > 0
    ? allOnlineNodes.filter((n) => activeNodeNames.includes(n.node))
    : allOnlineNodes;

  const results = await Promise.allSettled(
    onlineNodes.map((node) =>
      proxmoxClient
        .get<{ data: ProxmoxVMRaw[] }>(`/nodes/${node.node}/qemu`)
        .then((r) =>
          r.data.data
            .filter((vm) => vm.template === 1)
            .map((vm) => ({ ...vm, node: node.node }))
        )
    )
  );

  const allTemplates: ProxmoxTemplate[] = [];
  const seenVmids = new Set<number>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      for (const tpl of result.value) {
        if (!seenVmids.has(tpl.vmid)) {
          seenVmids.add(tpl.vmid);
          allTemplates.push({
            vmid: tpl.vmid,
            name: tpl.name,
            node: tpl.node,
            // Proxmox list API: `cpus` = allocated cores, `maxmem` = RAM bytes (`cpu` is usage %).
            cpu: tpl.cpus ?? 1,
            memory: tpl.maxmem ?? 0,
            disk: tpl.disk ?? 0,
            maxdisk: tpl.maxdisk ?? 0,
            status: tpl.status,
            template: tpl.template,
          });
        }
      }
    } else {
      logger.warn('Failed to fetch templates from node', {
        node: onlineNodes[i]?.node ?? 'unknown',
        reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  return allTemplates.sort((a, b) => a.name.localeCompare(b.name));
}

export interface RemovedTemplateEntry {
  vmid: number;
  name: string;
}

/**
 * Disable catalog records for templates no longer present on the cluster.
 * Proxmox is the source of truth — stale enabled rows block saves otherwise.
 */
async function reconcileStaleTemplates(
  proxmoxVmids: Set<number>,
  updatedBy?: mongoose.Types.ObjectId
): Promise<RemovedTemplateEntry[]> {
  const staleDocs = await VmTemplate.find({
    isEnabled: true,
    vmid: { $nin: [...proxmoxVmids] },
  })
    .select('vmid name')
    .lean();

  if (staleDocs.length === 0) return [];

  await VmTemplate.updateMany(
    { vmid: { $nin: [...proxmoxVmids] } },
    { $set: { isEnabled: false, ...(updatedBy ? { updatedBy } : {}) } }
  );

  logger.info('Stale VM template catalog entries auto-disabled', {
    count: staleDocs.length,
    vmids: staleDocs.map((d) => d.vmid),
  });

  return staleDocs.map((d) => ({ vmid: d.vmid, name: d.name }));
}

export class VMService {
  /**
   * Templates enabled for VM creation (admin dashboard).
   * Returns super-admin enabled Proxmox templates + the calling admin's own custom templates.
   * Each admin only sees their own custom templates — never another admin's.
   */
  async getTemplates(req: Request): Promise<ProxmoxTemplate[]> {
    const authReq = req as AuthenticatedRequest;
    const adminObjectId = new mongoose.Types.ObjectId(authReq.user.userId);

    // Check DB first — skip Proxmox entirely if nothing to show
    const [enabledDocs, adminTemplateDocs] = await Promise.all([
      VmTemplate.find({ isEnabled: true }).select('vmid').lean(),
      AdminVmTemplate.find({ adminId: adminObjectId, status: 'ready' }).lean(),
    ]);

    if (enabledDocs.length === 0 && adminTemplateDocs.length === 0) return [];

    // Fetch Proxmox templates once — only when there's something to merge
    const all = await fetchProxmoxTemplates();

    // Super-admin enabled templates (shared across all admins)
    const enabledVmids = new Set(enabledDocs.map((d) => d.vmid));
    const sharedTemplates = all
      .filter((t) => enabledVmids.has(t.vmid))
      .map((t) => ({ ...t, isCustom: false }));

    // Admin's own custom templates merged into the same shape — deduped against shared
    const proxmoxByVmid = new Map(all.map((t) => [t.vmid, t]));
    const sharedVmids = new Set(sharedTemplates.map((t) => t.vmid));

    const customTemplates: ProxmoxTemplate[] = adminTemplateDocs
      .filter((t) => t.proxmoxVmid != null && proxmoxByVmid.has(t.proxmoxVmid) && !sharedVmids.has(t.proxmoxVmid))
      .map((t) => {
        const proxmox = proxmoxByVmid.get(t.proxmoxVmid!)!;
        return {
          vmid: proxmox.vmid,
          name: t.name,
          node: proxmox.node,
          cpu: proxmox.cpu,
          memory: proxmox.memory,
          disk: proxmox.disk,
          maxdisk: proxmox.maxdisk,
          status: proxmox.status,
          template: 1,
          isCustom: true,
        };
      });

    return [...sharedTemplates, ...customTemplates];
  }

  /**
   * Full Proxmox template list with enabled flags — super admin catalog UI.
   */
  async getTemplateCatalog(): Promise<{
    templates: ProxmoxTemplate[];
    enabledVmids: number[];
    removedFromCluster: RemovedTemplateEntry[];
  }> {
    const templates = await fetchProxmoxTemplates();
    const proxmoxVmids = new Set(templates.map((t) => t.vmid));

    const removedFromCluster = await reconcileStaleTemplates(proxmoxVmids);

    const enabledDocs = await VmTemplate.find({ isEnabled: true }).select('vmid').lean();
    const enabledVmids = enabledDocs
      .map((d) => d.vmid)
      .filter((vmid) => proxmoxVmids.has(vmid));

    return { templates, enabledVmids, removedFromCluster };
  }

  /**
   * Save which Proxmox templates are offered to admins.
   */
  async setTemplateSelection(
    enabledVmids: number[],
    updatedBy: mongoose.Types.ObjectId
  ): Promise<{
    enabledCount: number;
    removedFromCluster: RemovedTemplateEntry[];
    warning?: string;
  }> {
    const all = await fetchProxmoxTemplates();
    const proxmoxVmids = new Set(all.map((t) => t.vmid));
    const uniqueRequested = [...new Set(enabledVmids)];

    // Drop vmids not on the cluster instead of failing the whole save.
    const validEnabled = uniqueRequested.filter((vmid) => proxmoxVmids.has(vmid));
    const droppedFromRequest = uniqueRequested.filter((vmid) => !proxmoxVmids.has(vmid));

    const removedFromCluster = await reconcileStaleTemplates(proxmoxVmids, updatedBy);

    const enabledSet = new Set(validEnabled);

    await Promise.all(
      all.map((tpl) =>
        VmTemplate.findOneAndUpdate(
          { vmid: tpl.vmid },
          {
            vmid: tpl.vmid,
            name: tpl.name,
            node: tpl.node,
            isEnabled: enabledSet.has(tpl.vmid),
            updatedBy,
          },
          { upsert: true, new: true }
        )
      )
    );

    const removedVmids = new Set([
      ...removedFromCluster.map((r) => r.vmid),
      ...droppedFromRequest,
    ]);
    const allRemoved = [
      ...removedFromCluster,
      ...droppedFromRequest
        .filter((vmid) => !removedFromCluster.some((r) => r.vmid === vmid))
        .map((vmid) => ({ vmid, name: `vmid ${vmid}` })),
    ];

    let warning: string | undefined;
    if (removedVmids.size > 0) {
      const labels = allRemoved.map((r) => `${r.name} (${r.vmid})`).join(', ');
      warning = `${removedVmids.size} template(s) no longer on the cluster and were auto-disabled: ${labels}.`;
    }

    logger.info('VM template selection updated', {
      updatedBy: updatedBy.toString(),
      enabledCount: validEnabled.length,
      totalOnCluster: all.length,
      droppedFromRequest,
      staleDisabled: removedFromCluster.map((r) => r.vmid),
    });

    return {
      enabledCount: validEnabled.length,
      removedFromCluster: allRemoved,
      warning,
    };
  }

  private async assertTemplateEnabledForCreate(
    templateId: number,
    role: string,
    adminId?: string
  ): Promise<void> {
    if (role === 'super_admin') return;

    // Check super-admin enabled templates
    const enabled = await VmTemplate.exists({ vmid: templateId, isEnabled: true });
    if (enabled) return;

    // Check admin's own custom templates
    if (adminId) {
      const adminTemplate = await AdminVmTemplate.exists({
        proxmoxVmid: templateId,
        adminId: new mongoose.Types.ObjectId(adminId),
        status: 'ready',
      });
      if (adminTemplate) return;
    }

    throw new ValidationError('This template is not available for VM creation.');
  }

  /**
   * Get full config details for a specific template.
   */
  async getTemplateDetails(templateId: number, req: Request): Promise<TemplateDetails> {
    const authReq = req as AuthenticatedRequest;
    await this.assertTemplateEnabledForCreate(templateId, authReq.user.role, authReq.user.userId);

    const all = await fetchProxmoxTemplates();
    const template = all.find((t) => t.vmid === templateId);

    if (!template) {
      throw new TemplateNotFoundError(`Template ${templateId} not found.`);
    }

    const configResponse = await proxmoxClient.get<{
      data: { cores?: number; memory?: number; scsi0?: string; ostype?: string; description?: string; name?: string; ciuser?: string };
    }>(`/nodes/${template.node}/qemu/${templateId}/config`);

    const cfg = configResponse.data.data;

    // Parse disk size from scsi0 config string (e.g. "local-lvm:vm-100-disk-0,size=32G")
    let diskGb = bytesToGb(template.maxdisk);
    if (cfg.scsi0) {
      const sizeMatch = /size=(\d+)G/i.exec(cfg.scsi0);
      if (sizeMatch?.[1]) diskGb = parseInt(sizeMatch[1], 10);
    }

    return {
      vmid: template.vmid,
      name: template.name,
      node: template.node,
      cpuCores: cfg.cores ?? template.cpu ?? 1,
      memoryGb: cfg.memory ? cfg.memory / 1024 : bytesToGb(template.memory),
      diskGb,
      osType: cfg.ostype,
      description: cfg.description,
      // cloudbase-init can only set the password for the template's existing user.
      // Expose that fixed username; fall back to 'Admin' when the template omits ciuser.
      defaultUsername: cfg.ciuser?.trim() || 'Admin',
    };
  }

  /**
   * Create one or more VMs.
   * All creations go through the async job system — returns jobId immediately.
   * This prevents gateway timeouts and duplicate VM creation on retries.
   */
  async createVM(
    dto: CreateVMDto,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<{ jobId: string }> {
    // Validate count against configured maximum
    if (dto.count > config.VM_MAX_BULK_COUNT) {
      throw new ValidationError(
        `Cannot create more than ${config.VM_MAX_BULK_COUNT} VMs at once.`
      );
    }

    // Get template details — validates template exists and is enabled for admins
    const templateDetails = await this.getTemplateDetails(dto.templateId, req);

    const templateSpecs = {
      cpuCores: templateDetails.cpuCores,
      memoryGb: templateDetails.memoryGb,
      diskGb: templateDetails.diskGb,
    };

    // Resolve final specs
    const cpuCores = dto.cpuCores ?? templateSpecs.cpuCores;
    const memoryGb = dto.memoryGb ?? templateSpecs.memoryGb;
    const diskGb = dto.diskGb ?? templateSpecs.diskGb;

    // Console protocol is computed server-side from the template OS type — never
    // taken from the client. Windows → rdp, everything else → ssh.
    const consoleProtocol = deriveConsoleProtocol(templateDetails.osType);

    // Console username comes from the template's cloud-init ciuser (see getTemplateDetails).
    const consoleUsername = templateDetails.defaultUsername;

    // Virtualization (Hyper-V) is Windows-only
    const enableVirtualization = dto.enableVirtualization ?? false;
    if (enableVirtualization && !isWindowsOsType(templateDetails.osType)) {
      throw new ValidationError('Virtualization can only be enabled on Windows templates.');
    }

    // Software installation is Windows-only (Chocolatey)
    const softwareIds = (dto.softwareIds ?? []).map((id) => new mongoose.Types.ObjectId(id));
    if (softwareIds.length > 0 && !isWindowsOsType(templateDetails.osType)) {
      throw new ValidationError('Software installation is only supported on Windows templates.');
    }
    if (softwareIds.length > 0) {
      await softwareService.validateIds(softwareIds);
    }

    // Validate resources
    const validation = await validateResources(dto, templateSpecs, templateDetails.node);
    if (!validation.canCreate) {
      throw new InsufficientResourcesError(
        validation.reason ?? 'Insufficient resources.',
        dto.count,
        validation.maxPossibleCount,
        'resources'
      );
    }

    // Always create a job — single or bulk, same async path
    const job = await VMJob.create({
      adminId,
      type: dto.count === 1 ? 'single_create' : 'bulk_create',
      status: 'pending',
      total: dto.count,
      completed: 0,
      failed: 0,
      pending: dto.count,
      vmIds: [],
      failedVmids: [],
      requestedSpecs: {
        templateId: dto.templateId,
        templateName: templateDetails.name,
        templateNode: templateDetails.node,
        cloneType: dto.cloneType,
        cpuCores,
        memoryGb,
        diskGb,
        templateDiskGb: templateSpecs.diskGb,
        templateCpuCores: templateSpecs.cpuCores,  // actual template value from Proxmox
        templateMemoryGb: templateSpecs.memoryGb,  // actual template value from Proxmox
        namePrefix: dto.name,
        count: dto.count,
        consoleUsername,
        passwordMode: dto.passwordMode,
        consolePassword: dto.passwordMode === 'fixed' ? dto.consolePassword : undefined,
        consoleProtocol,
        enableVirtualization,
        softwareIds,
        projectId: dto.projectId
          ? new mongoose.Types.ObjectId(dto.projectId)
          : undefined,
        networkType: dto.networkType ?? 'public',
      },
      jobErrors: [],
      startedAt: new Date(),
    });

    logger.info('VM creation job created', {
      jobId: job._id.toString(),
      adminId: adminId.toString(),
      count: dto.count,
      templateId: dto.templateId,
      templateNode: templateDetails.node,
      type: job.type,
      path: dto.count > 1 && (dto.softwareIds?.length ?? 0) > 0
        ? 'golden_image_bulk'
        : dto.count === 1 && (dto.softwareIds?.length ?? 0) > 0
          ? 'single_vm_software'
          : 'standard_bulk',
      softwareCount: dto.softwareIds?.length ?? 0,
    });

    // Trigger async — do NOT await
    // QUEUE_SLOT: replace with message queue job (RabbitMQ/BullMQ)
    processBulkCreation(job, adminId).catch((err: unknown) => {
      logger.error('Unhandled VM creation error', {
        jobId: job._id.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return { jobId: job._id.toString() };
  }

  /**
   * Delete a VM. Stops it first if running. Soft delete only.
   * - Idempotent: throws if already deleting or deleted
   * - Retries Proxmox delete with exponential backoff (see deleteRetry.ts)
   * - On Proxmox "already gone" → treats as success
   * - On all retries exhausted → sets status to delete_failed, saves error, rethrows
   * - Checks pollTask result — failure throws instead of silently continuing
   */
  async deleteVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<void> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);

    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (vm.isRestricted) {
      throw new VMOperationError('VM is restricted. Remove the restriction before performing any actions.', vm.status, vm.status);
    }

    // Idempotency guards — prevent double-deletion races
    if (vm.status === 'deleting') {
      throw new VMOperationError('VM deletion is already in progress.', vm.status, 'stopped');
    }
    if (vm.status === 'deleted') {
      throw new VMOperationError('VM is already deleted.', vm.status, 'stopped');
    }

    const previousStatus = vm.status;

    logger.info('[VMDelete] Deletion flow started', {
      vmId: vmId.toString(),
      vmid: vm.vmid,
      node: vm.node,
      dbStatus: previousStatus,
      vmName: vm.name,
    });

    // Check live Proxmox power state — source of truth for stop decision.
    // DB status may be stale (e.g. delete_failed, error) while VM is still running in Proxmox.
    let liveProxmoxStatus = 'stopped';
    try {
      const statusRes = await proxmoxClient.get<{ data: { status: string } }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/status/current`
      );
      liveProxmoxStatus = statusRes.data.data.status;
    } catch (statusErr) {
      // If we can't reach Proxmox, assume stopped and let retryProxmoxDelete handle it
      logger.warn('[VMDelete] Could not query live VM status before deletion — proceeding', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        node: vm.node,
        error: statusErr instanceof Error ? statusErr.message : String(statusErr),
      });
    }

    logger.info('[VMDelete] Live Proxmox power state', {
      vmId: vmId.toString(),
      vmid: vm.vmid,
      node: vm.node,
      liveProxmoxStatus,
    });

    // Stop VM first if Proxmox says it's running — regardless of DB status
    if (liveProxmoxStatus === 'running') {
      logger.info('[VMDelete] Stopping VM before purge delete', { vmid: vm.vmid, node: vm.node });
      try {
        const stopResponse = await proxmoxClient.post<{ data: string }>(
          `/nodes/${vm.node}/qemu/${vm.vmid}/status/stop`,
          {}
        );
        const stopPoll = await pollTask(stopResponse.data.data, vm.node);
        if (stopPoll.result === 'failed') {
          throw new VMOperationError(
            'VM failed to stop before deletion. Check Proxmox task logs.',
            vm.status,
            'stopped'
          );
        }
        if (stopPoll.result === 'unknown') {
          throw new VMOperationError(
            'VM stop outcome unknown before deletion. Try again after refreshing status.',
            vm.status,
            'stopped'
          );
        }
      } catch (stopErr) {
        // Stop failed — restore previous status so VM is not left in limbo
        vm.status = previousStatus;
        await vm.save();
        throw stopErr;
      }
    }

    // Mark as deleting — and cancel any in-progress HyperV/software jobs
    // so background provisioners abort on next poll cycle
    vm.status = 'deleting';
    await vm.save();

    await VM.findByIdAndUpdate(vmId, {
      $set: {
        hyperVCancelled: true,
        'softwareInstalls.$[el].cancelled': true,
        'softwareInstalls.$[el].status': 'failed',
        'softwareInstalls.$[el].lastError': 'VM deleted.',
      },
    }, { arrayFilters: [{ 'el.status': { $in: ['pending', 'installing'] } }] });

    // Delete from Proxmox with retry + backoff
    try {
      logger.info('[VMDelete] Invoking Proxmox purge delete (purge=1, destroy-unreferenced-disks=1)', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        node: vm.node,
      });

      const deleteResult = await retryProxmoxDelete(vm.node, vm.vmid);

      logger.info('[VMDelete] Proxmox purge delete outcome', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        node: vm.node,
        deleteResult,
      });

      if (deleteResult === 'already_gone') {
        logger.warn('[VMDelete] VM config was already missing in Proxmox — verify no orphan LVs remain', {
          vmId: vmId.toString(),
          vmid: vm.vmid,
          node: vm.node,
          expectedLvPattern: `vm-${vm.vmid}-cloudinit`,
        });
      }

    } catch (deleteErr) {
      // All retries exhausted — mark as delete_failed so user can see and retry
      vm.status = 'delete_failed';
      vm.lastError = deleteErr instanceof Error ? deleteErr.message : String(deleteErr);
      vm.deleteAttempts = (vm.deleteAttempts ?? 0) + 1;
      await vm.save();

      logger.error('[VMDelete] Proxmox purge delete failed after all retries', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        node: vm.node,
        attempts: vm.deleteAttempts,
        error: vm.lastError,
      });

      throw deleteErr;
    }

    // Soft delete — mark as deleted in MongoDB
    vm.status = 'deleted';
    vm.deletedAt = new Date();
    vm.lastError = undefined;
    await vm.save();

    // Release the public IP back to the pool
    try {
      await releaseIP(vm._id.toString());
    } catch (releaseErr) {
      logger.warn('[VMDelete] Failed to release public IP — continuing', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
      });
    }

    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'VM_DELETED',
      status: 'success',
      details: { node: vm.node },
      ipAddress: ip,
      userAgent: ua,
    });

    logger.info('[VMDelete] MongoDB soft delete complete', {
      vmId: vmId.toString(),
      vmid: vm.vmid,
      node: vm.node,
      deletedAt: vm.deletedAt,
    });
  }

  /**
   * Queue bulk VM deletion as a background job.
   * One API call — server processes deletes sequentially with Proxmox purge + UPID polling.
   */
  async bulkDeleteVMs(
    vmIds: string[],
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<{ jobId: string; restrictedSkipped: number }> {
    const authReq = req as AuthenticatedRequest;
    const uniqueIds = [...new Set(vmIds)].map((id) => new mongoose.Types.ObjectId(id));

    if (uniqueIds.length > config.VM_MAX_BULK_COUNT) {
      throw new ValidationError(
        `Cannot delete more than ${config.VM_MAX_BULK_COUNT} VMs at once.`
      );
    }

    const vms = await VM.find({ _id: { $in: uniqueIds } });
    if (vms.length !== uniqueIds.length) {
      throw new VMNotFoundError('One or more VMs were not found.');
    }

    for (const vm of vms) {
      assertOwnership(vm, adminId.toString(), authReq.user.role);
    }

    // Filter out restricted VMs — they are silently excluded from bulk operations
    const restrictedVms = vms.filter((vm) => vm.isRestricted);
    const eligibleVms = vms.filter((vm) => !vm.isRestricted);
    const restrictedSkipped = restrictedVms.length;

    if (eligibleVms.length === 0) {
      throw new ValidationError('All selected VMs are restricted. Remove restrictions before performing bulk actions.');
    }

    const eligibleIds = eligibleVms.map((vm) => vm._id);

    const job = await VMJob.create({
      adminId,
      type: 'bulk_delete',
      status: 'pending',
      total: eligibleIds.length,
      completed: 0,
      failed: 0,
      pending: eligibleIds.length,
      vmIds: [],
      targetVmIds: eligibleIds,
      failedVmids: [],
      requestedSpecs: {
        templateId: 0,
        templateName: 'bulk-delete',
        templateNode: 'n/a',
        cloneType: 'dynamic_storage',
        cpuCores: 0,
        memoryGb: 0,
        diskGb: 0,
        templateDiskGb: 0,
        templateCpuCores: 0,
        templateMemoryGb: 0,
        namePrefix: 'delete',
        count: eligibleIds.length,
        consoleUsername: 'n/a',
        passwordMode: 'fixed',
        consoleProtocol: 'rdp',
        enableVirtualization: false,
        softwareIds: [],
      },
      jobErrors: [],
      startedAt: new Date(),
    });

    logger.info('[VMDelete] Bulk delete job created', {
      jobId: job._id.toString(),
      adminId: adminId.toString(),
      count: eligibleIds.length,
      restrictedSkipped,
    });

    processBulkDeletion(job, adminId, authReq.user.role, this.deleteVM.bind(this)).catch(
      (err: unknown) => {
        logger.error('[VMDelete] Unhandled bulk delete job error', {
          jobId: job._id.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    );

    return { jobId: job._id.toString(), restrictedSkipped };
  }

  /**
   * Bulk start VMs — processes all in parallel batches server-side.
   * Returns per-VM results so the UI can show which succeeded/failed.
   */
  async bulkStartVMs(
    vmIds: string[],
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<{ succeeded: number; failed: number; restrictedSkipped: number; errors: Array<{ vmId: string; message: string }> }> {
    const authReq = req as AuthenticatedRequest;
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const uniqueIds = [...new Set(vmIds)].map((id) => new mongoose.Types.ObjectId(id));

    const vms = await VM.find({ _id: { $in: uniqueIds } });
    for (const vm of vms) {
      assertOwnership(vm, adminId.toString(), authReq.user.role);
    }

    const restrictedSkipped = vms.filter((vm) => vm.isRestricted).length;
    const eligibleVms = vms.filter((vm) => !vm.isRestricted);

    const results = await Promise.allSettled(
      eligibleVms
        .filter((vm) => vm.status !== 'running')
        .map((vm) => this.powerOnStoppedVm(vm, adminId, { ipAddress: ip, userAgent: ua }))
    );

    let succeeded = 0;
    const errors: Array<{ vmId: string; message: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === 'fulfilled') {
        succeeded++;
      } else {
        const vm = eligibleVms.filter((v) => v.status !== 'running')[i];
        errors.push({
          vmId: vm?._id.toString() ?? 'unknown',
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }

    logger.info('[VMBulkStart] Bulk start completed', {
      adminId: adminId.toString(),
      requested: uniqueIds.length,
      succeeded,
      failed: errors.length,
      restrictedSkipped,
    });

    return { succeeded, failed: errors.length, restrictedSkipped, errors };
  }

  /**
   * Bulk stop VMs — processes all in parallel batches server-side.
   * Returns per-VM results so the UI can show which succeeded/failed.
   */
  async bulkStopVMs(
    vmIds: string[],
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<{ succeeded: number; failed: number; restrictedSkipped: number; errors: Array<{ vmId: string; message: string }> }> {
    const authReq = req as AuthenticatedRequest;
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const uniqueIds = [...new Set(vmIds)].map((id) => new mongoose.Types.ObjectId(id));

    const vms = await VM.find({ _id: { $in: uniqueIds } });
    for (const vm of vms) {
      assertOwnership(vm, adminId.toString(), authReq.user.role);
    }

    const restrictedSkipped = vms.filter((vm) => vm.isRestricted).length;
    const eligibleVms = vms.filter((vm) => !vm.isRestricted);

    const results = await Promise.allSettled(
      eligibleVms
        .filter((vm) => vm.status !== 'stopped')
        .map((vm) => this.gracefulShutdownVm(vm, adminId, { ipAddress: ip, userAgent: ua }))
    );

    let succeeded = 0;
    const errors: Array<{ vmId: string; message: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === 'fulfilled') {
        succeeded++;
      } else {
        const vm = eligibleVms.filter((v) => v.status !== 'stopped')[i];
        errors.push({
          vmId: vm?._id.toString() ?? 'unknown',
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }

    logger.info('[VMBulkStop] Bulk stop completed', {
      adminId: adminId.toString(),
      requested: uniqueIds.length,
      succeeded,
      failed: errors.length,
      restrictedSkipped,
    });

    return { succeeded, failed: errors.length, restrictedSkipped, errors };
  }

  /**
   * Start a VM (graceful).
   */
  /**
   * Power on a stopped VM — resumes from hibernate when isHibernated, otherwise cold start.
   */
  private async powerOnStoppedVm(
    vm: IVM & { _id: mongoose.Types.ObjectId; save(): Promise<unknown> },
    adminId: mongoose.Types.ObjectId,
    audit: { ipAddress: string; userAgent: string }
  ): Promise<VMOperationResult> {
    const vmIdStr = vm._id.toString();

    let upid: string;
    let operation: 'resume' | 'start' = 'start';
    let proxmoxApiPath = 'status/start';

    if (vm.isHibernated) {
      operation = 'resume';
      proxmoxApiPath = 'status/resume';
      const response = await proxmoxClient.post<{ data: string }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/status/resume`,
        {}
      );
      upid = response.data.data;
    } else {
      const response = await proxmoxClient.post<{ data: string }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/status/start`,
        {}
      );
      upid = response.data.data;
      logger.info(`[BulkVM] [vmName=unknown vmid=${vm.vmid}] STEP: POST /status/start sent | data: timestamp=${new Date().toISOString()} upid=${upid}`);
    }

    let finalUpid = upid;
    let pollResult = await pollTask(upid, vm.node);

    if (pollResult.result === 'failed') {
      const proxmoxAfterFail = await probeProxmoxPowerState(vm.node, vm.vmid);
      logger.error('[VMPowerOn] Task failed — DB unchanged', {
        vmId: vmIdStr,
        vmid: vm.vmid,
        operation,
        proxmoxPowerState: 'status' in proxmoxAfterFail ? proxmoxAfterFail.status : null,
        exitstatus: pollResult.exitstatus ?? null,
      });
      throw new VMOperationError(
        `VM failed to ${operation}. Check Proxmox task logs.`,
        vm.status,
        'stopped'
      );
    }
    if (pollResult.result === 'unknown') {
      const proxmoxAfterUnknown = await probeProxmoxPowerState(vm.node, vm.vmid);
      logger.error('[VMPowerOn] Task outcome unknown — DB unchanged', {
        vmId: vmIdStr,
        vmid: vm.vmid,
        operation,
        proxmoxPowerState: 'status' in proxmoxAfterUnknown ? proxmoxAfterUnknown.status : null,
      });
      throw new VMOperationError(
        `VM ${operation} outcome unknown due to a connectivity issue. Refresh to check actual status.`,
        vm.status,
        'stopped'
      );
    }

    let resumeFollowUp = false;
    if (operation === 'resume') {
      const assessment = await assessResumeOutcome(vm.node, vm.vmid, finalUpid);

      if (assessment.needsRetry) {
        resumeFollowUp = true;
        logger.warn('[VMPowerOn] Incomplete resume — issuing follow-up resume', {
          vmId: vmIdStr,
          vmid: vm.vmid,
          reason: assessment.reason,
          firstUpid: finalUpid,
        });

        const retryResponse = await proxmoxClient.post<{ data: string }>(
          `/nodes/${vm.node}/qemu/${vm.vmid}/status/resume`,
          {}
        );
        finalUpid = retryResponse.data.data;
        pollResult = await pollTask(finalUpid, vm.node);

        if (pollResult.result !== 'success') {
          throw new VMOperationError(
            'VM resume did not complete after retry. Check Proxmox task logs.',
            vm.status,
            'stopped'
          );
        }
      }

      const guestReady = await waitForVmGuestReady(vm.node, vm.vmid);
      if (!guestReady) {
        logger.error('[VMPowerOn] Resume tasks OK but guest never became ready', {
          vmId: vmIdStr,
          vmid: vm.vmid,
          node: vm.node,
          resumeFollowUp,
          finalUpid,
        });
        throw new VMOperationError(
          'VM resume did not fully wake the guest. Try Resume again or cold-start the VM.',
          vm.status,
          'stopped'
        );
      }
    }

    const proxmoxAfterTask = await probeProxmoxPowerState(vm.node, vm.vmid);
    const proxmoxLiveRunning =
      'status' in proxmoxAfterTask && proxmoxAfterTask.status === 'running';

    if (!proxmoxLiveRunning) {
      logger.warn('[VMPowerOn] Task OK but Proxmox live status is not running', {
        vmId: vmIdStr,
        vmid: vm.vmid,
        node: vm.node,
        operation,
        proxmoxApiPath,
        upid: finalUpid,
        proxmoxPowerState: 'status' in proxmoxAfterTask ? proxmoxAfterTask.status : null,
        proxmoxProbeError: 'error' in proxmoxAfterTask ? proxmoxAfterTask.error : null,
      });
    }

    vm.status = 'running';
    vm.proxmoxStatus = 'running';
    vm.isHibernated = false;
    vm.consoleReady = operation === 'resume';
    await vm.save();

    logger.info('[VMPowerOn] Power-on complete', {
      vmId: vmIdStr,
      vmid: vm.vmid,
      operation,
      upid: finalUpid,
      resumeFollowUp,
      consoleReady: vm.consoleReady,
      triggeredBy: audit.userAgent,
    });

    if (operation === 'start') {
      const pollTrigger = `power-on:${operation}:${audit.userAgent}`;
      logger.info(`[BulkVM] [vmid=${vm.vmid}] STEP: startIpPolling begins | data: vmid=${vm.vmid} ipAddress=${vm.ipAddress ?? 'unknown'} trigger=${pollTrigger}`);
      void startIpPolling(vm, pollTrigger, { mode: 'cold-start' }).catch((err: unknown) => {
        logger.error('[VMConsolePoll] Unhandled error in IP polling', {
          vmId: vmIdStr,
          vmid: vm.vmid,
          trigger: pollTrigger,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } else {
      const pollTrigger = `power-on:${operation}:${audit.userAgent}`;
      void startIpPolling(vm, pollTrigger, { mode: 'resume' }).catch((err: unknown) => {
        logger.error('[VMConsolePoll] Unhandled error in IP polling', {
          vmId: vmIdStr,
          vmid: vm.vmid,
          trigger: pollTrigger,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: operation === 'resume' ? 'VM_RESUMED' : 'VM_STARTED',
      status: 'success',
      details: {
        node: vm.node,
        mode: operation,
        proxmoxApiPath,
        upid: finalUpid,
        resumeFollowUp,
        proxmoxLiveStatus: 'status' in proxmoxAfterTask ? proxmoxAfterTask.status : null,
        proxmoxQmpStatus: 'qmpstatus' in proxmoxAfterTask ? proxmoxAfterTask.qmpstatus : null,
        proxmoxLiveMatchesDb: proxmoxLiveRunning,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation, taskId: finalUpid };
  }

  async startVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);
    if (vm.isRestricted) {
      throw new VMOperationError('VM is restricted. Remove the restriction before performing any actions.', vm.status, vm.status);
    }
    await assertUserCanPowerVm(vm._id, authReq.user.role);

    if (vm.status === 'running') {
      throw new VMOperationError('VM is already running.', vm.status, 'stopped');
    }

    return this.powerOnStoppedVm(vm, adminId, { ipAddress: ip, userAgent: ua });
  }

  /**
   * Power on a stopped VM (no auth checks).
   * Used by tenant plan renew and other system flows.
   */
  async startVmSystem(
    vm: IVM,
    adminId: mongoose.Types.ObjectId,
    auditContext: { ipAddress: string; userAgent: string }
  ): Promise<VMOperationResult> {
    if (vm.status === 'running') {
      return { success: true, vmid: vm.vmid, node: vm.node, operation: 'start', taskId: '' };
    }
    return this.powerOnStoppedVm(vm, adminId, auditContext);
  }

  /**
   * Graceful Proxmox shutdown + DB status update (no auth checks).
   * Used by stopVM and system schedulers (plan expiry).
   */
  async gracefulShutdownVm(
    vm: IVM,
    adminId: mongoose.Types.ObjectId,
    auditContext: { ipAddress: string; userAgent: string }
  ): Promise<{ taskId: string }> {
    if (vm.status === 'stopped') {
      try {
        const statusRes = await proxmoxClient.get<{ data: { status: string } }>(
          `/nodes/${vm.node}/qemu/${vm.vmid}/status/current`
        );
        if (statusRes.data.data.status === 'stopped') {
          return { taskId: '' };
        }
        logger.warn('[VM] Status desync detected — MongoDB stopped but Proxmox running; issuing shutdown', {
          vmId: vm._id.toString(),
          vmid: vm.vmid,
          node: vm.node,
          proxmoxStatus: statusRes.data.data.status,
        });
      } catch (err) {
        logger.warn('[VM] Could not verify Proxmox status for stopped VM — skipping shutdown', {
          vmId: vm._id.toString(),
          vmid: vm.vmid,
          node: vm.node,
          error: err instanceof Error ? err.message : String(err),
        });
        return { taskId: '' };
      }
    }

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/shutdown`,
      {}
    );
    const upid = response.data.data;
    const pollResult = await pollTask(upid, vm.node);

    if (pollResult.result === 'failed') {
      throw new VMOperationError('VM failed to stop. Check Proxmox task logs.', vm.status, 'running');
    }
    if (pollResult.result === 'unknown') {
      throw new VMOperationError(
        'VM stop outcome unknown due to a connectivity issue. Refresh to check actual status.',
        vm.status,
        'running'
      );
    }

    vm.status = 'stopped';
    vm.proxmoxStatus = 'stopped';
    vm.isHibernated = false;
    await vm.save();

    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'VM_STOPPED',
      status: 'success',
      details: { node: vm.node, source: auditContext.userAgent },
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    return { taskId: upid };
  }

  /**
   * Stop a VM (graceful shutdown).
   */
  async stopVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);
    if (vm.isRestricted) {
      throw new VMOperationError('VM is restricted. Remove the restriction before performing any actions.', vm.status, vm.status);
    }
    await assertUserCanPowerVm(vm._id, authReq.user.role);

    if (vm.status === 'stopped') {
      throw new VMOperationError('VM is already stopped.', vm.status, 'running');
    }

    const { taskId } = await this.gracefulShutdownVm(vm, adminId, {
      ipAddress: ip,
      userAgent: ua,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'stop', taskId };
  }

  /**
   * Force stop a VM (hard kill — immediate).
   */
  async forceStopVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);
    if (vm.isRestricted) {
      throw new VMOperationError('VM is restricted. Remove the restriction before performing any actions.', vm.status, vm.status);
    }

    if (vm.status === 'stopped') {
      throw new VMOperationError('VM is already stopped.', vm.status, 'running');
    }

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/stop`,
      {}
    );
    const upid = response.data.data;
    const pollResult = await pollTask(upid, vm.node);

    if (pollResult.result === 'failed') {
      throw new VMOperationError('VM failed to force stop. Check Proxmox task logs.', vm.status, 'running');
    }
    if (pollResult.result === 'unknown') {
      throw new VMOperationError('VM force stop outcome unknown due to a connectivity issue. Refresh to check actual status.', vm.status, 'running');
    }

    vm.status = 'stopped';
    vm.proxmoxStatus = 'stopped';
    vm.isHibernated = false;
    await vm.save();

    await VMEvent.create({
      vmId: vm._id, vmid: vm.vmid, adminId,
      event: 'VM_FORCE_STOPPED', status: 'success',
      details: { node: vm.node }, ipAddress: ip, userAgent: ua,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'force-stop', taskId: upid };
  }

  /**
   * POST /api/v1/vms/:vmId/clone
   * Creates an async clone job and returns immediately with a jobId.
   * The background processor handles: stop source → Proxmox clone → restart source → save VM.
   */
  async cloneVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    name: string,
    req: Request,
    count: number = 1
  ): Promise<{ jobId: string }> {
    const authReq = req as AuthenticatedRequest;

    const sourceVm = await VM.findById(vmId);
    if (!sourceVm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(sourceVm, adminId.toString(), authReq.user.role);

    if (['creating', 'deleting', 'deleted', 'delete_failed'].includes(sourceVm.status)) {
      throw new VMOperationError(
        `Cannot clone a VM in '${sourceVm.status}' state.`,
        sourceVm.status,
        'stopped'
      );
    }

    // Create the job record immediately and return — background worker does the rest
    const job = await VMJob.create({
      adminId,
      type: 'vm_clone',
      status: 'pending',
      total: count,
      completed: 0,
      failed: 0,
      pending: count,
      vmIds: [],
      failedVmids: [],
      requestedSpecs: {
        templateId: sourceVm.templateId,
        templateName: sourceVm.templateName,
        templateNode: sourceVm.node,
        cloneType: 'dedicated_storage',
        cpuCores: sourceVm.allocatedCpu,
        memoryGb: sourceVm.allocatedMemoryGb,
        diskGb: sourceVm.allocatedDiskGb,
        templateDiskGb: sourceVm.allocatedDiskGb,
        templateCpuCores: sourceVm.allocatedCpu,
        templateMemoryGb: sourceVm.allocatedMemoryGb,
        namePrefix: name,
        count,
        consoleUsername: sourceVm.consoleUsername ?? '',
        passwordMode: 'fixed',
        consolePassword: sourceVm.consolePassword,
        consoleProtocol: sourceVm.consoleProtocol,
        sourceVmId: sourceVm._id,
        sourceVmName: sourceVm.name,
      },
      jobErrors: [],
      startedAt: new Date(),
    });

    logger.info('[VMClone] Clone job created', {
      jobId: job._id.toString(),
      adminId: adminId.toString(),
      sourceVmId: vmId.toString(),
      sourceVmid: sourceVm.vmid,
      name,
      count,
    });

    // Fire and forget — QUEUE_SLOT: replace with message queue (RabbitMQ/BullMQ)
    processVmClone(job, adminId).catch((err: unknown) => {
      logger.error('[VMClone] Unhandled error in clone processor', {
        jobId: job._id.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return { jobId: job._id.toString() };
  }

  /**
   * GET /api/v1/vms/clones
   * Returns all VMs that were cloned from an existing VM (isVmClone: true).
   */
  async getClonedVMs(adminId: mongoose.Types.ObjectId): Promise<mongoose.FlattenMaps<IVM>[]> {
    const vms = await VM.find({ adminId, isVmClone: true })
      .sort({ createdAt: -1 })
      .lean();
    return vms;
  }

  /**
   * Restart a VM (graceful reboot).
   */
  async restartVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);
    if (vm.isRestricted) {
      throw new VMOperationError('VM is restricted. Remove the restriction before performing any actions.', vm.status, vm.status);
    }
    await assertUserCanPowerVm(vm._id, authReq.user.role);

    if (vm.status !== 'running') {
      throw new VMOperationError('VM must be running to restart.', vm.status, 'running');
    }

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/reboot`,
      {}
    );
    const upid = response.data.data;
    const pollResult = await pollTask(upid, vm.node);

    if (pollResult.result === 'failed') {
      throw new VMOperationError('VM failed to restart. Check Proxmox task logs.', vm.status, 'running');
    }
    if (pollResult.result === 'unknown') {
      throw new VMOperationError('VM restart outcome unknown due to a connectivity issue. Refresh to check actual status.', vm.status, 'running');
    }

    vm.status = 'running';
    vm.proxmoxStatus = 'running';
    // Disable console during the reboot — the guest agent / IP go away briefly and
    // cloudbase-init re-runs. consoleReady is set back to true by startIpPolling.
    vm.consoleReady = false;
    await vm.save();

    // Fire-and-forget: re-resolve the private IP and re-flag console-ready once the
    // guest agent comes back up after the reboot.
    void startIpPolling(vm, 'restart').catch((err: unknown) => {
      logger.error('[VMConsolePoll] Unhandled error in IP polling', {
        vmId: vm._id.toString(),
        vmid: vm.vmid,
        trigger: 'restart',
        error: err instanceof Error ? err.message : String(err),
      });
    });

    await VMEvent.create({
      vmId: vm._id, vmid: vm.vmid, adminId,
      event: 'VM_RESTARTED', status: 'success',
      details: { node: vm.node }, ipAddress: ip, userAgent: ua,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'restart', taskId: upid };
  }

  /**
   * Reset a VM (hard reset — like pressing physical reset button).
   */
  async resetVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);
    if (vm.isRestricted) {
      throw new VMOperationError('VM is restricted. Remove the restriction before performing any actions.', vm.status, vm.status);
    }

    if (vm.status !== 'running') {
      throw new VMOperationError('VM must be running to reset.', vm.status, 'running');
    }

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/reset`,
      {}
    );
    const upid = response.data.data;
    const pollResult = await pollTask(upid, vm.node);

    if (pollResult.result === 'failed') {
      throw new VMOperationError('VM failed to reset. Check Proxmox task logs.', vm.status, 'running');
    }
    if (pollResult.result === 'unknown') {
      throw new VMOperationError('VM reset outcome unknown due to a connectivity issue. Refresh to check actual status.', vm.status, 'running');
    }

    vm.status = 'running';
    vm.proxmoxStatus = 'running';
    await vm.save();

    await VMEvent.create({
      vmId: vm._id, vmid: vm.vmid, adminId,
      event: 'VM_RESET', status: 'success',
      details: { node: vm.node }, ipAddress: ip, userAgent: ua,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'reset', taskId: upid };
  }

  /**
   * Hibernate a VM to disk (qm suspend --todisk 1).
   */
  private async hibernateVmToDisk(
    vm: IVM & { _id: mongoose.Types.ObjectId; save(): Promise<unknown> },
    adminId: mongoose.Types.ObjectId,
    audit: { ipAddress: string; userAgent: string }
  ): Promise<VMOperationResult> {
    const vmIdStr = vm._id.toString();

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/suspend`,
      { todisk: 1 }
    );
    const upid = response.data.data;

    const pollResult = await pollTask(upid, vm.node);

    if (pollResult.result === 'failed') {
      const proxmoxAfterFail = await probeProxmoxPowerState(vm.node, vm.vmid);
      logger.error('[VMHibernate] Task failed — DB unchanged', {
        vmId: vmIdStr,
        vmid: vm.vmid,
        node: vm.node,
        upid,
        exitstatus: pollResult.exitstatus ?? null,
        proxmoxPowerState: 'status' in proxmoxAfterFail ? proxmoxAfterFail.status : null,
        dbStatus: vm.status,
        dbIsHibernated: vm.isHibernated,
      });
      throw new VMOperationError('VM failed to hibernate. Check Proxmox task logs.', vm.status, 'running');
    }
    if (pollResult.result === 'unknown') {
      const proxmoxAfterUnknown = await probeProxmoxPowerState(vm.node, vm.vmid);
      logger.error('[VMHibernate] Task outcome unknown — DB unchanged', {
        vmId: vmIdStr,
        vmid: vm.vmid,
        node: vm.node,
        upid,
        proxmoxPowerState: 'status' in proxmoxAfterUnknown ? proxmoxAfterUnknown.status : null,
        dbStatus: vm.status,
        dbIsHibernated: vm.isHibernated,
      });
      throw new VMOperationError(
        'VM hibernate outcome unknown due to a connectivity issue. Refresh to check actual status.',
        vm.status,
        'running'
      );
    }

    const proxmoxAfterTask = await probeProxmoxPowerState(vm.node, vm.vmid);
    const proxmoxLiveStopped =
      'status' in proxmoxAfterTask &&
      (proxmoxAfterTask.status === 'stopped' || proxmoxAfterTask.status === 'paused');

    if (!proxmoxLiveStopped) {
      logger.error('[VMHibernate] Task OK but Proxmox is not stopped — DB unchanged', {
        vmId: vmIdStr,
        vmid: vm.vmid,
        node: vm.node,
        upid,
        proxmoxPowerState: 'status' in proxmoxAfterTask ? proxmoxAfterTask.status : null,
        proxmoxQmpStatus: 'qmpstatus' in proxmoxAfterTask ? proxmoxAfterTask.qmpstatus : null,
        proxmoxProbeError: 'error' in proxmoxAfterTask ? proxmoxAfterTask.error : null,
      });
      throw new VMOperationError(
        'VM hibernate task finished but the VM is not stopped in Proxmox. Check Proxmox task logs.',
        vm.status,
        'running'
      );
    }

    vm.status = 'stopped';
    vm.proxmoxStatus = 'stopped';
    vm.isHibernated = true;
    vm.consoleReady = false;
    await vm.save();

    logger.info('[VMHibernate] Hibernate complete', {
      vmId: vmIdStr,
      vmid: vm.vmid,
      upid,
      triggeredBy: audit.userAgent,
    });

    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'VM_SUSPENDED',
      status: 'success',
      details: {
        node: vm.node,
        mode: 'hibernate',
        upid,
        proxmoxLiveStatus: 'status' in proxmoxAfterTask ? proxmoxAfterTask.status : null,
        proxmoxLiveMatchesDb: proxmoxLiveStopped,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'hibernate', taskId: upid };
  }

  async hibernateVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);
    if (vm.isRestricted) {
      throw new VMOperationError('VM is restricted. Remove the restriction before performing any actions.', vm.status, vm.status);
    }

    if (vm.status !== 'running') {
      const proxmoxLive = await probeProxmoxPowerState(vm.node, vm.vmid);
      logger.warn('[VMHibernate] Manual hibernate rejected — DB status not running', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        dbStatus: vm.status,
        dbIsHibernated: vm.isHibernated,
        proxmoxPowerState: 'status' in proxmoxLive ? proxmoxLive.status : null,
        userId: adminId.toString(),
        clientIp: ip,
      });
      throw new VMOperationError('VM must be running to hibernate.', vm.status, 'running');
    }

    const proxmoxProbe = await probeProxmoxVmState(vm.node, vm.vmid);
    if (!('error' in proxmoxProbe) && isQmpPrelaunch(proxmoxProbe.qmpstatus)) {
      throw new VMOperationError(
        'VM is still waking from hibernate and cannot be hibernated yet.',
        vm.status,
        'running'
      );
    }

    return this.hibernateVmToDisk(vm, adminId, { ipAddress: ip, userAgent: ua });
  }

  /**
   * Hibernate a VM to disk (qm suspend --todisk 1). Used by automation scheduler.
   * Idempotent — skips if VM is not running.
   */
  async hibernateVmAutomation(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<VMOperationResult | null | { deferred: true }> {
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    if (vm.adminId.toString() !== adminId.toString()) {
      throw new VMOwnershipError('You do not have permission to access this VM.');
    }

    if (vm.status !== 'running') {
      const proxmoxLive = await probeProxmoxPowerState(vm.node, vm.vmid);
      logger.info('[VMHibernate] Automation hibernate skipped — VM not running', {
        vmId: vm._id.toString(),
        vmid: vm.vmid,
        dbStatus: vm.status,
        dbIsHibernated: vm.isHibernated,
        proxmoxPowerState: 'status' in proxmoxLive ? proxmoxLive.status : null,
      });
      return null;
    }

    const proxmoxProbe = await probeProxmoxVmState(vm.node, vm.vmid);
    if (!('error' in proxmoxProbe) && isQmpPrelaunch(proxmoxProbe.qmpstatus)) {
      logger.info('[VMHibernate] Automation hibernate deferred — VM in prelaunch', {
        vmId: vm._id.toString(),
        vmid: vm.vmid,
        qmpstatus: proxmoxProbe.qmpstatus,
      });
      return { deferred: true };
    }

    return this.hibernateVmToDisk(vm, adminId, {
      ipAddress: 'automation',
      userAgent: 'vm-automation-scheduler',
    });
  }

  /**
   * Resume a hibernated VM (qm resume). Falls back to start if no hibernate state.
   * Idempotent — skips if VM is already running.
   */
  async resumeVmAutomation(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<VMOperationResult | null> {
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    if (vm.adminId.toString() !== adminId.toString()) {
      throw new VMOwnershipError('You do not have permission to access this VM.');
    }

    if (vm.status === 'running') {
      return null;
    }

    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 5000;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.powerOnStoppedVm(vm, adminId, {
          ipAddress: 'automation',
          userAgent: 'vm-automation-scheduler',
        });
      } catch (err) {
        lastError = err;
        logger.warn('[Automation] Resume attempt failed', {
          vmId: vmId.toString(),
          vmid: vm.vmid,
          attempt,
          maxRetries: MAX_RETRIES,
          error: err instanceof Error ? err.message : String(err),
        });
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    logger.error('[Automation] Resume failed after all retries', {
      vmId: vmId.toString(),
      vmid: vm.vmid,
      maxRetries: MAX_RETRIES,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    throw lastError;
  }

  /**
   * Get live VM status from Proxmox + try to get IP from guest agent.
   */
  async getVMStatus(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMStatus> {
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    const statusResponse = await proxmoxClient.get<{ data: ProxmoxVMCurrentStatus }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/current`
    );
    const live = statusResponse.data.data;

    // Fire both guest agent calls in parallel — neither depends on the other.
    // Promise.allSettled ensures one failure never blocks the other.
    const [netResult, fsResult, configResult] = await Promise.allSettled([
      proxmoxClient.get<{ data: { result: ProxmoxNetworkInterface[] } }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/agent/network-get-interfaces`
      ),
      proxmoxClient.get<{ data: { result: ProxmoxFsInfo[] } }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/agent/get-fsinfo`
      ),
      proxmoxClient.get<{ data: Record<string, unknown> }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/config`
      ),
    ]);

    // Resolve IP from guest agent, fall back to stored value
    let ipAddress = vm.ipAddress;
    if (netResult.status === 'fulfilled') {
      const interfaces = netResult.value.data.data.result ?? [];
      for (const iface of interfaces) {
        if (iface.name === 'lo') continue;
        const ipv4 = iface['ip-addresses']?.find(
          (a) => a['ip-address-type'] === 'ipv4' && a['ip-address'] === vm.ipAddress
        );
        if (ipv4) {
          ipAddress = ipv4['ip-address'];
          if (ipAddress !== vm.ipAddress) {
            await VM.findByIdAndUpdate(vmId, { ipAddress });
          }
          break;
        }
      }
    }

    let cpuAllocated = vm.allocatedCpu;
    let memoryAllocatedGb = live.maxmem > 0 ? bytesToGb(live.maxmem) : vm.allocatedMemoryGb;
    let diskAllocatedGb = vm.allocatedDiskGb;

    if (configResult.status === 'fulfilled') {
      const cfg = configResult.value.data.data;
      const cores = getProxmoxAllocatedCores(cfg);
      if (cores) cpuAllocated = cores;

      const memoryMb = getProxmoxAllocatedMemoryMb(cfg);
      if (memoryMb) memoryAllocatedGb = Math.round((memoryMb / 1024) * 100) / 100;

      const provisionedBytes = sumProxmoxProvisionedDiskBytes(cfg);
      if (provisionedBytes > 0) diskAllocatedGb = bytesToGb(provisionedBytes);
    } else if (live.maxdisk > 0) {
      diskAllocatedGb = bytesToGb(live.maxdisk);
    }

    // Used: sum in-guest usage across C:, D:, and other data volumes.
    let diskUsedGb = live.disk > 0 ? bytesToGb(live.disk) : 0;
    if (fsResult.status === 'fulfilled') {
      const filesystems = fsResult.value.data.data.result ?? [];
      const usedBytes = sumGuestFilesystemUsedBytes(filesystems);
      if (usedBytes > 0) diskUsedGb = bytesToGb(usedBytes);
    }

    const syncPlan = planVmStatusDbSync(live, {
      status: vm.status,
      isHibernated: vm.isHibernated,
    });

    const statusUpdate: Record<string, unknown> = {};
    if (live.status !== vm.proxmoxStatus) {
      statusUpdate.proxmoxStatus = live.status;
    }

    if (!syncPlan.skipStatusSync) {
      if (syncPlan.status !== undefined && syncPlan.status !== vm.status) {
        statusUpdate.status = syncPlan.status;
      }
      if (syncPlan.isHibernated !== undefined && syncPlan.isHibernated !== vm.isHibernated) {
        statusUpdate.isHibernated = syncPlan.isHibernated;
      }
    } else if (syncPlan.reason) {
      logger.debug('[VMStatusSync] Skipped DB power sync', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        reason: syncPlan.reason,
        dbStatus: vm.status,
        dbIsHibernated: vm.isHibernated,
        proxmoxLiveStatus: live.status,
        proxmoxQmpStatus: live.qmpstatus ?? null,
      });
    }

    if (Object.keys(statusUpdate).length > 0) {
      const filter: Record<string, unknown> = { _id: vmId };
      if (statusUpdate.status !== undefined) {
        filter.status = vm.status;
      }

      const updated = await VM.findOneAndUpdate(filter, { $set: statusUpdate }, { new: true });

      if (!updated && statusUpdate.status !== undefined) {
        logger.debug('[VMStatusSync] Skipped — DB status changed during live probe', {
          vmId: vmId.toString(),
          vmid: vm.vmid,
          dbStatusAtRead: vm.status,
          proxmoxLiveStatus: live.status,
          plannedStatus: syncPlan.status,
        });
      } else if (updated && statusUpdate.status !== undefined) {
        logger.debug('[VMStatusSync] DB power fields updated from live probe', {
          vmId: vmId.toString(),
          vmid: vm.vmid,
          dbStatusBefore: vm.status,
          dbIsHibernatedBefore: vm.isHibernated,
          proxmoxLiveStatus: live.status,
          proxmoxQmpStatus: live.qmpstatus ?? null,
          plannedStatus: syncPlan.status,
        });
      }
    }

    return {
      vmid: vm.vmid,
      node: vm.node,
      status: live.status,
      cpu: {
        usagePercent: Math.round(live.cpu * 10000) / 100,
        allocated: cpuAllocated,
      },
      memory: {
        usedGb: bytesToGb(live.mem),
        allocatedGb: memoryAllocatedGb,
        usagePercent:
          memoryAllocatedGb > 0
            ? Math.min(100, Math.round((bytesToGb(live.mem) / memoryAllocatedGb) * 10000) / 100)
            : 0,
      },
      disk: {
        usedGb: diskUsedGb,
        allocatedGb: diskAllocatedGb,
      },
      uptime: {
        seconds: live.uptime,
        formatted: formatUptime(live.uptime),
      },
      ipAddress,
    };
  }

  /**
   * Get all VMs owned by an admin (excludes deleted).
   */
  async getMyVMs(adminId: mongoose.Types.ObjectId, filters?: VMFilters): Promise<mongoose.FlattenMaps<IVM>[]> {
    const query: Record<string, unknown> = { adminId };

    if (filters?.status) query['status'] = filters.status;
    if (filters?.cloneType) query['cloneType'] = filters.cloneType;
    if (filters?.node) query['node'] = filters.node;
    if (typeof filters?.isRestricted === 'boolean') {
      query['isRestricted'] = filters.isRestricted;
    }
    if (filters?.projectId) query['projectId'] = new mongoose.Types.ObjectId(filters.projectId);

    return VM.find(query).sort({ createdAt: -1 }).lean();
  }

  /**
   * Restrict a VM — blocks all power/delete actions until unrestricted.
   * Writes an audit event. Admin/super_admin only (assertOwnership enforced).
   */
  async restrictVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (vm.isRestricted) return; // idempotent

    vm.isRestricted = true;
    await vm.save();

    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'VM_RESTRICTED',
      status: 'success',
      details: { node: vm.node },
      ipAddress: ip,
      userAgent: ua,
    });

    logger.info('[VMRestrict] VM restricted', {
      vmId: vmId.toString(),
      vmid: vm.vmid,
      adminId: adminId.toString(),
    });
  }

  /**
   * Unrestrict a VM — lifts the restriction lock and re-enables power/delete actions.
   * Writes an audit event. Admin/super_admin only (assertOwnership enforced).
   */
  async unrestrictVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (!vm.isRestricted) return; // idempotent

    vm.isRestricted = false;
    await vm.save();

    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'VM_UNRESTRICTED',
      status: 'success',
      details: { node: vm.node },
      ipAddress: ip,
      userAgent: ua,
    });

    logger.info('[VMRestrict] VM unrestricted', {
      vmId: vmId.toString(),
      vmid: vm.vmid,
      adminId: adminId.toString(),
    });
  }

  /**
   * Get all VMs across all admins — super_admin only.
   */
  async getAllVMsAdmin(filters?: VMFilters): Promise<mongoose.FlattenMaps<IVM>[]> {
    const query: Record<string, unknown> = {};

    if (filters?.status) query['status'] = filters.status;
    if (filters?.cloneType) query['cloneType'] = filters.cloneType;
    if (filters?.node) query['node'] = filters.node;

    return VM.find(query).sort({ createdAt: -1 }).lean();
  }

  /**
   * Get full VM details: stored specs + live status + recent events.
   */
  async getVMDetails(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMDetails> {
    const authReq = req as AuthenticatedRequest;

    let vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    // Get live status (best-effort)
    let liveStatus: VMStatus | undefined;
    try {
      liveStatus = await this.getVMStatus(vmId, adminId, req);
    } catch {
      // Live status unavailable — return stored data only
    }

    // Reload after live probe — getVMStatus may have updated DB fields.
    const freshVm = await VM.findById(vmId);
    if (freshVm) vm = freshVm;

    // Get recent events
    const recentEvents = await VMEvent.find({ vmId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const isEndUser = authReq.user.role === 'user';
    const automationPower = await getAutomationPowerInfo(vm._id);

    return {
      vm: {
        id: vm._id.toString(),
        vmid: vm.vmid,
        node: vm.node,
        name: vm.name,
        description: isEndUser ? undefined : vm.description,
        status: vm.status,
        cloneType: vm.cloneType,
        allocatedCpu: vm.allocatedCpu,
        allocatedMemoryGb: vm.allocatedMemoryGb,
        allocatedDiskGb: vm.allocatedDiskGb,
        ipAddress: vm.ipAddress,
        macAddress: isEndUser ? undefined : vm.macAddress,
        consoleUsername: isEndUser ? undefined : vm.consoleUsername,
        consolePassword: isEndUser ? undefined : resolveConsolePassword(vm),
        consoleProtocol: vm.consoleProtocol ?? 'rdp',
        consoleReady: vm.consoleReady ?? false,
        haEnabled: isEndUser ? false : vm.haEnabled,
        enableVirtualization: isEndUser ? false : (vm.enableVirtualization ?? false),
        hyperVStatus: isEndUser ? 'disabled' : (vm.hyperVStatus ?? 'disabled'),
        hyperVLastError: isEndUser ? undefined : vm.hyperVLastError || undefined,
        softwareInstalls: isEndUser
          ? []
          : (vm.softwareInstalls ?? []).map((s) => ({
              softwareId: s.softwareId.toString(),
              name: s.name,
              status: s.status,
              lastError: s.lastError,
              installedAt: s.installedAt,
            })),
        automationManaged: automationPower.automationManaged,
        automationSchedule: automationPower.automationSchedule,
        canResume: vm.isHibernated && vm.status === 'stopped',
        isRestricted: vm.isRestricted ?? false,
        createdAt: vm.createdAt,
        updatedAt: vm.updatedAt,
      },
      liveStatus,
      recentEvents: isEndUser
        ? []
        : recentEvents.map((e) => ({
        event: e.event,
        status: e.status,
        createdAt: e.createdAt,
        details: e.details,
      })),
    };
  }

  // ─── Virtualization (Hyper-V) ───────────────────────────────────────────────

  /**
   * Get the current virtualization (Hyper-V) status of a VM.
   */
  async getVirtualizationStatus(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VirtualizationStatus> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    return {
      enableVirtualization: vm.enableVirtualization ?? false,
      hyperVStatus: vm.hyperVStatus ?? 'disabled',
      hyperVLastError: vm.hyperVLastError || undefined,
    };
  }

  /**
   * Enable Hyper-V on a VM. Starts the work in the background (it boots the VM,
   * runs PowerShell and reboots — minutes) and returns immediately with
   * 'enabling'. The frontend polls the status until enabled/failed.
   */
  async enableVirtualization(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VirtualizationStatus> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (isHyperVInProgress(vm.hyperVStatus)) {
      throw new VMOperationError('Virtualization change is already in progress.', vm.status, vm.status);
    }

    // Confirm the underlying template/guest is Windows.
    let osType: string | undefined;
    try {
      const cfg = await proxmoxClient.get<{ data: { ostype?: string } }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/config`
      );
      osType = cfg.data.data.ostype;
    } catch (err) {
      // Best-effort — log and fall through; provisioner will fail clearly if not Windows.
      logger.warn('Could not read VM ostype for virtualization pre-check', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        node: vm.node,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (osType && !isWindowsOsType(osType)) {
      throw new ValidationError('Virtualization can only be enabled on Windows VMs.');
    }

    await updateHyperVStatus(vmId, 'enabling', {
      lastError: '',
      resetAttempts: true,
      enableVirtualization: true,
    });

    // Reset cancellation flag so a previously cancelled op doesn't block this new one
    await VM.findByIdAndUpdate(vmId, { $set: { hyperVCancelled: false } });

    scheduleHyperVEnable(
      {
        vmObjectId: vm._id,
        node: vm.node,
        vmid: vm.vmid,
        adminId,
        vmName: vm.name,
      },
      true
    );

    return { enableVirtualization: true, hyperVStatus: 'enabling' };
  }

  /**
   * Disable Hyper-V on a VM. Background work, same pattern as enable.
   */
  async disableVirtualization(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VirtualizationStatus> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (isHyperVInProgress(vm.hyperVStatus)) {
      throw new VMOperationError('Virtualization change is already in progress.', vm.status, vm.status);
    }

    // Do NOT set enableVirtualization: false here. The flag reflects actual state,
    // not intent. If the background job fails, Hyper-V is still enabled inside the VM
    // and the flag must stay true. The provisioner sets it false only on confirmed success.
    await updateHyperVStatus(vmId, 'disabling', {
      lastError: '',
      resetAttempts: true,
    });

    // Reset cancellation flag so a previously cancelled op doesn't block this new one
    await VM.findByIdAndUpdate(vmId, { $set: { hyperVCancelled: false } });

    scheduleHyperVDisable({
      vmObjectId: vm._id,
      node: vm.node,
      vmid: vm.vmid,
      adminId,
      vmName: vm.name,
    }, true);

    return { enableVirtualization: vm.enableVirtualization ?? false, hyperVStatus: 'disabling' };
  }

  /**
   * Cancel an in-progress HyperV operation.
   * Sets the cancellation flag — the provisioner detects it on next poll and aborts.
   */
  async cancelVirtualization(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VirtualizationStatus> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (!isHyperVInProgress(vm.hyperVStatus)) {
      throw new VMOperationError('No virtualization operation is in progress.', vm.status, vm.status);
    }

    await VM.findByIdAndUpdate(vmId, {
      $set: {
        hyperVCancelled: true,
        hyperVLastError: 'Cancelled by admin.',
        hyperVStatus: 'failed',
        hyperVStatusChangedAt: new Date(),
      },
    });

    logger.info('HyperV operation cancelled', { vmId: vmId.toString(), vmid: vm.vmid });
    return { enableVirtualization: vm.enableVirtualization ?? false, hyperVStatus: 'failed', hyperVLastError: 'Cancelled by admin.' };
  }

  /**
   * Cancel all pending/installing software installs on a VM.
   */
  async cancelSoftwareInstalls(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    await VM.updateOne(
      { _id: vmId },
      {
        $set: {
          'softwareInstalls.$[el].cancelled': true,
          'softwareInstalls.$[el].status': 'failed',
          'softwareInstalls.$[el].lastError': 'Cancelled by admin.',
        },
      },
      { arrayFilters: [{ 'el.status': { $in: ['pending', 'installing'] } }] }
    );

    logger.info('Software installs cancelled', { vmId: vmId.toString(), vmid: vm.vmid });
  }

  /**
   * List all jobs for an admin. Super admin sees all jobs.
   */
  async listJobs(
    adminId: mongoose.Types.ObjectId,
    req: Request,
    limit = 20
  ): Promise<IVMJob[]> {
    const authReq = req as AuthenticatedRequest;
    const query =
      authReq.user.role === 'super_admin'
        ? {}
        : { adminId };
    return VMJob.find(query).sort({ createdAt: -1 }).limit(limit).lean() as unknown as IVMJob[];
  }

  /**
   * Get bulk job status. Ownership check enforced.
   */
  async getJobStatus(
    jobId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<{ job: IVMJob; vms: JobVMCredential[] }> {
    const authReq = req as AuthenticatedRequest;

    const job = await VMJob.findById(jobId);
    if (!job) throw new VMNotFoundError(`Job ${jobId.toString()} not found.`);

    if (authReq.user.role !== 'super_admin' && job.adminId.toString() !== adminId.toString()) {
      throw new VMOwnershipError('You do not have permission to access this job.');
    }

    // Include the created VMs' console credentials so the job page can show them
    // once after creation (per-VM passwords in dynamic mode live on each VM doc).
    const vmDocs = job.vmIds.length
      ? await VM.find({ _id: { $in: job.vmIds } })
          .select('name status ipAddress consoleUsername consolePassword consoleProtocol networkType')
          .lean()
      : [];

    const vms: JobVMCredential[] = vmDocs.map((v) => ({
      id: v._id.toString(),
      name: v.name,
      status: v.status,
      ipAddress: v.ipAddress,
      consoleUsername: v.consoleUsername,
      consolePassword: resolveConsolePassword(v),
      consoleProtocol: v.consoleProtocol ?? 'rdp',
    }));

    return { job, vms };
  }

  /**
   * PATCH /api/v1/vms/jobs/:jobId/cancel
   * Soft-cancel a running bulk job. Sets status to 'cancelling' so the background
   * processor stops queuing new batches after the current one finishes.
   * Only applicable to: bulk_create, bulk_delete, vm_clone.
   */
  async cancelJob(
    jobId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<{ jobId: string; status: string }> {
    const authReq = req as AuthenticatedRequest;

    const job = await VMJob.findById(jobId);
    if (!job) throw new VMNotFoundError(`Job ${jobId.toString()} not found.`);

    if (authReq.user.role !== 'super_admin' && job.adminId.toString() !== adminId.toString()) {
      throw new VMOwnershipError('You do not have permission to cancel this job.');
    }

    const cancellableTypes: IVMJob['type'][] = ['bulk_create', 'bulk_delete', 'vm_clone'];
    if (!cancellableTypes.includes(job.type)) {
      throw new ValidationError(`Job type '${job.type}' does not support cancellation.`);
    }

    const cancellableStatuses: IVMJob['status'][] = ['pending', 'processing'];
    if (!cancellableStatuses.includes(job.status)) {
      throw new ValidationError(
        `Cannot cancel a job with status '${job.status}'. Only pending or processing jobs can be cancelled.`
      );
    }

    await VMJob.findByIdAndUpdate(jobId, {
      status: 'cancelling',
      cancelledAt: new Date(),
    });

    logger.info('[JobCancel] Job cancel requested', {
      jobId: jobId.toString(),
      adminId: adminId.toString(),
      jobType: job.type,
      previousStatus: job.status,
    });

    return { jobId: jobId.toString(), status: 'cancelling' };
  }

  /**
   * Get audit trail for a specific VM. Last 50 events.
   */
  async getVMEvents(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<mongoose.FlattenMaps<IVMEvent>[]> {
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    return VMEvent.find({ vmId }).sort({ createdAt: -1 }).limit(50).lean();
  }

  // ─── VM Assignment ──────────────────────────────────────────────────────────

  /**
   * Clear assignedTo on VMs pointing at deleted users (orphaned assignments).
   */
  private async releaseOrphanedVmAssignments(adminId: mongoose.Types.ObjectId): Promise<number> {
    const assignedVms = await VM.find({ adminId, assignedTo: { $ne: null } })
      .select('assignedTo')
      .lean();

    if (assignedVms.length === 0) return 0;

    const userIds = [...new Set(assignedVms.map((vm) => vm.assignedTo!.toString()))];
    const existingUsers = await User.find({ _id: { $in: userIds } }).select('_id').lean();
    const existingSet = new Set(existingUsers.map((u) => u._id.toString()));
    const orphanedIds = userIds
      .filter((id) => !existingSet.has(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (orphanedIds.length === 0) return 0;

    const result = await VM.updateMany(
      { adminId, assignedTo: { $in: orphanedIds } },
      { $unset: { assignedTo: 1 } }
    );

    if (result.modifiedCount > 0) {
      logger.info('Released orphaned VM assignments', {
        adminId: adminId.toString(),
        vmsReleased: result.modifiedCount,
        orphanedUserIds: orphanedIds.map((id) => id.toString()),
      });
    }

    return result.modifiedCount;
  }

  /**
   * Get assigned VM counts for all users managed by this admin — single aggregation query.
   * Returns a map of userId → count.
   */
  async getAssignedVMCounts(adminId: mongoose.Types.ObjectId): Promise<Record<string, number>> {
    await this.releaseOrphanedVmAssignments(adminId);

    const results = await VM.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { adminId, assignedTo: { $ne: null } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]);

    const map: Record<string, number> = {};
    for (const r of results) {
      map[r._id.toString()] = r.count;
    }
    return map;
  }

  /**
   * Get all VMs owned by this admin that are not yet assigned to any user.
   */
  async getAvailableVMs(adminId: mongoose.Types.ObjectId): Promise<mongoose.FlattenMaps<IVM>[]> {
    await this.releaseOrphanedVmAssignments(adminId);

    return VM.find({
      adminId,
      assignedTo: null,
      status: { $nin: ['deleted', 'deleting', 'delete_failed', 'creating'] },
    }).lean();
  }

  /**
   * Get all VMs assigned to a specific user, scoped to this admin's VMs.
   * Admin can only see assignments for users they created.
   */
  async getAssignedVMsForUser(
    targetUserId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<mongoose.FlattenMaps<IVM>[]> {
    // Verify the target user belongs to this admin
    const user = await User.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');
    if (!user.createdBy || user.createdBy.toString() !== adminId.toString()) {
      throw new ForbiddenError('You can only manage users you created.');
    }

    return VM.find({ adminId, assignedTo: targetUserId }).lean();
  }

  /**
   * Assign multiple VMs to a user.
   * - All VMs must be owned by this admin
   * - All VMs must be currently unassigned
   * - Target user must be created by this admin
   */
  async assignVMs(
    vmIds: mongoose.Types.ObjectId[],
    targetUserId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    accessSchedule?: AccessScheduleInput
  ): Promise<{ assigned: number }> {
    if (vmIds.length === 0) throw new ValidationError('No VMs specified.');
    if (vmIds.length > 50) throw new ValidationError('Cannot assign more than 50 VMs at once.');

    // Verify target user belongs to this admin
    const user = await User.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');
    if (!user.createdBy || user.createdBy.toString() !== adminId.toString()) {
      throw new ForbiddenError('You can only assign VMs to users you created.');
    }

    // Fetch all requested VMs in one query
    const vms = await VM.find({ _id: { $in: vmIds }, adminId });

    if (vms.length !== vmIds.length) {
      throw new ForbiddenError('One or more VMs not found or do not belong to you.');
    }

    // Check none are already assigned
    const alreadyAssigned = vms.filter((vm) => vm.assignedTo != null);
    if (alreadyAssigned.length > 0) {
      const names = alreadyAssigned.map((v) => v.name).join(', ');
      throw new ValidationError(`The following VMs are already assigned: ${names}`);
    }

    const schedulePatch = parseAccessScheduleInput(accessSchedule);
    await VM.updateMany(
      { _id: { $in: vmIds }, adminId, assignedTo: null },
      { $set: { assignedTo: targetUserId, ...schedulePatch } }
    );

    if (Object.keys(schedulePatch).length > 0) {
      const updated = await VM.find({ _id: { $in: vmIds } });
      for (const vm of updated) {
        cancelSchedule(vm._id.toString());
        if (vm.accessEndTime && !(Array.isArray(vm.weeklySchedule) && vm.weeklySchedule.length > 0)) {
          scheduleDisconnect(vm);
        }
      }
    }

    logger.info('VMs assigned to user', {
      adminId: adminId.toString(),
      targetUserId: targetUserId.toString(),
      vmIds: vmIds.map((id) => id.toString()),
      hasAccessSchedule: Object.keys(schedulePatch).length > 0,
    });

    return { assigned: vmIds.length };
  }

  /**
   * Bulk 1:1 assign — each VM to a distinct user (create new users or use existing).
   */
  async bulkAssignOneToOne(
    dto: BulkAssignPairsDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<BulkAssignPairsResult> {
    const vmObjectIds = dto.vmIds.map((id) => new mongoose.Types.ObjectId(id));
    const pairs: BulkAssignPairRow[] = [];

    const vms = await VM.find({
      _id: { $in: vmObjectIds },
      adminId,
      assignedTo: null,
      status: { $nin: ['deleted', 'deleting', 'delete_failed', 'creating'] },
    }).lean();

    const vmById = new Map(vms.map((vm) => [vm._id.toString(), vm]));
    const orderedVms = dto.vmIds.map((id) => vmById.get(id));

    if (orderedVms.some((vm) => !vm)) {
      throw new ValidationError('One or more VMs are not available for assignment.');
    }

    type UserSlot = { userId?: mongoose.Types.ObjectId; email: string; password?: string };

    const userSlots: UserSlot[] = [];

    if (dto.mode === 'create') {
      const bulkResult = await managedUsersService.createBulk(
        {
          emailPrefix: dto.emailPrefix!,
          count: dto.vmIds.length,
          password: dto.passwordMode === 'shared' ? dto.sharedPassword : undefined,
        },
        adminId
      );

      for (const row of bulkResult.users) {
        if (row.status !== 'created') {
          userSlots.push({ email: row.email, password: row.password });
          continue;
        }
        const user = await User.findOne({ email: row.email, createdBy: adminId }).select('_id email');
        userSlots.push({
          userId: user?._id,
          email: row.email,
          password: row.password,
        });
      }
    } else {
      const userObjectIds = dto.userIds!.map((id) => new mongoose.Types.ObjectId(id));
      const users = await User.find({ _id: { $in: userObjectIds }, createdBy: adminId, role: 'user' }).lean();
      const userById = new Map(users.map((u) => [u._id.toString(), u]));

      for (const userId of dto.userIds!) {
        const user = userById.get(userId);
        if (!user) {
          throw new ValidationError('One or more users not found or do not belong to you.');
        }
        userSlots.push({ userId: user._id, email: user.email });
      }
    }

    let assigned = 0;
    let failed = 0;

    for (let i = 0; i < dto.vmIds.length; i++) {
      const vm = orderedVms[i]!;
      const slot = userSlots[i]!;

      if (!slot.userId) {
        pairs.push({
          vmId: vm._id.toString(),
          vmName: vm.name,
          userEmail: slot.email,
          password: slot.password,
          status: 'failed',
          error: 'User creation failed',
        });
        failed++;
        continue;
      }

      const schedulePatch = parseAccessScheduleInput(dto.accessSchedule);
      const update = await VM.updateOne(
        { _id: vm._id, adminId, assignedTo: null },
        { $set: { assignedTo: slot.userId, ...schedulePatch } }
      );

      if (update.modifiedCount === 0) {
        pairs.push({
          vmId: vm._id.toString(),
          vmName: vm.name,
          userId: slot.userId.toString(),
          userEmail: slot.email,
          password: slot.password,
          status: 'failed',
          error: 'VM is no longer available for assignment',
        });
        failed++;
        continue;
      }

      if (Object.keys(schedulePatch).length > 0) {
        const fresh = await VM.findById(vm._id);
        if (fresh) {
          cancelSchedule(fresh._id.toString());
          if (
            fresh.accessEndTime &&
            !(Array.isArray(fresh.weeklySchedule) && fresh.weeklySchedule.length > 0)
          ) {
            scheduleDisconnect(fresh);
          }
        }
      }

      pairs.push({
        vmId: vm._id.toString(),
        vmName: vm.name,
        userId: slot.userId.toString(),
        userEmail: slot.email,
        password: slot.password,
        status: 'assigned',
      });
      assigned++;
    }

    logger.info('Bulk 1:1 VM assignment complete', {
      adminId: adminId.toString(),
      mode: dto.mode,
      assigned,
      failed,
      total: dto.vmIds.length,
    });

    return { assigned, failed, pairs };
  }

  /**
   * Unassign a VM from its current user.
   * Admin must own the VM.
   */
  async unassignVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError();
    if (vm.adminId.toString() !== adminId.toString()) throw new VMOwnershipError();
    if (!vm.assignedTo) throw new ValidationError('VM is not currently assigned.');

    cancelSchedule(vm._id.toString());
    vm.assignedTo = undefined;
    await vm.save();

    logger.info('VM unassigned', {
      adminId: adminId.toString(),
      vmId: vmId.toString(),
    });
  }

  /**
   * PATCH schedule fields on a VM (admin / super_admin).
   * Empty weeklySchedule array clears weekly mode (stores null).
   */
  async updateVmSchedule(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    role: string,
    body: AccessScheduleInput,
    req: Request
  ): Promise<ReturnType<typeof accessSchedulePublicView>> {
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError();
    assertOwnership(vm, adminId.toString(), role);

    const patch = parseAccessScheduleInput(body);
    Object.assign(vm, patch);
    await vm.save();

    cancelSchedule(vm._id.toString());
    const weeklyActive = Array.isArray(vm.weeklySchedule) && vm.weeklySchedule.length > 0;
    if (vm.accessEndTime && !weeklyActive) {
      scheduleDisconnect(vm);
    }

    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'RESOURCE_SCHEDULE_UPDATED',
      status: 'success',
      details: { action: 'resource.schedule_updated', ...accessSchedulePublicView(vm) },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });

    logger.info('[accessSchedule] resource.schedule_updated', {
      vmId: vm._id.toString(),
      adminId: adminId.toString(),
    });

    return accessSchedulePublicView(vm);
  }

  /**
   * Grant or revoke access override (super_admin only at route layer).
   */
  async updateVmOverride(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    body: { accessOverride: boolean; accessOverrideUntil?: string | null },
    req: Request
  ): Promise<ReturnType<typeof accessSchedulePublicView>> {
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError();

    if (body.accessOverride) {
      vm.accessOverride = true;
      vm.accessOverrideUntil = body.accessOverrideUntil
        ? new Date(body.accessOverrideUntil)
        : null;
      cancelSchedule(vm._id.toString());
      if (vm.assignedTo) {
        unblockUserSession(vm.assignedTo.toString());
      }
    } else {
      vm.accessOverride = false;
      vm.accessOverrideUntil = null;
      const check = checkAccessWindow(vm);
      if (!check.allowed && vm.assignedTo) {
        await expirePortalSessions(vm.assignedTo.toString());
        blockUserSession(vm.assignedTo.toString());
      } else if (vm.accessEndTime && !(Array.isArray(vm.weeklySchedule) && vm.weeklySchedule.length)) {
        scheduleDisconnect(vm);
      }
    }

    await vm.save();

    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'RESOURCE_OVERRIDE_UPDATED',
      status: 'success',
      details: {
        action: 'resource.override_updated',
        accessOverride: vm.accessOverride,
        accessOverrideUntil: vm.accessOverrideUntil,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });

    logger.info('[accessSchedule] resource.override_updated', {
      vmId: vm._id.toString(),
      accessOverride: vm.accessOverride,
    });

    return accessSchedulePublicView(vm);
  }

  /**
   * Grant/revoke override on many VMs in one click (super_admin).
   */
  async bulkUpdateVmOverride(
    vmIds: mongoose.Types.ObjectId[],
    adminId: mongoose.Types.ObjectId,
    body: { accessOverride: boolean; accessOverrideUntil?: string | null },
    req: Request
  ): Promise<{ updated: number; results: Array<{ vmId: string; ok: boolean; error?: string }> }> {
    const results: Array<{ vmId: string; ok: boolean; error?: string }> = [];
    let updated = 0;

    for (const vmId of vmIds) {
      try {
        await this.updateVmOverride(vmId, adminId, body, req);
        results.push({ vmId: vmId.toString(), ok: true });
        updated += 1;
      } catch (err) {
        results.push({
          vmId: vmId.toString(),
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { updated, results };
  }

  /**
   * Get all VMs assigned to the calling user (for user dashboard).
   */
  async getMyAssignedVMs(
    userId: mongoose.Types.ObjectId
  ): Promise<Array<mongoose.FlattenMaps<IVM> & AutomationPowerInfo>> {
    const vms = await VM.find({ assignedTo: userId }).lean();
    const powerMap = await getAutomationPowerInfoBatch(vms.map((v) => v._id));

    return vms.map((vm) => ({
      ...vm,
      ...(powerMap.get(vm._id.toString()) ?? { automationManaged: false }),
    }));
  }

  /**
   * Open a browser-based console session for a VM via Guacamole.
   *
   * Looks up the VM, verifies ownership, resolves connection params, then asks
   * guacamoleClient to upsert a Guacamole connection and mint a browser URL.
   *
   * NOTE (Phase 4 scaffolding):
   * The VM model does not yet store private IP / RDP / SSH credentials.
   * For initial testing we fall back to TEST_VM_IP / TEST_VM_USERNAME /
   * TEST_VM_PASSWORD from env. Once vm.privateIp + encrypted credential
   * fields land, this resolver should pull from the VM document.
   */
  async openConsole(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request,
    protocolOverride?: GuacamoleProtocol,
    dimensions?: { width?: number; height?: number }
  ): Promise<{ protocol: GuacamoleProtocol; clientUrl: string; connectionId: string }> {
    try {
      return await this.openConsoleInternal(vmId, adminId, req, protocolOverride, dimensions);
    } catch (err) {
      logger.error('openConsole failed', {
        vmId: vmId.toString(),
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
  }

  private async openConsoleInternal(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request,
    protocolOverride?: GuacamoleProtocol,
    dimensions?: { width?: number; height?: number }
  ): Promise<{ protocol: GuacamoleProtocol; clientUrl: string; connectionId: string }> {
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (authReq.user.role === 'user') {
      const access = await assertVmAccessibleForUser(vm, authReq.user.userId, 'user');
      if (!access.allowed) {
        throw new AccessWindowDeniedError(
          access.error || 'Access denied: outside scheduled window.',
          access.nextWindow ?? null
        );
      }
    }

    // Server-side state check — frontend already disables the button when
    // not running, but the API must enforce this too.
    if (vm.status !== 'running') {
      const proxmoxLive = await probeProxmoxPowerState(vm.node, vm.vmid);
      logger.warn('[VMConsole] Console blocked — DB status not running', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        dbStatus: vm.status,
        dbIsHibernated: vm.isHibernated,
        dbConsoleReady: vm.consoleReady,
        dbIpAddress: vm.ipAddress ?? null,
        proxmoxPowerState: 'status' in proxmoxLive ? proxmoxLive.status : null,
        userId: authReq.user.userId,
      });
      throw new VMOperationError(
        'VM must be running to open a console session.',
        vm.status,
        'running'
      );
    }

    if (!vm.consoleReady) {
      const proxmoxLive = await probeProxmoxPowerState(vm.node, vm.vmid);
      logger.warn('[VMConsole] Console blocked — consoleReady is false', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        dbStatus: vm.status,
        dbIsHibernated: vm.isHibernated,
        dbConsoleReady: vm.consoleReady,
        dbIpAddress: vm.ipAddress ?? null,
        proxmoxPowerState: 'status' in proxmoxLive ? proxmoxLive.status : null,
        userId: authReq.user.userId,
      });
      throw new ValidationError(
        'VM console is not ready yet. Please wait 1-2 minutes after starting the VM and try again.'
      );
    }

    // Resolve connection params from the VM document, falling back to the
    // TEST_VM_* env scaffolding only when a field is empty (eases transition for
    // the legacy test VM). Query override still wins for protocol.
    const hostname = vm.ipAddress ?? process.env['TEST_VM_IP'];
    const username = vm.consoleUsername ?? process.env['TEST_VM_USERNAME'];
    const password = resolveConsolePassword(vm) ?? process.env['TEST_VM_PASSWORD'];
    const protocol: GuacamoleProtocol = protocolOverride ?? vm.consoleProtocol ?? 'rdp';

    if (!hostname) {
      throw new ValidationError(
        'VM IP address is not available yet. The VM may still be booting. Please wait 30-60 seconds and try again.'
      );
    }

    if (!username || !password) {
      throw new ValidationError('VM console credentials are not available.');
    }

    const port = protocol === 'rdp' ? 3389 : protocol === 'ssh' ? 22 : 5900;

    logger.info('[VMConsole] Opening Guacamole session', {
      userId: authReq.user.userId,
      vmId: vmId.toString(),
      vmName: vm.name,
      protocol,
      hostname,
      dbConsoleReady: vm.consoleReady,
      dbIpAddress: vm.ipAddress ?? null,
    });

    const session = await guacamoleClient.openConsole(
      `vm-${vmId.toString()}`,
      protocol,
      {
        hostname,
        port,
        username,
        password,
        ignoreCert: true,
        securityMode: 'any',
        width: dimensions?.width,
        height: dimensions?.height,
      }
    );

    // Audit trail — written *after* the session is successfully minted.
    // Same pattern as VM_STARTED / VM_STOPPED in the power-op handlers.
    // NEVER persist VM credentials, Guacamole tokens, or the clientUrl here.
    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'VM_CONSOLE_OPENED',
      status: 'success',
      details: {
        protocol: session.protocol,
        connectionId: session.connectionId,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return {
      protocol: session.protocol,
      clientUrl: session.clientUrl,
      connectionId: session.connectionId,
    };
  }
}

export const vmService = new VMService();
