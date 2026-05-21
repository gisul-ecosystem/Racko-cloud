import { apiRequest } from './apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProxmoxTemplate {
  vmid: number;
  name: string;
  node: string;
  cpu: number;
  memory: number;   // bytes
  disk: number;     // bytes
  maxdisk: number;  // bytes
  status: string;
  template: number;
}

export interface TemplateDetails {
  vmid: number;
  name: string;
  node: string;
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  osType?: string;
  description?: string;
}

export type VMStatus =
  | 'creating' | 'running' | 'stopped' | 'paused'
  | 'suspended' | 'error' | 'deleting' | 'deleted';

export type CloneType = 'dedicated_storage' | 'dynamic_storage';

export interface IVM {
  _id: string;
  vmid: number;
  node: string;
  adminId: string;
  name: string;
  description?: string;
  templateId: number;
  templateName: string;
  cloneType: CloneType;
  allocatedCpu: number;
  allocatedMemoryGb: number;
  allocatedDiskGb: number;
  status: VMStatus;
  proxmoxStatus: string;
  ipAddress?: string;
  macAddress?: string;
  jobId?: string;
  haEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface VMLiveStatus {
  vmid: number;
  node: string;
  status: string;
  cpu: { usagePercent: number; allocated: number };
  memory: { usedGb: number; allocatedGb: number; usagePercent: number };
  disk: { usedGb: number; allocatedGb: number };
  uptime: { seconds: number; formatted: string };
  ipAddress?: string;
}

export interface VMDetails {
  vm: {
    id: string;
    vmid: number;
    node: string;
    name: string;
    description?: string;
    status: VMStatus;
    cloneType: CloneType;
    allocatedCpu: number;
    allocatedMemoryGb: number;
    allocatedDiskGb: number;
    ipAddress?: string;
    macAddress?: string;
    haEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
  liveStatus?: VMLiveStatus;
  recentEvents: VMEvent[];
}

export interface VMEvent {
  event: string;
  status: 'success' | 'failed';
  createdAt: string;
  details?: Record<string, unknown>;
  errorMessage?: string;
}

export interface VMOperationResult {
  success: boolean;
  vmid: number;
  node: string;
  operation: string;
  taskId?: string;
  error?: string;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'partial' | 'failed';

export interface IVMJob {
  _id: string;
  adminId: string;
  type: string;
  status: JobStatus;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  vmIds: string[];
  failedVmids: number[];
  requestedSpecs: {
    templateId: number;
    templateName: string;
    cloneType: CloneType;
    cpuCores: number;
    memoryGb: number;
    diskGb: number;
    namePrefix: string;
    count: number;
  };
  jobErrors: Array<{ index: number; vmName: string; error: string; node?: string }>;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NodeAlert {
  _id: string;
  node: string;
  resource: 'cpu' | 'ram' | 'storage';
  severity: 'warning' | 'critical' | 'full';
  currentPercent: number;
  thresholdPercent: number;
  status: 'active' | 'resolved';
  storagePool?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVMDto {
  templateId: number;
  name: string;
  count: number;
  cloneType: CloneType;
  cpuCores?: number;
  memoryGb?: number;
  diskGb?: number;
  description?: string;
}

// ─── API response wrapper ─────────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function fetchTemplates(): Promise<ProxmoxTemplate[]> {
  const res = await apiRequest<ApiResponse<{ templates: ProxmoxTemplate[]; total: number }>>(
    '/api/v1/vms/templates'
  );
  return res.data.templates;
}

export async function fetchTemplateDetails(templateId: number): Promise<TemplateDetails> {
  const res = await apiRequest<ApiResponse<{ template: TemplateDetails }>>(
    `/api/v1/vms/templates/${templateId}`
  );
  return res.data.template;
}

// ─── VM CRUD ──────────────────────────────────────────────────────────────────

export async function createVM(
  dto: CreateVMDto
): Promise<{ jobId: string } | { vm: IVM }> {
  const res = await apiRequest<ApiResponse<{ jobId?: string; vm?: IVM }>>('/api/v1/vms', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  if (res.data.jobId) return { jobId: res.data.jobId };
  return { vm: res.data.vm! };
}

export async function fetchMyVMs(filters?: {
  status?: string;
  cloneType?: string;
  node?: string;
}): Promise<IVM[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.cloneType) params.set('cloneType', filters.cloneType);
  if (filters?.node) params.set('node', filters.node);
  const qs = params.toString();
  const res = await apiRequest<ApiResponse<{ vms: IVM[]; total: number }>>(
    `/api/v1/vms${qs ? `?${qs}` : ''}`
  );
  return res.data.vms;
}

export async function fetchAllVMsAdmin(filters?: {
  status?: string;
  cloneType?: string;
  node?: string;
}): Promise<IVM[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.cloneType) params.set('cloneType', filters.cloneType);
  if (filters?.node) params.set('node', filters.node);
  const qs = params.toString();
  const res = await apiRequest<ApiResponse<{ vms: IVM[]; total: number }>>(
    `/api/v1/vms/admin/all${qs ? `?${qs}` : ''}`
  );
  return res.data.vms;
}

export async function fetchVMDetails(vmId: string): Promise<VMDetails> {
  const res = await apiRequest<ApiResponse<VMDetails>>(`/api/v1/vms/${vmId}`);
  return res.data;
}

export async function fetchVMStatus(vmId: string): Promise<VMLiveStatus> {
  const res = await apiRequest<ApiResponse<{ status: VMLiveStatus }>>(
    `/api/v1/vms/${vmId}/status`
  );
  return res.data.status;
}

export async function fetchVMEvents(vmId: string): Promise<VMEvent[]> {
  const res = await apiRequest<ApiResponse<{ events: VMEvent[]; total: number }>>(
    `/api/v1/vms/${vmId}/events`
  );
  return res.data.events;
}

export async function deleteVM(vmId: string): Promise<void> {
  await apiRequest(`/api/v1/vms/${vmId}`, { method: 'DELETE' });
}

// ─── VM power operations ──────────────────────────────────────────────────────

export async function startVM(vmId: string): Promise<VMOperationResult> {
  const res = await apiRequest<ApiResponse<{ result: VMOperationResult }>>(
    `/api/v1/vms/${vmId}/start`,
    { method: 'POST' }
  );
  return res.data.result;
}

export async function stopVM(vmId: string): Promise<VMOperationResult> {
  const res = await apiRequest<ApiResponse<{ result: VMOperationResult }>>(
    `/api/v1/vms/${vmId}/stop`,
    { method: 'POST' }
  );
  return res.data.result;
}

export async function forceStopVM(vmId: string): Promise<VMOperationResult> {
  const res = await apiRequest<ApiResponse<{ result: VMOperationResult }>>(
    `/api/v1/vms/${vmId}/force-stop`,
    { method: 'POST' }
  );
  return res.data.result;
}

export async function restartVM(vmId: string): Promise<VMOperationResult> {
  const res = await apiRequest<ApiResponse<{ result: VMOperationResult }>>(
    `/api/v1/vms/${vmId}/restart`,
    { method: 'POST' }
  );
  return res.data.result;
}

export async function resetVM(vmId: string): Promise<VMOperationResult> {
  const res = await apiRequest<ApiResponse<{ result: VMOperationResult }>>(
    `/api/v1/vms/${vmId}/reset`,
    { method: 'POST' }
  );
  return res.data.result;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function fetchMyJobs(limit = 20): Promise<IVMJob[]> {
  const res = await apiRequest<ApiResponse<{ jobs: IVMJob[]; total: number }>>(
    `/api/v1/vms/jobs?limit=${limit}`
  );
  return res.data.jobs;
}

export async function fetchJobStatus(jobId: string): Promise<IVMJob> {
  const res = await apiRequest<ApiResponse<{ job: IVMJob }>>(`/api/v1/vms/jobs/${jobId}`);
  return res.data.job;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export async function fetchActiveAlerts(): Promise<NodeAlert[]> {
  const res = await apiRequest<ApiResponse<{ alerts: NodeAlert[]; total: number }>>(
    '/api/v1/proxmox/alerts'
  );
  return res.data.alerts;
}

export async function fetchAlertHistory(limit = 50): Promise<NodeAlert[]> {
  const res = await apiRequest<ApiResponse<{ alerts: NodeAlert[]; total: number }>>(
    `/api/v1/proxmox/alerts/history?limit=${limit}`
  );
  return res.data.alerts;
}
