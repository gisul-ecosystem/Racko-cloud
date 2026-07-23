import { apiRequest } from './apiClient';
import type { AccessSchedule, AccessScheduleInput } from './accessSchedule';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExternalVMProtocol = 'rdp' | 'ssh';

export interface IExternalVM {
  _id: string;
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  username: string;
  password?: string;
  adminId?: string;
  tenantId?: string;
  assignedTo?: string | null;
  assignedTenantUserId?: string | null;
  accessSchedule?: AccessSchedule | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExternalVMDto {
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  username?: string;
  password: string;
}

export interface BulkCreateExternalVMDto {
  vms: CreateExternalVMDto[];
}

export interface ExternalVMConsoleSession {
  protocol: ExternalVMProtocol;
  clientUrl: string;
  connectionId: string;
}

// ─── API response wrapper ─────────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchExternalVMs(): Promise<IExternalVM[]> {
  const res = await apiRequest<ApiResponse<{ externalVms: IExternalVM[]; total: number }>>(
    '/api/v1/external-vms'
  );
  return res.data.externalVms;
}

export async function fetchExternalVM(id: string): Promise<IExternalVM> {
  const res = await apiRequest<ApiResponse<{ externalVm: IExternalVM }>>(
    `/api/v1/external-vms/${id}`
  );
  return res.data.externalVm;
}

export async function createExternalVM(dto: CreateExternalVMDto): Promise<IExternalVM> {
  const res = await apiRequest<ApiResponse<{ externalVm: IExternalVM }>>('/api/v1/external-vms', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  return res.data.externalVm;
}

export async function bulkCreateExternalVMs(vms: CreateExternalVMDto[]): Promise<IExternalVM[]> {
  const res = await apiRequest<ApiResponse<{ externalVms: IExternalVM[]; total: number }>>(
    '/api/v1/external-vms/bulk',
    {
      method: 'POST',
      body: JSON.stringify({ vms }),
    }
  );
  return res.data.externalVms;
}

export async function deleteExternalVM(id: string): Promise<void> {
  await apiRequest(`/api/v1/external-vms/${id}`, { method: 'DELETE' });
}

export interface ExternalVMConsoleDimensions {
  width?: number;
  height?: number;
}

/**
 * Pass the browser's actual viewport dimensions (window.innerWidth /
 * window.innerHeight) so Guacamole renders at native resolution instead of
 * scaling — sharper text, no blur.
 */
export async function getExternalVMConsole(
  id: string,
  dimensions?: ExternalVMConsoleDimensions
): Promise<ExternalVMConsoleSession> {
  const params = new URLSearchParams();
  if (dimensions?.width) params.set('width', String(Math.round(dimensions.width)));
  if (dimensions?.height) params.set('height', String(Math.round(dimensions.height)));
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await apiRequest<ApiResponse<ExternalVMConsoleSession>>(
    `/api/v1/external-vms/${id}/console${qs}`
  );
  return res.data;
}

// ─── Assignment (admin) ───────────────────────────────────────────────────────

export async function fetchAvailableExternalVMs(): Promise<IExternalVM[]> {
  const res = await apiRequest<ApiResponse<{ externalVms: IExternalVM[]; total: number }>>(
    '/api/v1/external-vms/assign/available'
  );
  return res.data.externalVms;
}

export async function fetchExternalVMAssignCounts(): Promise<Record<string, number>> {
  const res = await apiRequest<ApiResponse<{ counts: Record<string, number> }>>(
    '/api/v1/external-vms/assign/counts'
  );
  return res.data.counts;
}

export async function fetchAssignedExternalVMsForUser(userId: string): Promise<IExternalVM[]> {
  const res = await apiRequest<ApiResponse<{ externalVms: IExternalVM[]; total: number }>>(
    `/api/v1/external-vms/assign/user/${userId}`
  );
  return res.data.externalVms;
}

export async function assignExternalVMs(
  userId: string,
  externalVmIds: string[]
): Promise<{ assigned: number }> {
  const res = await apiRequest<ApiResponse<{ assigned: number }>>(
    '/api/v1/external-vms/assign',
    { method: 'POST', body: JSON.stringify({ userId, externalVmIds }) }
  );
  return res.data;
}

export interface BulkAssignExternalPairRow {
  externalVmId: string;
  externalVmName: string;
  userId?: string;
  userEmail: string;
  password?: string;
  status: 'assigned' | 'failed';
  error?: string;
}

export interface BulkAssignExternalPairsResult {
  assigned: number;
  failed: number;
  pairs: BulkAssignExternalPairRow[];
}

export type BulkAssignExternalMode = 'create' | 'existing';

export interface BulkAssignExternalPairsDto {
  externalVmIds: string[];
  mode: BulkAssignExternalMode;
  emailPrefix?: string;
  passwordMode?: 'auto' | 'shared';
  sharedPassword?: string;
  userIds?: string[];
  accessSchedule?: AccessScheduleInput;
}

export async function bulkAssignExternalOneToOne(
  dto: BulkAssignExternalPairsDto
): Promise<BulkAssignExternalPairsResult> {
  const res = await apiRequest<ApiResponse<BulkAssignExternalPairsResult>>(
    '/api/v1/external-vms/assign/bulk',
    { method: 'POST', body: JSON.stringify(dto) }
  );
  return res.data;
}

export async function unassignExternalVM(id: string): Promise<void> {
  await apiRequest(`/api/v1/external-vms/assign/${id}`, { method: 'DELETE' });
}

export async function fetchMyAssignedExternalVMs(): Promise<IExternalVM[]> {
  const res = await apiRequest<ApiResponse<{ externalVms: IExternalVM[]; total: number }>>(
    '/api/v1/external-vms/my-assigned'
  );
  return res.data.externalVms;
}
