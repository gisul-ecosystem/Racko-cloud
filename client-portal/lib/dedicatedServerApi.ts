import { apiRequest } from './apiClient';

export type DedicatedServerStatus =
  | 'provisioning'
  | 'active'
  | 'rejected'
  | 'cancelled'
  | 'suspended';

export type DedicatedServerProtocol = 'rdp' | 'ssh';

export interface IDedicatedPlan {
  _id: string;
  name: string;
  description?: string;
  cpu: string;
  ram: string;
  disk: string;
  location?: string;
  features: string[];
  monthlyPrice: number;
  setupFee: number | null;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DedicatedPricingSettings {
  sellMultiplier: number;
  updatedAt: string | null;
}

export interface IDedicatedServer {
  _id: string;
  adminId: string;
  adminEmail?: string;
  planId: string;
  planName: string;
  specs: { cpu: string; ram: string; disk: string; location?: string };
  monthlyPrice: number;
  setupFee?: number | null;
  subtotal?: number;
  tax?: number;
  currency: string;
  notes?: string;
  status: DedicatedServerStatus;
  chargedAmount?: number;
  walletDebited?: boolean;
  hostname?: string;
  ipAddress?: string;
  username?: string;
  password?: string;
  protocol?: DedicatedServerProtocol;
  rejectionReason?: string;
  attachedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DedicatedRequesterGroup {
  adminId: string;
  adminEmail: string;
  pendingCount: number;
  totalCount: number;
  lastRequestedAt: string | null;
}

export interface DedicatedConsoleSession {
  protocol: DedicatedServerProtocol;
  clientUrl: string;
  connectionId: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function fetchDedicatedPlans(): Promise<IDedicatedPlan[]> {
  const res = await apiRequest<ApiResponse<{ plans: IDedicatedPlan[]; total: number }>>(
    '/api/v1/dedicated-servers/plans'
  );
  return res.data.plans;
}

export async function createDedicatedPlan(
  body: Omit<IDedicatedPlan, '_id' | 'createdAt' | 'updatedAt'>
): Promise<IDedicatedPlan> {
  const res = await apiRequest<ApiResponse<{ plan: IDedicatedPlan }>>(
    '/api/v1/dedicated-servers/plans',
    { method: 'POST', body: JSON.stringify(body) }
  );
  return res.data.plan;
}

export async function updateDedicatedPlan(
  id: string,
  body: Partial<IDedicatedPlan>
): Promise<IDedicatedPlan> {
  const res = await apiRequest<ApiResponse<{ plan: IDedicatedPlan }>>(
    `/api/v1/dedicated-servers/plans/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
  return res.data.plan;
}

export async function deleteDedicatedPlan(id: string): Promise<void> {
  await apiRequest(`/api/v1/dedicated-servers/plans/${id}`, { method: 'DELETE' });
}

export async function seedDedicatedPlans(): Promise<{ inserted: number; total: number }> {
  const res = await apiRequest<ApiResponse<{ inserted: number; total: number }>>(
    '/api/v1/dedicated-servers/plans/seed',
    { method: 'POST' }
  );
  return res.data;
}

export async function fetchDedicatedPricingSettings(): Promise<DedicatedPricingSettings> {
  const res = await apiRequest<ApiResponse<DedicatedPricingSettings>>(
    '/api/v1/dedicated-servers/pricing-settings'
  );
  return res.data;
}

export async function saveDedicatedPricingSettings(
  sellMultiplier: number
): Promise<DedicatedPricingSettings> {
  const res = await apiRequest<ApiResponse<DedicatedPricingSettings>>(
    '/api/v1/dedicated-servers/pricing-settings',
    { method: 'PUT', body: JSON.stringify({ sellMultiplier }) }
  );
  return res.data;
}

export async function submitDedicatedServerRequest(opts: {
  planId: string;
  notes?: string;
}): Promise<IDedicatedServer> {
  const res = await apiRequest<ApiResponse<{ request: IDedicatedServer }>>(
    '/api/v1/dedicated-servers/requests',
    { method: 'POST', body: JSON.stringify(opts) }
  );
  return res.data.request;
}

export async function fetchMyDedicatedServers(): Promise<IDedicatedServer[]> {
  const res = await apiRequest<ApiResponse<{ servers: IDedicatedServer[]; total: number }>>(
    '/api/v1/dedicated-servers/servers'
  );
  return res.data.servers;
}

export async function fetchDedicatedServer(id: string): Promise<IDedicatedServer> {
  const res = await apiRequest<ApiResponse<{ server: IDedicatedServer }>>(
    `/api/v1/dedicated-servers/servers/${id}`
  );
  return res.data.server;
}

export async function getDedicatedServerConsole(
  id: string,
  dimensions?: { width?: number; height?: number }
): Promise<DedicatedConsoleSession> {
  const params = new URLSearchParams();
  if (dimensions?.width) params.set('width', String(Math.round(dimensions.width)));
  if (dimensions?.height) params.set('height', String(Math.round(dimensions.height)));
  const qs = params.toString() ? `?${params}` : '';
  const res = await apiRequest<ApiResponse<DedicatedConsoleSession>>(
    `/api/v1/dedicated-servers/servers/${id}/console${qs}`
  );
  return res.data;
}

export async function fetchDedicatedRequesters(): Promise<DedicatedRequesterGroup[]> {
  const res = await apiRequest<
    ApiResponse<{ requesters: DedicatedRequesterGroup[]; total: number }>
  >('/api/v1/dedicated-servers/requests/requesters');
  return res.data.requesters;
}

export async function fetchDedicatedRequests(opts?: {
  status?: DedicatedServerStatus | 'all';
  adminId?: string;
}): Promise<IDedicatedServer[]> {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set('status', opts.status);
  if (opts?.adminId) qs.set('adminId', opts.adminId);
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await apiRequest<ApiResponse<{ requests: IDedicatedServer[]; total: number }>>(
    `/api/v1/dedicated-servers/requests${suffix}`
  );
  return res.data.requests;
}

export async function attachDedicatedRequest(
  id: string,
  body: {
    ipAddress: string;
    hostname?: string;
    username: string;
    password: string;
    protocol: DedicatedServerProtocol;
  }
): Promise<IDedicatedServer> {
  const res = await apiRequest<ApiResponse<{ request: IDedicatedServer }>>(
    `/api/v1/dedicated-servers/requests/${id}/attach`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
  return res.data.request;
}

export async function rejectDedicatedRequest(
  id: string,
  reason: string
): Promise<IDedicatedServer> {
  const res = await apiRequest<ApiResponse<{ request: IDedicatedServer }>>(
    `/api/v1/dedicated-servers/requests/${id}/reject`,
    { method: 'PATCH', body: JSON.stringify({ reason }) }
  );
  return res.data.request;
}

export function formatDedicatedStatus(status: DedicatedServerStatus): string {
  const map: Record<DedicatedServerStatus, string> = {
    provisioning: 'Provisioning',
    active: 'Active',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    suspended: 'Suspended',
  };
  return map[status] ?? status;
}
