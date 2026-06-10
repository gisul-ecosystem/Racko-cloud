import { apiRequest } from './apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProxmoxTemplate {
  vmid: number;
  name: string;
  node: string;
  cpu: number;       // allocated cores
  memory: number;    // allocated RAM bytes
  disk: number;      // used disk bytes
  maxdisk: number;   // allocated disk bytes
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
  defaultUsername: string;   // fixed cloud-init username from the template (fallback 'Admin')
}

export type VMStatus =
  | 'creating' | 'running' | 'stopped' | 'paused'
  | 'suspended' | 'error' | 'deleting' | 'deleted';

export type CloneType = 'dedicated_storage' | 'dynamic_storage';

export type HyperVStatus = 'disabled' | 'pending' | 'enabling' | 'disabling' | 'enabled' | 'failed';

export type SoftwareInstallStatus = 'pending' | 'installing' | 'installed' | 'failed';

export interface SoftwareInstallEntry {
  softwareId: string;
  name: string;
  status: SoftwareInstallStatus;
  lastError?: string;
  installedAt?: string;
}

export interface SoftwareCatalogItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  version?: string;
  estimatedMinutes: number;
  isActive: boolean;
}

export interface VirtualizationStatus {
  enableVirtualization: boolean;
  hyperVStatus: HyperVStatus;
  hyperVLastError?: string;
}

