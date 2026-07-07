import { apiRequest } from '../../lib/apiClient';
import { CLOUD_AUTOMATION_API_PREFIX } from '../constants';
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
  return `${CLOUD_AUTOMATION_API_PREFIX}${normalized}`;
}

/** Health check for cloud_automation via the gateway. */
export async function fetchCloudAutomationHealth(): Promise<{ success: boolean; message: string }> {
  return apiRequest(cloudAutomationPath('/health'));
}

/** List all provisioning requests. */
export async function listRequests(): Promise<ProvisioningRequest[]> {
  const response = await apiRequest<ListRequestsResponse>(cloudAutomationPath('/requests'));
  return response.data ?? [];
}

/** Get a single provisioning request by ID. */
export async function getRequestById(id: number): Promise<ProvisioningRequest | null> {
  const response = await apiRequest<ApiResponse<ProvisioningRequest>>(
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
  const response = await apiRequest<ServiceCatalogResponse>(cloudAutomationPath('/services'));
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

  const response = await apiRequest<{ success: boolean; locations: AvailableLocation[] }>(
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

  const response = await apiRequest<{ success: boolean; instances: AvailableInstance[] }>(
    `${cloudAutomationPath('/services/available-instances')}?${params.toString()}`
  );
  return response.instances ?? [];
}

/** Real-time pricing estimate. */
export async function calculatePricingEstimate(
  payload: PricingEstimatePayload
): Promise<PricingEstimateResponse> {
  return apiRequest<PricingEstimateResponse>(cloudAutomationPath('/pricing/calculate'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Create a provisioning request. */
export async function createRequestWithPricing(
  payload: CreateRequestPayload
): Promise<CreateRequestResponse> {
  return apiRequest<CreateRequestResponse>(cloudAutomationPath('/requests'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Request elevated permissions for a service. */
export async function createAdminAccessRequest(
  payload: AdminAccessRequestPayload
): Promise<{ success: boolean; request: unknown }> {
  return apiRequest(cloudAutomationPath('/admin-access-requests'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Get available RBAC roles for a service. */
export async function getServiceRoles(serviceId: number): Promise<ServiceRole[]> {
  const response = await apiRequest<{ success: boolean; roles: ServiceRole[] }>(
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
}

/** GET /api/provision/request/:id — resource group provisioning status. */
export async function getProvisionStatus(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(cloudAutomationPath(`/provision/request/${requestId}`));
}

/** GET /api/provision/request/:id/users */
export async function getProvisionUsers(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/users`)
  );
}

/** GET /api/provision/request/:id/roles */
export async function getProvisionRoles(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/roles`)
  );
}

/** GET /api/provision/request/:id/services */
export async function getProvisionServices(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/services`)
  );
}

/** GET /api/provision/request/:id/credentials */
export async function getProvisionCredentials(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/credentials`)
  );
}

/** POST /api/provision/request/:id — create resource group. */
export async function provisionResourceGroup(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(cloudAutomationPath(`/provision/request/${requestId}`), {
    method: 'POST',
  });
}

/** POST /api/provision/request/:id/services — configure instance policies. */
export async function provisionServices(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/services`),
    { method: 'POST' }
  );
}

/** POST /api/provision/request/:id/users */
export async function provisionUsers(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/users`),
    { method: 'POST' }
  );
}

/** POST /api/provision/request/:id/roles */
export async function provisionRoles(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/roles`),
    { method: 'POST' }
  );
}

/** POST /api/provision/request/:id/send-credentials */
export async function sendProvisionCredentials(requestId: number): Promise<ProvisionStepStatus> {
  return apiRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/send-credentials`),
    { method: 'POST' }
  );
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
    },
    fetchedAt: new Date().toISOString(),
  };
}

export { cloudAutomationPath };
