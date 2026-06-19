import { apiRequest } from './apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExternalVMProtocol = 'rdp' | 'ssh';

export interface IExternalVM {
  _id: string;
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  username: string;
  password: string;
  adminId: string;
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

export async function getExternalVMConsole(id: string): Promise<ExternalVMConsoleSession> {
  const res = await apiRequest<ApiResponse<ExternalVMConsoleSession>>(
    `/api/v1/external-vms/${id}/console`
  );
  return res.data;
}
