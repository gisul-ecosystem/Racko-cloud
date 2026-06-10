import type mongoose from 'mongoose';

// ─── Proxmox raw types ────────────────────────────────────────────────────────

export interface ProxmoxTemplate {
  vmid: number;
  name: string;
  node: string;
  cpu: number;       // allocated cores (from Proxmox `cpus`)
  memory: number;    // allocated RAM bytes (from Proxmox `maxmem`)
  disk: number;      // used disk bytes
  maxdisk: number;   // allocated disk bytes
  status: string;
  template: number;  // 1 = is template
}

export interface ProxmoxTask {
  upid: string;      // Proxmox task ID
  status?: string;
  exitstatus?: string;
  type: string;
  node: string;
}

export interface ProxmoxTaskStatus {
  status: 'running' | 'stopped';
  exitstatus?: 'OK' | string;
  type: string;
  upid: string;
}

export interface ProxmoxVMConfig {
  cores?: number;
  memory?: number;    // MB
  scsi0?: string;     // disk config string
  net0?: string;      // network config string
  name?: string;
  description?: string;
  ostype?: string;
  ide2?: string;
  sockets?: number;
  ciuser?: string;    // cloud-init default username
}

export interface ProxmoxVMCurrentStatus {
  status: string;
  cpu: number;        // fraction 0-1
  mem: number;        // bytes used
  maxmem: number;     // bytes allocated
  disk: number;       // bytes used
  maxdisk: number;    // bytes allocated
  uptime: number;     // seconds
  vmid: number;
  name: string;
  pid?: number;
  qmpstatus?: string;
}

export interface ProxmoxNetworkInterface {
  name: string;
  'ip-addresses'?: Array<{
    'ip-address': string;
    'ip-address-type': 'ipv4' | 'ipv6';
    prefix: number;
  }>;
  'hardware-address'?: string;
}

export interface ProxmoxFsInfo {
  name: string;         // filesystem name e.g. "C:\", "/"
  mountpoint: string;
  type: string;
  'used-bytes': number;
  'total-bytes': number;
  disk: Array<{ 'serial-number'?: string; 'bus-type'?: string }>;
}

export interface ProxmoxStorageRaw {
  storage: string;
  type: string;
  total: number;
  used: number;
  avail: number;
  enabled: number;
  active: number;
  shared: number;
  content: string;
  node?: string;
}

// ─── Virtualization (Hyper-V) ─────────────────────────────────────────────────

export type HyperVStatus = 'disabled' | 'pending' | 'enabling' | 'disabling' | 'enabled' | 'failed';

export interface VirtualizationStatus {
  enableVirtualization: boolean;
  hyperVStatus: HyperVStatus;
  hyperVLastError?: string;
}

// ─── Software installation ────────────────────────────────────────────────────

export type SoftwareInstallStatus = 'pending' | 'installing' | 'installed' | 'failed';

export interface SoftwareInstallEntry {
  softwareId: string;
  name: string;
  status: SoftwareInstallStatus;
  lastError?: string;
  installedAt?: Date;
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export interface CreateVMDto {
  templateId: number;
  name: string;
  count: number;                         // 1-100
  cloneType: 'dedicated_storage' | 'dynamic_storage';
  cpuCores?: number;                     // optional override (must be >= template)
  memoryGb?: number;                     // optional override (must be >= template)
  diskGb?: number;                       // optional override (must be >= template)
  description?: string;
  // Console username is derived from the template ciuser at creation — not client-supplied.
  passwordMode: 'fixed' | 'dynamic';     // fixed: same password for all; dynamic: unique per VM
  consolePassword?: string;              // required when passwordMode === 'fixed'
  enableVirtualization?: boolean;        // Windows templates only — enable Hyper-V
  softwareIds?: string[];                // Windows templates only — software to install
}

export interface VMFilters {
  status?: string;
  cloneType?: 'dedicated_storage' | 'dynamic_storage';
  node?: string;
}

/** Per-VM console credential summary returned alongside a job. */
export interface JobVMCredential {
  id: string;
  name: string;
  status: string;
  ipAddress?: string;
  consoleUsername?: string;
  consolePassword?: string;
  consoleProtocol: 'rdp' | 'ssh';
}

// ─── Node resource snapshot ───────────────────────────────────────────────────

export interface NodeResources {
  node: string;
  status: 'online' | 'offline';
  cpu: {
    total: number;        // physical cores
    used: number;         // fraction 0-1
    freePercent: number;
  };
  memory: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    freePercent: number;
  };
  storage: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    freePercent: number;
    pools: StoragePool[];
  };
  score: number;          // placement score (calculated)
}

