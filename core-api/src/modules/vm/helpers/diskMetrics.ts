import { extractDiskConfig } from './cloneDiagnostics';
import type { ProxmoxFsInfo } from '../vm.types';

/** Skip EFI / cloud-init sized entries when summing provisioned data disks. */
const MIN_DATA_DISK_BYTES = 100 * 1024 * 1024;

const EXCLUDED_FS_TYPES = new Set([
  'cdrom',
  'iso9660',
  'udf',
  'squashfs',
  'tmpfs',
  'devtmpfs',
  'proc',
  'sysfs',
  'devpts',
  'cgroup',
  'cgroup2',
  'overlay',
  'autofs',
  'tracefs',
  'debugfs',
  'securityfs',
  'pstore',
  'bpf',
  'mqueue',
  'hugetlbfs',
  'configfs',
  'fusectl',
]);

/** Parse `size=100G` / `size=32M` from a Proxmox disk config string. */
export function parseProxmoxDiskSizeBytes(diskValue: string): number {
  const sizeMatch = /size=(\d+)([GTMK])?/i.exec(diskValue);
  if (!sizeMatch?.[1]) return 0;
  const n = parseInt(sizeMatch[1], 10);
  const unit = (sizeMatch[2] ?? 'G').toUpperCase();
  const multipliers: Record<string, number> = {
    T: 1024 ** 4,
    G: 1024 ** 3,
    M: 1024 ** 2,
    K: 1024,
  };
  return n * (multipliers[unit] ?? 1024 ** 3);
}

/** Sum all provisioned data virtual disks from Proxmox VM config (scsi0, virtio1, …). */
export function sumProxmoxProvisionedDiskBytes(config: Record<string, unknown>): number {
  const disks = extractDiskConfig(config);
  let total = 0;
  for (const [key, value] of Object.entries(disks)) {
    if (/^efidisk/i.test(key) || /^unused/i.test(key)) continue;
    const bytes = parseProxmoxDiskSizeBytes(value);
    if (bytes >= MIN_DATA_DISK_BYTES) total += bytes;
  }
  return total;
}

function isDataFilesystem(fs: ProxmoxFsInfo): boolean {
  const type = (fs.type ?? '').toLowerCase();
  if (EXCLUDED_FS_TYPES.has(type)) return false;
  if ((fs['total-bytes'] ?? 0) < MIN_DATA_DISK_BYTES) return false;
  const label = `${fs.mountpoint ?? ''} ${fs.name ?? ''}`.toLowerCase();
  if (label.includes('cdrom') || label.includes('dvd')) return false;
  return true;
}

/** Sum used bytes across all in-guest data volumes (C:, D:, /, /data, …). */
export function sumGuestFilesystemUsedBytes(filesystems: ProxmoxFsInfo[]): number {
  return filesystems
    .filter(isDataFilesystem)
    .reduce((sum, fs) => sum + Math.max(0, fs['used-bytes'] ?? 0), 0);
}
