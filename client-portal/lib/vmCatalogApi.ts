import { apiRequest } from './apiClient';

export type VmCatalogCategory = 'linux' | 'windows' | 'gpu';
export type VmCatalogStatus =
  | 'pending_approval'
  | 'approved'
  | 'provisioning'
  | 'fulfilling'
  | 'ready_to_attach'
  | 'active'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'suspended';

export interface ICatalogVm {
  _id: string;
  adminId: string;
  adminEmail?: string;
  provider: 'webyne';
  category: VmCatalogCategory;
  planId: string;
  planName: string;
  specs: {
    cpu?: string;
    ram?: string;
    disk?: string;
  };
  billing: string;
  quantity: number;
  template: {
    value: string;
    label: string;
  };
  pricingSnapshot: {
    currency: string;
    subtotal?: number;
    tax?: number;
    total: number;
    billingLabel?: string;
  };
  status: VmCatalogStatus;
  hostname?: string;
  ipAddress?: string;
  username?: string;
  password?: string;
  protocol?: 'ssh' | 'rdp';
  externalRef?: string;
  fulfillError?: string;
  providerPurchased?: boolean;
  attachedAt?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogVmOverviewStats {
  total: number;
  active: number;
  pending: number;
  linux: number;
  windows: number;
  gpu: number;
}

export interface CatalogVmOverview {
  stats: CatalogVmOverviewStats;
  recent: ICatalogVm[];
}

export interface CatalogVmRequesterGroup {
  adminId: string;
  adminEmail: string;
  pendingCount: number;
  totalCount: number;
  lastRequestedAt: string | null;
}

export interface CreateCatalogVmRequestDto {
  category: VmCatalogCategory;
  planId: string;
  planName: string;
  specs?: {
    cpu?: string;
    ram?: string;
    disk?: string;
  };
  billing: string;
  quantity: number;
  template: {
    value: string;
    label: string;
  };
  pricingSnapshot: {
    currency: string;
    subtotal?: number;
    tax?: number;
    total: number;
    billingLabel?: string;
  };
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function fetchVmCatalogOverview(): Promise<CatalogVmOverview> {
  const res = await apiRequest<ApiResponse<CatalogVmOverview>>('/api/v1/vm-catalog/overview');
  return res.data;
}

export async function fetchVmCatalogVms(): Promise<ICatalogVm[]> {
  const res = await apiRequest<ApiResponse<{ vms: ICatalogVm[]; total: number }>>(
    '/api/v1/vm-catalog/vms'
  );
  return res.data.vms;
}

export async function submitCatalogVmRequest(
  dto: CreateCatalogVmRequestDto
): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    '/api/v1/vm-catalog/requests',
    {
      method: 'POST',
      body: JSON.stringify(dto),
    }
  );
  return res.data.request;
}

export async function fetchCatalogVmRequesters(): Promise<CatalogVmRequesterGroup[]> {
  const res = await apiRequest<
    ApiResponse<{ requesters: CatalogVmRequesterGroup[]; total: number }>
  >('/api/v1/vm-catalog/requests/requesters');
  return res.data.requesters;
}

export async function fetchCatalogVmRequests(opts?: {
  status?: VmCatalogStatus | 'all';
  adminId?: string;
}): Promise<ICatalogVm[]> {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set('status', opts.status);
  if (opts?.adminId) qs.set('adminId', opts.adminId);
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await apiRequest<ApiResponse<{ requests: ICatalogVm[]; total: number }>>(
    `/api/v1/vm-catalog/requests${suffix}`
  );
  return res.data.requests;
}

export async function fetchCatalogVm(id: string): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ vm: ICatalogVm }>>(
    `/api/v1/vm-catalog/vms/${id}`
  );
  return res.data.vm;
}

export interface CatalogVmConsoleSession {
  protocol: 'rdp' | 'ssh';
  clientUrl: string;
  connectionId: string;
}

export async function getCatalogVmConsole(
  id: string,
  dimensions?: { width?: number; height?: number }
): Promise<CatalogVmConsoleSession> {
  const params = new URLSearchParams();
  if (dimensions?.width) params.set('width', String(Math.round(dimensions.width)));
  if (dimensions?.height) params.set('height', String(Math.round(dimensions.height)));
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await apiRequest<ApiResponse<CatalogVmConsoleSession>>(
    `/api/v1/vm-catalog/vms/${id}/console${qs}`
  );
  return res.data;
}

export async function approveCatalogVmRequest(id: string): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/approve`,
    { method: 'PATCH' }
  );
  return res.data.request;
}

export async function fetchCatalogVmDetails(id: string): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/fetch-details`,
    { method: 'PATCH' }
  );
  return res.data.request;
}

export async function attachCatalogVmRequest(id: string): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/attach`,
    { method: 'PATCH' }
  );
  return res.data.request;
}

export async function rejectCatalogVmRequest(
  id: string,
  reason: string
): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/reject`,
    {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }
  );
  return res.data.request;
}

export function formatCatalogVmStatus(status: VmCatalogStatus): string {
  const labels: Record<VmCatalogStatus, string> = {
    pending_approval: 'Pending approval',
    approved: 'Approved',
    provisioning: 'Provisioning',
    fulfilling: 'Fulfilling on Webyne…',
    ready_to_attach: 'Ready to attach',
    active: 'Active',
    failed: 'Fulfillment failed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    suspended: 'Suspended',
  };
  return labels[status] ?? status;
}

export function catalogVmStatusNote(status: VmCatalogStatus): string | null {
  if (status === 'provisioning' || status === 'fulfilling') {
    return 'It will be available soon';
  }
  if (status === 'ready_to_attach') {
    return 'Fetched from Webyne — attach to release to admin';
  }
  return null;
}

export function catalogVmStatusTone(
  status: VmCatalogStatus
): 'gray' | 'amber' | 'blue' | 'green' | 'red' {
  switch (status) {
    case 'active':
      return 'green';
    case 'pending_approval':
    case 'ready_to_attach':
      return 'amber';
    case 'approved':
    case 'provisioning':
    case 'fulfilling':
      return 'blue';
    case 'rejected':
    case 'cancelled':
    case 'suspended':
    case 'failed':
      return 'red';
    default:
      return 'gray';
  }
}
