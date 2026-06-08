import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { ProxmoxConnectionError } from '../../../utils/errors';

const DISK_KEY_PATTERN = /^(scsi|ide|sata|virtio|efidisk|unused)\d+$/i;

export type BulkClonePath =
  | 'standard_bulk'
  | 'golden_seed'
  | 'golden_delivery';

export interface SourceVmDiagnostics {
  vmid: number;
  node: string;
  name?: string;
  template?: number;
  powerState?: string;
  disks: Record<string, string>;
  bios?: string;
  machine?: string;
  efidisk0?: string;
  scsi0?: string;
}

/** Pull disk-related keys from a Proxmox VM config object. */
export function extractDiskConfig(config: Record<string, unknown>): Record<string, string> {
  const disks: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && DISK_KEY_PATTERN.test(key)) {
      disks[key] = value;
    }
  }
  return disks;
}

/** Parse storage pool from a Proxmox disk string, e.g. "nvme-pool-2:vm-109-disk-0,size=32G". */
export function parseDiskStorage(diskValue: string | undefined): string | undefined {
  if (!diskValue) return undefined;
  const colonIdx = diskValue.indexOf(':');
  if (colonIdx <= 0) return undefined;
  return diskValue.slice(0, colonIdx);
}

/** Fetch source VM/template config and power state for clone diagnostics. */
export async function fetchSourceVmDiagnostics(
  node: string,
  vmid: number
): Promise<SourceVmDiagnostics> {
  const configResponse = await proxmoxClient.get<{ data: Record<string, unknown> }>(
    `/nodes/${node}/qemu/${vmid}/config`
  );
  const cfg = configResponse.data.data;
  const disks = extractDiskConfig(cfg);

  let powerState: string | undefined;
  try {
    const statusResponse = await proxmoxClient.get<{ data: { status: string } }>(
      `/nodes/${node}/qemu/${vmid}/status/current`
    );
    powerState = statusResponse.data.data.status;
  } catch {
    powerState = 'unknown';
  }

  return {
    vmid,
    node,
    name: typeof cfg.name === 'string' ? cfg.name : undefined,
    template: typeof cfg.template === 'number' ? cfg.template : undefined,
    powerState,
    disks,
    bios: typeof cfg.bios === 'string' ? cfg.bios : undefined,
    machine: typeof cfg.machine === 'string' ? cfg.machine : undefined,
    efidisk0: typeof cfg.efidisk0 === 'string' ? cfg.efidisk0 : undefined,
    scsi0: typeof cfg.scsi0 === 'string' ? cfg.scsi0 : undefined,
  };
}

/** Summarize disk placement for log comparison between base template and golden template. */
export function summarizeDiskPlacement(diag: SourceVmDiagnostics): Record<string, string | undefined> {
  const summary: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(diag.disks)) {
    summary[key] = parseDiskStorage(value);
  }
  return summary;
}

export function bulkCloneDiagLog(
  message: string,
  meta: Record<string, unknown> = {}
): void {
  logger.info(`[BulkClone][Diag] ${message}`, meta);
}

/** Resolve the best error message for logs — Proxmox detail is in internalMessage. */
export function resolveCloneErrorMessage(error: unknown): string {
  if (error instanceof ProxmoxConnectionError) {
    return error.internalMessage || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
