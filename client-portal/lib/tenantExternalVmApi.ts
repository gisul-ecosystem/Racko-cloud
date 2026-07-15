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

export async function getTenantExternalVMConsole(id: string): Promise<ExternalVMConsoleSession> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<ExternalVMConsoleSession>>(
      `/api/v1/tenant-external-vms/${id}/console`
    )
  );
}
