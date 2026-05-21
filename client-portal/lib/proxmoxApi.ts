import { apiRequest } from './apiClient';

// ─── Response types matching backend proxmox.types.ts ────────────────────────

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
  fetchedAt: string;
}

export interface NodeSummary {
  name: string;
  status: 'online' | 'offline' | 'unknown';
  cpu: { used: number; total: number; usagePercent: number };
  memory: { used: number; total: number; free: number; usagePercent: number };
  disk: { used: number; total: number; free: number; usagePercent: number };
  uptime: { seconds: number; formatted: string };
  proxmoxVersion?: string;
}

export interface StorageSummary {
  name: string;
  type: string;
  node: string;
  status: 'active' | 'inactive' | 'unknown';
  isShared: boolean;
  content: string[];
  capacity: { total: number; used: number; free: number; usagePercent: number };
}

export interface VMSummary {
  vmid: number;
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'suspended';
  node: string;
  type: 'qemu' | 'lxc';
  isTemplate: boolean;
  cpu: { allocated: number; usagePercent: number };
  memory: { allocated: number; used: number; usagePercent: number };
  disk: { allocated: number; used: number };
  network: { in: number; out: number };
  uptime: { seconds: number; formatted: string };
}

export interface FullClusterData {
  cluster: ClusterOverview;
  nodes: NodeSummary[];
  storage: StorageSummary[];
  vms: VMSummary[];
  fetchedAt: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function fetchFullClusterData(): Promise<FullClusterData> {
  const res = await apiRequest<ApiResponse<FullClusterData>>('/api/v1/proxmox/cluster');
  return res.data;
}

export async function fetchClusterOverview(): Promise<ClusterOverview> {
  const res = await apiRequest<ApiResponse<{ overview: ClusterOverview }>>('/api/v1/proxmox/overview');
  return res.data.overview;
}
