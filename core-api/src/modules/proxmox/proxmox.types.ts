// ─── Raw Proxmox API response types ──────────────────────────────────────────
// These mirror exactly what the Proxmox VE REST API returns.

export interface ProxmoxNodeRaw {
  node: string;
  status: 'online' | 'offline' | 'unknown';
  cpu: number;      // CPU usage fraction 0–1
  maxcpu: number;   // Total CPU cores
  mem: number;      // Used memory in bytes
  maxmem: number;   // Total memory in bytes
  disk: number;     // Used root disk in bytes
  maxdisk: number;  // Total root disk in bytes
  uptime: number;   // Uptime in seconds
  level: string;
  type: string;
}

export interface ProxmoxStorageRaw {
  storage: string;  // Storage pool name
  type: string;     // dir, lvm, zfs, ceph, nfs, etc.
  status: string;
  total: number;    // bytes
  used: number;     // bytes
  avail: number;    // bytes
  enabled: number;  // 1 or 0
  active: number;   // 1 or 0
  shared: number;   // 1 or 0
  content: string;  // comma-separated: images,iso,backup,etc.
  node?: string;    // which node (added by our code)
}

export interface ProxmoxVMRaw {
  vmid: number;
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'suspended';
  cpu: number;      // CPU usage fraction
  cpus: number;     // Allocated CPUs
  mem: number;      // Used memory bytes
  maxmem: number;   // Allocated memory bytes
  disk: number;     // Used disk bytes
  maxdisk: number;  // Allocated disk bytes
  uptime: number;   // seconds
  node: string;     // which node this VM is on
  type: 'qemu' | 'lxc';
  template: number; // 1 if template, 0 if VM
  netin: number;    // network in bytes
  netout: number;   // network out bytes
  diskread: number;
  diskwrite: number;
  pid?: number;
}

export interface ProxmoxNodeVersionRaw {
  version: string;
  release: string;
  repoid: string;
}

// ─── Transformed types (what our API returns to the frontend) ─────────────────

export interface NodeSummary {
  name: string;
  status: 'online' | 'offline' | 'unknown';
  cpu: {
    used: number;         // percentage 0–100
    total: number;        // cores
    usagePercent: number; // rounded to 2 decimal
  };
  memory: {
    used: number;         // GB
    total: number;        // GB
    free: number;         // GB
    usagePercent: number;
  };
  disk: {
    used: number;         // GB
    total: number;        // GB
    free: number;         // GB
    usagePercent: number;
  };
  uptime: {
    seconds: number;
    formatted: string;    // "2 days, 4 hours, 30 minutes"
  };
  proxmoxVersion?: string;
}

export interface StorageSummary {
  name: string;
  type: string;
  node: string;
  status: 'active' | 'inactive' | 'unknown';
  isShared: boolean;
  content: string[];      // array of content types
  capacity: {
    total: number;        // GB
    used: number;         // GB
    free: number;         // GB
    usagePercent: number;
  };
}

export interface VMSummary {
  vmid: number;
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'suspended';
  node: string;
  type: 'qemu' | 'lxc';
  isTemplate: boolean;
  cpu: {
    allocated: number;
    usagePercent: number;
  };
  memory: {
    allocated: number;    // GB
    used: number;         // GB
    usagePercent: number;
  };
  disk: {
    allocated: number;    // GB
    used: number;         // GB
  };
  network: {
    in: number;           // MB
    out: number;          // MB
  };
  uptime: {
    seconds: number;
    formatted: string;
  };
}

export interface ClusterOverview {
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  totalVMs: number;
  runningVMs: number;
  stoppedVMs: number;
  totalCPUCores: number;
  totalMemoryGB: number;
  usedMemoryGB: number;
  totalStorageGB: number;
  usedStorageGB: number;
  fetchedAt: string;      // ISO timestamp
}

export interface FullClusterData {
  cluster: ClusterOverview;
  nodes: NodeSummary[];
  storage: StorageSummary[];
  vms: VMSummary[];
  fetchedAt: string;
}

// HA_SLOT: ProxmoxHAStatus interface for high-availability state
// MIGRATION_SLOT: ProxmoxMigrationJob interface for VM migration tracking
