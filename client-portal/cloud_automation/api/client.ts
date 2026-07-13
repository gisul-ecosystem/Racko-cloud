import { cloudAutomationRequest, getAzureCloudApiPrefix } from '../../lib/cloudAutomationRequest';
import { getAccessToken } from '../../lib/apiClient';
import { getTenantAccessToken } from '../../lib/tenantPortalApiClient';
import { getGatewayBaseUrl } from '../../lib/gatewayUrl';
import type {
  AdminAccessRequestPayload,
  AvailableInstance,
  AvailableLocation,
  CreateRequestPayload,
  CreateRequestResponse,
  PricingEstimatePayload,
  PricingEstimateResponse,
  ServiceCatalogResponse,
  ServiceRole,
} from '../types/catalog';
import type { ListRequestsResponse, ProvisioningRequest } from '../types';
import type { ProvisionSnapshot, ProvisionedRole, ProvisionedServiceResource, ProvisionedUser } from '../types/provisioning';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

function cloudAutomationPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized;
}

async function azureRequest<T>(path: string, options?: RequestInit & { skipAuth?: boolean }): Promise<T> {
  return cloudAutomationRequest<T>('azure', path, options);
}

/** Health check for cloud_automation via the gateway. */
export async function fetchCloudAutomationHealth(): Promise<{ success: boolean; message: string }> {
  return azureRequest(cloudAutomationPath('/health'));
}

/** List all provisioning requests. */
export async function listRequests(): Promise<ProvisioningRequest[]> {
  const response = await azureRequest<ListRequestsResponse>(cloudAutomationPath('/requests'));
  return response.data ?? [];
}

/** Get a single provisioning request by ID. */
export async function getRequestById(id: number): Promise<ProvisioningRequest | null> {
  const response = await azureRequest<ApiResponse<ProvisioningRequest>>(
    cloudAutomationPath(`/requests/${id}`)
  );
  return response.data ?? null;
}

function normalizeCatalogResponse(response: ServiceCatalogResponse): ServiceCatalogResponse {
  return {
    ...response,
    categories: response.categories.map((category) => ({
      ...category,
      id: Number(category.id),
    })),
    services: response.services.map((service) => ({
      ...service,
      id: Number(service.id),
    })),
    roles: response.roles.map((role) => ({
      ...role,
      serviceId: Number(role.serviceId),
    })),
    instances: response.instances.map((instance) => ({
      ...instance,
      serviceId: Number(instance.serviceId),
    })),
    instanceRoleMappings: response.instanceRoleMappings.map((mapping) => ({
      ...mapping,
      serviceId: Number(mapping.serviceId),
    })),
  };
}

/** Load full service catalog with pricing, categories, roles, instances, regions. */
export async function getServices(): Promise<ServiceCatalogResponse> {
  const response = await azureRequest<ServiceCatalogResponse>(cloudAutomationPath('/services'));
  return normalizeCatalogResponse(response);
}

/** Get regions matching selected services and instance selections. */
export async function getAvailableLocations(
  serviceIds: number[],
  instanceSelections?: string
): Promise<AvailableLocation[]> {
  const params = new URLSearchParams({
    serviceIds: serviceIds.join(','),
  });
  if (instanceSelections) {
    params.set('instanceSelections', instanceSelections);
  }

  const response = await azureRequest<{ success: boolean; locations: AvailableLocation[] }>(
    `${cloudAutomationPath('/services/available-locations')}?${params.toString()}`
  );
  return response.locations ?? [];
}

/** Get Azure instance sizes available in a region for selected services. */
export async function getAvailableInstances(
  location: string,
  serviceIds: number[]
): Promise<AvailableInstance[]> {
  const params = new URLSearchParams({
    location,
    serviceIds: serviceIds.join(','),
  });

  const response = await azureRequest<{ success: boolean; instances: AvailableInstance[] }>(
    `${cloudAutomationPath('/services/available-instances')}?${params.toString()}`
  );
  return response.instances ?? [];
}

