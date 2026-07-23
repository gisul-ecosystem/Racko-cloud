import { tenantPortalRequest } from './tenantPortalApiClient';
import type {
  BulkCreateExternalVMDto,
  CreateExternalVMDto,
  ExternalVMConsoleSession,
  IExternalVM,
} from './externalVmApi';

export type {
  BulkCreateExternalVMDto,
  CreateExternalVMDto,
  ExternalVMConsoleSession,
  ExternalVMProtocol,
  IExternalVM,
} from './externalVmApi';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

export async function fetchTenantExternalVMs(): Promise<IExternalVM[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ externalVms: IExternalVM[]; total: number }>>(
      '/api/v1/tenant-external-vms'
    )
  );
  return data.externalVms;
}

export async function fetchTenantExternalVM(id: string): Promise<IExternalVM> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ externalVm: IExternalVM }>>(
      `/api/v1/tenant-external-vms/${id}`
    )
  );
  return data.externalVm;
}

export async function createTenantExternalVM(dto: CreateExternalVMDto): Promise<IExternalVM> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ externalVm: IExternalVM }>>('/api/v1/tenant-external-vms', {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  );
  return data.externalVm;
}

export async function bulkCreateTenantExternalVMs(
  vms: CreateExternalVMDto[]
): Promise<IExternalVM[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ externalVms: IExternalVM[]; total: number }>>(
      '/api/v1/tenant-external-vms/bulk',
      {
        method: 'POST',
        body: JSON.stringify({ vms } satisfies BulkCreateExternalVMDto),
      }
    )
  );
  return data.externalVms;
}

export async function deleteTenantExternalVM(id: string): Promise<void> {
  await tenantPortalRequest(`/api/v1/tenant-external-vms/${id}`, { method: 'DELETE' });
}

export async function bulkDeleteTenantExternalVMs(
  ids: string[]
): Promise<{ deleted: number }> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<{ deleted: number }>>('/api/v1/tenant-external-vms/bulk', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  );
}

export async function getTenantExternalVMConsole(
  id: string,
  dimensions?: { width?: number; height?: number }
): Promise<ExternalVMConsoleSession> {
  const params = new URLSearchParams();
  if (dimensions?.width) params.set('width', String(Math.round(dimensions.width)));
  if (dimensions?.height) params.set('height', String(Math.round(dimensions.height)));
  const qs = params.toString() ? `?${params.toString()}` : '';

  return unwrap(
    tenantPortalRequest<ApiEnvelope<ExternalVMConsoleSession>>(
      `/api/v1/tenant-external-vms/${id}/console${qs}`
    )
  );
}

export async function fetchAvailableTenantExternalVMs(): Promise<IExternalVM[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ externalVms: IExternalVM[]; total: number }>>(
      '/api/v1/tenant-external-vms/assign/available'
    )
  );
  return data.externalVms;
}

export async function fetchTenantExternalVMAssignCounts(): Promise<Record<string, number>> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ counts: Record<string, number> }>>(
      '/api/v1/tenant-external-vms/assign/counts'
    )
  );
  return data.counts;
}

export async function fetchAssignedTenantExternalVMsForUser(userId: string): Promise<IExternalVM[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ externalVms: IExternalVM[]; total: number }>>(
      `/api/v1/tenant-external-vms/assign/user/${userId}`
    )
  );
  return data.externalVms;
}

export async function assignTenantExternalVMs(
  userId: string,
  externalVmIds: string[],
  accessSchedule?: import('./accessSchedule').AccessScheduleInput
): Promise<{ assigned: number }> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ assigned: number }>>('/api/v1/tenant-external-vms/assign', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        externalVmIds,
        ...(accessSchedule ? { accessSchedule } : {}),
      }),
    })
  );
  return data;
}

export type {
  BulkAssignExternalPairRow,
  BulkAssignExternalPairsDto,
  BulkAssignExternalPairsResult,
} from './externalVmApi';

export async function bulkAssignTenantExternalOneToOne(
  dto: import('./externalVmApi').BulkAssignExternalPairsDto
): Promise<import('./externalVmApi').BulkAssignExternalPairsResult> {
  return unwrap(
    tenantPortalRequest<
      ApiEnvelope<import('./externalVmApi').BulkAssignExternalPairsResult>
    >('/api/v1/tenant-external-vms/assign/bulk', {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  );
}

export async function unassignTenantExternalVM(id: string): Promise<void> {
  await tenantPortalRequest(`/api/v1/tenant-external-vms/assign/${id}`, { method: 'DELETE' });
}

export async function updateTenantExternalVmSchedule(
  id: string,
  accessSchedule: import('./accessSchedule').AccessScheduleInput
): Promise<import('./accessSchedule').AccessSchedule> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<import('./accessSchedule').AccessSchedule>>(
      `/api/v1/tenant-external-vms/${id}/schedule`,
      { method: 'PATCH', body: JSON.stringify(accessSchedule) }
    )
  );
}
