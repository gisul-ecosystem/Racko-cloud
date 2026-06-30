import { tenantPortalRequest } from './tenantPortalApiClient';
import type {
  ApiEnvelope,
  TenantOnboardDto,
  TenantOnboardResult,
  TenantUserProfile,
  TenantUsersResult,
  TenantVmAssignmentCountsResult,
  TenantVmConsoleResult,
  TenantVmDetails,
  TenantVmLiveStatus,
  TenantVmOperationResult,
  TenantVmsResult,
} from '../types/tenantPortal';

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

export async function fetchTenantVms(params?: {
  status?: string;
  node?: string;
}): Promise<TenantVmsResult> {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.node) search.set('node', params.node);
  const qs = search.toString();
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmsResult>>(
      `/api/v1/tenant-vms${qs ? `?${qs}` : ''}`
    )
  );
}

export async function fetchTenantVm(vmId: string): Promise<TenantVmDetails> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmDetails>>(`/api/v1/tenant-vms/${vmId}`)
  );
}

export async function fetchTenantVmStatus(vmId: string): Promise<TenantVmLiveStatus> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ status: TenantVmLiveStatus }>>(
      `/api/v1/tenant-vms/${vmId}/status`
    )
  );
  return data.status;
}

export async function startTenantVm(vmId: string): Promise<TenantVmOperationResult> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ result: TenantVmOperationResult }>>(
      `/api/v1/tenant-vms/${vmId}/start`,
      { method: 'POST' }
    )
  );
  return data.result;
}

export async function stopTenantVm(vmId: string): Promise<TenantVmOperationResult> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ result: TenantVmOperationResult }>>(
      `/api/v1/tenant-vms/${vmId}/stop`,
      { method: 'POST' }
    )
  );
  return data.result;
}

export async function restartTenantVm(vmId: string): Promise<TenantVmOperationResult> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ result: TenantVmOperationResult }>>(
      `/api/v1/tenant-vms/${vmId}/restart`,
      { method: 'POST' }
    )
  );
  return data.result;
}

export async function openTenantVmConsole(
  vmId: string,
  protocol?: 'rdp' | 'ssh' | 'vnc'
): Promise<TenantVmConsoleResult> {
  const qs = protocol ? `?protocol=${protocol}` : '';
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmConsoleResult>>(
      `/api/v1/tenant-vms/${vmId}/console${qs}`
    )
  );
}

export async function fetchAvailableTenantVms(): Promise<TenantVmsResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmsResult>>('/api/v1/tenant-vms/assign/available')
  );
}

export async function fetchTenantAssignCounts(): Promise<Record<string, number>> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmAssignmentCountsResult>>(
      '/api/v1/tenant-vms/assign/counts'
    )
  );
  return data.counts;
}

export async function fetchTenantVmsForUser(userId: string): Promise<TenantVmsResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmsResult>>(
      `/api/v1/tenant-vms/assign/user/${userId}`
    )
  );
}

export async function onboardTenantVms(dto: TenantOnboardDto): Promise<TenantOnboardResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantOnboardResult>>('/api/v1/tenant-vms/assign/onboard', {
      method: 'POST',
      body: JSON.stringify(dto),
    })
  );
}

export async function unassignTenantVm(vmId: string): Promise<void> {
  await tenantPortalRequest<ApiEnvelope<Record<string, never>>>(
    `/api/v1/tenant-vms/assign/${vmId}`,
    { method: 'DELETE' }
  );
}

export async function fetchTenantUsers(): Promise<TenantUsersResult> {
  return unwrap(tenantPortalRequest<ApiEnvelope<TenantUsersResult>>('/api/v1/tenant-users'));
}

export async function setTenantUserActive(
  userId: string,
  isActive: boolean
): Promise<TenantUserProfile> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ user: TenantUserProfile }>>(
      `/api/v1/tenant-users/${userId}/active`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }
    )
  );
  return data.user;
}

export async function deleteTenantUser(userId: string): Promise<void> {
  await tenantPortalRequest<ApiEnvelope<Record<string, never>>>(`/api/v1/tenant-users/${userId}`, {
    method: 'DELETE',
  });
}