/** Real-time pricing estimate. */
export async function calculatePricingEstimate(
  payload: PricingEstimatePayload
): Promise<PricingEstimateResponse> {
  return azureRequest<PricingEstimateResponse>(cloudAutomationPath('/pricing/calculate'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Create a provisioning request. */
export async function createRequestWithPricing(
  payload: CreateRequestPayload
): Promise<CreateRequestResponse> {
  return azureRequest<CreateRequestResponse>(cloudAutomationPath('/requests'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Request elevated permissions for a service. */
export async function createAdminAccessRequest(
  payload: AdminAccessRequestPayload
): Promise<{ success: boolean; request: unknown }> {
  return azureRequest(cloudAutomationPath('/admin-access-requests'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Get available RBAC roles for a service. */
export async function getServiceRoles(serviceId: number): Promise<ServiceRole[]> {
  const response = await azureRequest<{ success: boolean; roles: ServiceRole[] }>(
    cloudAutomationPath(`/services/${serviceId}/roles`)
  );
  return response.roles ?? [];
}

export interface ProvisionStepStatus {
  success: boolean;
  status?: string;
  resourceGroup?: unknown;
  users?: unknown[];
  roles?: unknown[];
  resources?: unknown[];
  count?: number;
  deliveryStatus?: string | null;
  portalLink?: string | null;
  usersSent?: number;
  spreadsheetFilename?: string | null;
  spreadsheetAvailable?: boolean;
}

/** GET /api/provision/request/:id — resource group provisioning status. */
export async function getProvisionStatus(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(cloudAutomationPath(`/provision/request/${requestId}`));
}

/** GET /api/provision/request/:id/users */
export async function getProvisionUsers(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/users`)
  );
}

/** GET /api/provision/request/:id/roles */
export async function getProvisionRoles(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/roles`)
  );
}

/** GET /api/provision/request/:id/services */
export async function getProvisionServices(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/services`)
  );
}

/** GET /api/provision/request/:id/credentials */
export async function getProvisionCredentials(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/credentials`)
  );
}

/** POST /api/provision/request/:id — create resource group. */
export async function provisionResourceGroup(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(cloudAutomationPath(`/provision/request/${requestId}`), {
    method: 'POST',
  });
}

/** POST /api/provision/request/:id/services — configure instance policies. */
export async function provisionServices(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/services`),
    { method: 'POST' }
  );
}

/** POST /api/provision/request/:id/users */
export async function provisionUsers(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/users`),
    { method: 'POST' }
  );
}

/** POST /api/provision/request/:id/reprovision-roles — assign missing dependency roles. */
export async function reprovisionRequestRoles(requestId: number) {
  return azureRequest<{
    success: boolean;
    message: string;
    usersProcessed: number;
    assignmentsMade?: number;
    rolesAssigned: string[];
    rolesProvisioned?: string[];
  }>(cloudAutomationPath(`/provision/request/${requestId}/reprovision-roles`), {
    method: 'POST',
  });
}

/** POST /api/provision/request/:id/roles */
export async function provisionRoles(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/roles`),
    { method: 'POST' }
  );
}

/** POST /api/provision/request/:id/send-credentials */
export async function sendProvisionCredentials(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/send-credentials`),
    { method: 'POST' }
  );
}

/** GET /api/provision/request/:id/credentials/spreadsheet */
export async function downloadCredentialSpreadsheet(requestId: number): Promise<void> {
  const token = getTenantAccessToken() || getAccessToken();
  const response = await fetch(
    `${getGatewayBaseUrl()}${getAzureCloudApiPrefix()}/provision/request/${requestId}/credentials/spreadsheet`,
    {
      method: 'GET',
      credentials: getTenantAccessToken() ? 'omit' : 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    let message = 'Failed to download credential spreadsheet.';
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  const filename = filenameMatch?.[1] || `azure-lab-credentials-request-${requestId}.xlsx`;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

type SnapshotPart<T> = PromiseSettledResult<T>;

function readSnapshotPart<T>(result: SnapshotPart<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

/** Combine backend reads into a single provisioning snapshot. */
export async function fetchProvisionSnapshot(requestId: number): Promise<ProvisionSnapshot> {
  const [requestResult, provisionResult, servicesResult, usersResult, rolesResult, credentialsResult] =
    await Promise.allSettled([
      getRequestById(requestId),
      getProvisionStatus(requestId),
      getProvisionServices(requestId),
      getProvisionUsers(requestId),
      getProvisionRoles(requestId),
      getProvisionCredentials(requestId),
    ]);

  const request = readSnapshotPart(requestResult, null);
  const provisionRaw = readSnapshotPart(provisionResult, { success: false });
  const servicesRaw = readSnapshotPart(servicesResult, { success: false, resources: [] });
  const usersRaw = readSnapshotPart(usersResult, { success: false, users: [] });
  const rolesRaw = readSnapshotPart(rolesResult, { success: false, roles: [] });
  const credentialsRaw = readSnapshotPart(credentialsResult, { success: false });

  const servicesResources = Array.isArray(servicesRaw.resources)
    ? (servicesRaw.resources as ProvisionedServiceResource[])
    : [];
  const users = Array.isArray(usersRaw.users) ? (usersRaw.users as ProvisionedUser[]) : [];
  const roles = Array.isArray(rolesRaw.roles) ? (rolesRaw.roles as ProvisionedRole[]) : [];

  return {
    request,
    provision: {
      status: provisionRaw.status,
      resourceGroup:
        typeof provisionRaw.resourceGroup === 'string' ? provisionRaw.resourceGroup : null,
      resourceGroupId: null,
    },
    services: {
      resources: servicesResources,
      count: servicesRaw.count ?? servicesResources.length,
    },
    users: {
      users,
      count: users.length,
    },
    roles: {
      roles,
      count: roles.length,
    },
    credentials: {
      deliveryStatus: credentialsRaw.deliveryStatus ?? null,
      recipientEmail: null,
      sentAt: null,
      spreadsheetAvailable: Boolean(credentialsRaw.spreadsheetAvailable),
    },
    fetchedAt: new Date().toISOString(),
  };
}

export { cloudAutomationPath };
