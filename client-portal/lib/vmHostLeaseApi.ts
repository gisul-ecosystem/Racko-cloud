import { apiRequest } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface VmHostLease {
  id: string;
  provider: string;
  ipAddress: string;
  description: string;
  invoiceDate: string;
  dueDate: string;
  assignedTo: string;
  vmUsername: string;
  vmPassword: string;
  sourceFileName: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VmHostLeaseListResult {
  leases: VmHostLease[];
  total: number;
  page: number;
  limit: number;
}

export interface UploadVmHostLeasesResult {
  imported: number;
  skippedErrors: Array<{ rowNumber: number; message: string }>;
  leases: VmHostLease[];
  stats: {
    inserted: number;
    updated: number;
    total: number;
  };
}

export interface CreateVmHostLeaseDto {
  provider: string;
  ipAddress: string;
  description: string;
  invoiceDate: string;
  dueDate: string;
  assignedTo: string;
  vmUsername: string;
  vmPassword: string;
}

export async function listVmHostLeases(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<VmHostLeaseListResult> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search?.trim()) qs.set('search', params.search.trim());
  const query = qs.toString();
  const res = await apiRequest<ApiEnvelope<VmHostLeaseListResult>>(
    `/api/v1/vm-host-leases${query ? `?${query}` : ''}`
  );
  return res.data;
}

export async function createVmHostLease(dto: CreateVmHostLeaseDto): Promise<VmHostLease> {
  const res = await apiRequest<ApiEnvelope<{ lease: VmHostLease }>>('/api/v1/vm-host-leases', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  return res.data.lease;
}

export async function deleteVmHostLease(id: string): Promise<void> {
  await apiRequest<ApiEnvelope<Record<string, never>>>(`/api/v1/vm-host-leases/${id}`, {
    method: 'DELETE',
  });
}

export async function uploadVmHostLeasesExcel(file: File): Promise<UploadVmHostLeasesResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiRequest<ApiEnvelope<UploadVmHostLeasesResult>>(
    '/api/v1/vm-host-leases/upload',
    {
      method: 'POST',
      body: form,
    }
  );
  return res.data;
}