export interface IVM {
  _id: string;
  vmid: number;
  node: string;
  adminId: string;
  assignedTo?: string | null;
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
  consoleUsername?: string;
  consolePassword?: string;
  consoleProtocol?: 'rdp' | 'ssh';
  consoleReady?: boolean;
  jobId?: string;
  haEnabled: boolean;
  enableVirtualization?: boolean;
  hyperVStatus?: HyperVStatus;
  hyperVLastError?: string;
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
    consoleUsername?: string;
    consolePassword?: string;
    consoleProtocol?: 'rdp' | 'ssh';
    consoleReady?: boolean;
    haEnabled: boolean;
    enableVirtualization: boolean;
    hyperVStatus: HyperVStatus;
    hyperVLastError?: string;
    softwareInstalls: SoftwareInstallEntry[];
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

export type JobPhase = 'building_golden_image' | 'cloning_vms';

export type VMJobType =
  | 'single_create'
  | 'bulk_create'
  | 'bulk_delete'
  | 'bulk_start'
  | 'bulk_stop';

export interface IVMJob {
  _id: string;
  adminId: string;
  type: VMJobType;
  status: JobStatus;
  phase?: JobPhase;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  vmIds: string[];
  targetVmIds?: string[];
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
    consoleUsername?: string;
    passwordMode?: PasswordMode;
    consolePassword?: string;
    consoleProtocol?: 'rdp' | 'ssh';
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

export type PasswordMode = 'fixed' | 'dynamic';

export interface CreateVMDto {
  templateId: number;
  name: string;
  count: number;
  cloneType: CloneType;
  cpuCores?: number;
  memoryGb?: number;
  diskGb?: number;
  description?: string;
  // Console username is derived from the template ciuser at creation — not client-supplied.
  passwordMode: PasswordMode;
  consolePassword?: string;          // only sent in fixed mode
  enableVirtualization?: boolean;
  softwareIds?: string[];
}

export interface JobVMCredential {
  id: string;
  name: string;
  status: string;
  ipAddress?: string;
  consoleUsername?: string;
  consolePassword?: string;
  consoleProtocol: 'rdp' | 'ssh';
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

export interface RemovedTemplateEntry {
  vmid: number;
  name: string;
}

export interface TemplateCatalogResponse {
  templates: ProxmoxTemplate[];
  enabledVmids: number[];
  removedFromCluster?: RemovedTemplateEntry[];
}

export interface TemplateSelectionResult {
  enabledCount: number;
  removedFromCluster?: RemovedTemplateEntry[];
  warning?: string;
}

export async function fetchTemplateCatalog(): Promise<TemplateCatalogResponse> {
  const res = await apiRequest<ApiResponse<TemplateCatalogResponse>>(
    '/api/v1/vms/templates/catalog'
  );
  return res.data;
}

export async function saveTemplateSelection(enabledVmids: number[]): Promise<TemplateSelectionResult> {
  const res = await apiRequest<ApiResponse<TemplateSelectionResult>>(
    '/api/v1/vms/templates/selection',
    {
      method: 'PUT',
      body: JSON.stringify({ enabledVmids }),
    }
  );
  return res.data;
}

// ─── VM CRUD ──────────────────────────────────────────────────────────────────

export async function createVM(
  dto: CreateVMDto
): Promise<{ jobId: string }> {
  const res = await apiRequest<ApiResponse<{ jobId: string }>>('/api/v1/vms', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  return { jobId: res.data.jobId! };
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

export async function bulkDeleteVMs(vmIds: string[]): Promise<{ jobId: string }> {
  const res = await apiRequest<ApiResponse<{ jobId: string }>>('/api/v1/vms/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ vmIds }),
  });
  return res.data;
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

// ─── Virtualization (Hyper-V) ─────────────────────────────────────────────────

export async function fetchVirtualizationStatus(vmId: string): Promise<VirtualizationStatus> {
  const res = await apiRequest<ApiResponse<VirtualizationStatus>>(
    `/api/v1/vms/${vmId}/virtualization`
  );
  return res.data;
}

export async function enableVirtualization(vmId: string): Promise<VirtualizationStatus> {
  const res = await apiRequest<ApiResponse<VirtualizationStatus>>(
    `/api/v1/vms/${vmId}/virtualization/enable`,
    { method: 'POST' }
  );
  return res.data;
}

export async function disableVirtualization(vmId: string): Promise<VirtualizationStatus> {
  const res = await apiRequest<ApiResponse<VirtualizationStatus>>(
    `/api/v1/vms/${vmId}/virtualization/disable`,
    { method: 'POST' }
  );
  return res.data;
}

export async function cancelVirtualization(vmId: string): Promise<VirtualizationStatus> {
  const res = await apiRequest<ApiResponse<VirtualizationStatus>>(
    `/api/v1/vms/${vmId}/virtualization/cancel`,
    { method: 'POST' }
  );
  return res.data;
}

export async function cancelSoftwareInstalls(vmId: string): Promise<void> {
  await apiRequest(`/api/v1/vms/${vmId}/software/cancel`, { method: 'POST' });
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function fetchMyJobs(limit = 20): Promise<IVMJob[]> {
  const res = await apiRequest<ApiResponse<{ jobs: IVMJob[]; total: number }>>(
    `/api/v1/vms/jobs?limit=${limit}`
  );
  return res.data.jobs;
}

export async function fetchJobStatus(
  jobId: string
): Promise<{ job: IVMJob; vms: JobVMCredential[] }> {
  const res = await apiRequest<ApiResponse<{ job: IVMJob; vms?: JobVMCredential[] }>>(
    `/api/v1/vms/jobs/${jobId}`
  );
  return { job: res.data.job, vms: res.data.vms ?? [] };
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

// ─── VM Assignment ────────────────────────────────────────────────────────────

export async function fetchAvailableVMs(): Promise<IVM[]> {
  const res = await apiRequest<ApiResponse<{ vms: IVM[]; total: number }>>(
    '/api/v1/vms/assign/available'
  );
  return res.data.vms;
}

export async function fetchAssignedVMCounts(): Promise<Record<string, number>> {
  const res = await apiRequest<ApiResponse<{ counts: Record<string, number> }>>(
    '/api/v1/vms/assign/counts'
  );
  return res.data.counts;
}

export async function fetchAssignedVMsForUser(userId: string): Promise<IVM[]> {
  const res = await apiRequest<ApiResponse<{ vms: IVM[]; total: number }>>(
    `/api/v1/vms/assign/user/${userId}`
  );
  return res.data.vms;
}

export async function assignVMs(userId: string, vmIds: string[]): Promise<{ assigned: number }> {
  const res = await apiRequest<ApiResponse<{ assigned: number }>>(
    '/api/v1/vms/assign',
    { method: 'POST', body: JSON.stringify({ userId, vmIds }) }
  );
  return res.data;
}

export async function unassignVM(vmId: string): Promise<void> {
  await apiRequest(`/api/v1/vms/assign/${vmId}`, { method: 'DELETE' });
}

export async function fetchMyAssignedVMs(): Promise<IVM[]> {
  const res = await apiRequest<ApiResponse<{ vms: IVM[]; total: number }>>(
    '/api/v1/vms/my-assigned'
  );
  return res.data.vms;
}

// ─── Software catalog ─────────────────────────────────────────────────────────

export async function fetchSoftwareCatalog(): Promise<SoftwareCatalogItem[]> {
  const res = await apiRequest<ApiResponse<{ software: SoftwareCatalogItem[]; total: number }>>(
    '/api/v1/software'
  );
  return res.data.software;
}