export interface StoragePool {
  name: string;
  totalGb: number;
  freeGb: number;
  type: string;
}

// ─── Resource validation ──────────────────────────────────────────────────────

export interface RequiredResources {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  cloneType: 'dedicated_storage' | 'dynamic_storage';
}

export interface ResourceValidationResult {
  canCreate: boolean;
  requestedCount: number;
  maxPossibleCount: number;
  reason?: string;
  nodeAllocations: Array<{
    node: string;
    vmCount: number;
  }>;
}

// ─── VM operation result ──────────────────────────────────────────────────────

export interface VMOperationResult {
  success: boolean;
  vmid: number;
  node: string;
  operation: string;
  taskId?: string;
  error?: string;
}

// ─── VM status (live) ─────────────────────────────────────────────────────────

export interface VMStatus {
  vmid: number;
  node: string;
  status: string;
  cpu: {
    usagePercent: number;
    allocated: number;
  };
  memory: {
    usedGb: number;
    allocatedGb: number;
    usagePercent: number;
  };
  disk: {
    usedGb: number;
    allocatedGb: number;
  };
  uptime: {
    seconds: number;
    formatted: string;
  };
  ipAddress?: string;
}

// ─── Template details ─────────────────────────────────────────────────────────

export interface TemplateDetails {
  vmid: number;
  name: string;
  node: string;
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  osType?: string;
  description?: string;
  defaultUsername: string;   // cloud-init ciuser from the template config (fallback 'Admin')
}

export interface TemplateSpecs {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
}

// ─── VM details (combined) ────────────────────────────────────────────────────

export interface VMDetails {
  vm: {
    id: string;
    vmid: number;
    node: string;
    name: string;
    description?: string;
    status: string;
    cloneType: 'dedicated_storage' | 'dynamic_storage';
    allocatedCpu: number;
    allocatedMemoryGb: number;
    allocatedDiskGb: number;
    ipAddress?: string;
    macAddress?: string;
    consoleUsername?: string;
    consolePassword?: string;
    consoleProtocol: 'rdp' | 'ssh';
    consoleReady: boolean;
    haEnabled: boolean;
    enableVirtualization: boolean;
    hyperVStatus: HyperVStatus;
    hyperVLastError?: string;
    softwareInstalls: SoftwareInstallEntry[];
    createdAt: Date;
    updatedAt: Date;
  };
  liveStatus?: VMStatus;
  recentEvents: Array<{
    event: string;
    status: string;
    createdAt: Date;
    details?: Record<string, unknown>;
  }>;
}

// ─── Proxmox node raw (for placement engine) ──────────────────────────────────

export interface ProxmoxNodeRaw {
  node: string;
  status: 'online' | 'offline' | 'unknown';
  cpu: number;      // fraction 0-1
  maxcpu: number;   // total cores
  mem: number;      // used bytes
  maxmem: number;   // total bytes
  disk: number;     // used bytes
  maxdisk: number;  // total bytes
  uptime: number;
}

// ─── Bulk creation internal types ────────────────────────────────────────────

export interface BulkVMSpec {
  vmName: string;
  templateName: string;
  index: number;
  node: string;
  templateId: number;
  sourceTemplateId?: number;
  cloneType: 'dedicated_storage' | 'dynamic_storage';
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  templateDiskGb: number;
  templateCpuCores: number;
  templateMemoryGb: number;
  adminId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  description?: string;
  consoleUsername: string;               // template's fixed cloud-init username (same for all VMs)
  passwordMode: 'fixed' | 'dynamic';
  consolePassword?: string;              // set when passwordMode === 'fixed'
  consoleProtocol: 'rdp' | 'ssh';
  enableVirtualization?: boolean;
  softwareIds?: mongoose.Types.ObjectId[];
  /** Software already baked into golden template — mark installed, skip provisioner. */
  softwarePreInstalled?: boolean;
  /** Run Hyper-V / software queues after clone (single-VM create only). */
  schedulePostCreateJobs?: boolean;
}

// ─── Bulk 1:1 VM assignment ──────────────────────────────────────────────────

export interface BulkAssignPairsDto {
  vmIds: string[];
  mode: 'create' | 'existing';
  emailPrefix?: string;
  passwordMode?: 'auto' | 'shared';
  sharedPassword?: string;
  userIds?: string[];
}

export interface BulkAssignPairRow {
  vmId: string;
  vmName: string;
  userId?: string;
  userEmail: string;
  password?: string;
  status: 'assigned' | 'failed';
  error?: string;
}

export interface BulkAssignPairsResult {
  assigned: number;
  failed: number;
  pairs: BulkAssignPairRow[];
}
