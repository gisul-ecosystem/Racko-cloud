import { tenantPortalRequest } from './tenantPortalApiClient';
import type {
  CatalogVmConsoleSession,
  CatalogVmOverview,
  CreateCatalogVmRequestDto,
  ICatalogVm,
  IVmCatalogPlan,
} from './vmCatalogApi';

export type {
  CatalogVmConsoleSession,
  CatalogVmOverview,
  CreateCatalogVmRequestDto,
  ICatalogVm,
  IVmCatalogPlan,
  VmCatalogCategory,
  VmCatalogStatus,
} from './vmCatalogApi';

export {
  catalogVmStatusNote,
  catalogVmStatusTone,
  formatCatalogVmStatus,
} from './vmCatalogApi';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function fetchTenantVmCatalogPlans(): Promise<IVmCatalogPlan[]> {
  const res = await tenantPortalRequest<ApiEnvelope<{ plans: IVmCatalogPlan[]; total: number }>>(
    '/api/v1/tenant-vm-catalog/plans'
  );
  return res.data.plans;
}

export async function fetchTenantVmCatalogOverview(): Promise<CatalogVmOverview> {
  const res = await tenantPortalRequest<ApiEnvelope<CatalogVmOverview>>(
    '/api/v1/tenant-vm-catalog/overview'
  );
  return res.data;
}

export async function fetchTenantVmCatalogVms(): Promise<ICatalogVm[]> {
  const res = await tenantPortalRequest<ApiEnvelope<{ vms: ICatalogVm[]; total: number }>>(
    '/api/v1/tenant-vm-catalog/vms'
  );
  return res.data.vms;
}

export async function fetchTenantCatalogVm(id: string): Promise<ICatalogVm> {
  const res = await tenantPortalRequest<ApiEnvelope<{ vm: ICatalogVm }>>(
    `/api/v1/tenant-vm-catalog/vms/${id}`
  );
  return res.data.vm;
}

export async function submitTenantCatalogVmRequest(
  dto: CreateCatalogVmRequestDto
): Promise<ICatalogVm> {
  const res = await tenantPortalRequest<ApiEnvelope<{ request: ICatalogVm }>>(
    '/api/v1/tenant-vm-catalog/requests',
    {
      method: 'POST',
      body: JSON.stringify(dto),
    }
  );
  return res.data.request;
}

export async function getTenantCatalogVmConsole(
  id: string,
  dimensions?: { width?: number; height?: number }
): Promise<CatalogVmConsoleSession> {
  const params = new URLSearchParams();
  if (dimensions?.width) params.set('width', String(Math.round(dimensions.width)));
  if (dimensions?.height) params.set('height', String(Math.round(dimensions.height)));
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await tenantPortalRequest<ApiEnvelope<CatalogVmConsoleSession>>(
    `/api/v1/tenant-vm-catalog/vms/${id}/console${qs}`
  );
  return res.data;
}
