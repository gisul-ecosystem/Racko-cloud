import { cloudAutomationRequest, getAzureCloudApiPrefix } from '../../lib/cloudAutomationRequest';
import { ApiError, getAccessToken } from '../../lib/apiClient';
import { getTenantAccessToken } from '../../lib/tenantPortalApiClient';
import { getGatewayBaseUrl, getTenantGatewayIdentityHeaders } from '../../lib/gatewayUrl';
import { isTenantPortalClient } from '../../lib/portalClient';
import type {
  AdminAccessRequestPayload,
  AvailableInstance,
  AvailableLocation,
  CreateRequestPayload,
  CreateRequestResponse,
  MicrosoftLicense,
  PricingEstimatePayload,
  PricingEstimateResponse,
  PrivilegedRoleOption,
  PrivilegedRoleRequestPayload,
  PurchaseClonePayload,
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

/** List Microsoft licenses available in the configured Azure tenant. */
export async function getMicrosoftLicenses(): Promise<MicrosoftLicense[]> {
  const response = await azureRequest<{
    success: boolean;
    licenses: MicrosoftLicense[];
  }>(cloudAutomationPath('/azure/licenses'));
  return response.licenses ?? [];
}

/** Load prefilled purchase form data from a test_ids purchase email token. */
export async function getPurchaseClonePayload(token: string): Promise<PurchaseClonePayload> {
  const params = new URLSearchParams({ token });
  const response = await azureRequest<{ success: boolean; data: PurchaseClonePayload; message?: string }>(
    `${cloudAutomationPath('/purchase-intent/clone')}?${params.toString()}`
  );
  if (!response?.data) {
    throw new ApiError(response?.message || 'Unable to load purchase details from this link.', 404);
  }
  return response.data;
}

/** Record Yes/No response from the purchase intent email. */
export async function respondToPurchaseIntent(
  token: string,
  responseValue: 'yes' | 'no'
): Promise<{ requestId: number; response: string; alreadyHandled?: boolean }> {
  return azureRequest(cloudAutomationPath('/purchase-intent/respond'), {
    method: 'POST',
    body: JSON.stringify({ token, response: responseValue }),
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

/** List assignable privileged Azure RBAC roles (Owner excluded). */
export async function listPrivilegedRoles(): Promise<PrivilegedRoleOption[]> {
  const response = await azureRequest<{ success: boolean; roles: PrivilegedRoleOption[] }>(
    cloudAutomationPath('/privileged-role-requests/roles')
  );
  return response.roles ?? [];
}

/** Submit a privileged role request for org-admin approval. */
export async function createPrivilegedRoleRequest(
  payload: PrivilegedRoleRequestPayload
): Promise<{ success: boolean; request: unknown }> {
  return azureRequest(cloudAutomationPath('/privileged-role-requests'), {
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
  resourceGroupCount?: number | null;
  accountCount?: number | null;
  complete?: boolean;
  remaining?: number;
  resourcesProvisioned?: number;
  resourcesSkipped?: number;
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

/** POST /api/provision/request/:id/fabric — Fabric capacity/workspace/roles for DP-600/DP-700 */
export async function provisionFabric(requestId: number): Promise<ProvisionStepStatus> {
  return azureRequest<ProvisionStepStatus>(
    cloudAutomationPath(`/provision/request/${requestId}/fabric`),
    { method: 'POST' }
  );
}

/** GET /api/provision/request/:id/fabric */
export async function getProvisionFabric(requestId: number) {
  return azureRequest<{
    success: boolean;
    required: boolean;
    complete: boolean;
    status?: string;
    workspaceId?: string | null;
    capacityId?: string | null;
    workspaceName?: string | null;
    workspaceRole?: string | null;
    onelakePermissions?: string | null;
    items?: unknown[];
    roleAssignments?: unknown[];
    certTag?: string | null;
    errorMessage?: string | null;
  }>(cloudAutomationPath(`/provision/request/${requestId}/fabric`));
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
  const isTenant = isTenantPortalClient();
  const token = getTenantAccessToken() || getAccessToken();
  const gatewayBase = getGatewayBaseUrl();
  const response = await fetch(
    `${gatewayBase}${getAzureCloudApiPrefix()}/provision/request/${requestId}/credentials/spreadsheet`,
    {
      method: 'GET',
      credentials: isTenant ? 'omit' : 'include',
      headers: {
        ...(isTenant ? getTenantGatewayIdentityHeaders(gatewayBase) : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
  const [
    requestResult,
    provisionResult,
    servicesResult,
    usersResult,
    rolesResult,
    fabricResult,
    credentialsResult,
  ] = await Promise.allSettled([
    getRequestById(requestId),
    getProvisionStatus(requestId),
    getProvisionServices(requestId),
    getProvisionUsers(requestId),
    getProvisionRoles(requestId),
    getProvisionFabric(requestId),
    getProvisionCredentials(requestId),
  ]);

  const request = readSnapshotPart(requestResult, null);
  const provisionRaw = readSnapshotPart(provisionResult, { success: false });
  const servicesRaw = readSnapshotPart(servicesResult, { success: false, resources: [] });
  const usersRaw = readSnapshotPart(usersResult, { success: false, users: [] });
  const rolesRaw = readSnapshotPart(rolesResult, { success: false, roles: [] });
  const fabricRaw = readSnapshotPart(fabricResult, {
    success: false,
    required: false,
    complete: true,
    status: 'skipped',
  });
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
      resourceGroupCount:
        typeof provisionRaw.resourceGroupCount === 'number'
          ? provisionRaw.resourceGroupCount
          : null,
      accountCount:
        typeof provisionRaw.accountCount === 'number' ? provisionRaw.accountCount : null,
      complete: provisionRaw.complete === true,
    },
    services: {
      resources: servicesResources,
      count: servicesRaw.count ?? servicesResources.length,
      complete: servicesRaw.complete === true,
    },
    users: {
      users,
      count: usersRaw.count ?? users.length,
      complete: usersRaw.complete === true,
    },
    roles: {
      roles,
      count: rolesRaw.count ?? roles.length,
      complete: rolesRaw.complete === true,
      remaining:
        typeof rolesRaw.remaining === 'number' ? rolesRaw.remaining : undefined,
    },
    fabric: {
      required: fabricRaw.required === true,
      complete: fabricRaw.required === true ? fabricRaw.complete === true : true,
      status: fabricRaw.status ?? null,
      workspaceId: fabricRaw.workspaceId ?? null,
      capacityId: fabricRaw.capacityId ?? null,
      workspaceName: fabricRaw.workspaceName ?? null,
      workspaceRole: fabricRaw.workspaceRole ?? null,
      onelakePermissions: fabricRaw.onelakePermissions ?? null,
      items: Array.isArray(fabricRaw.items) ? fabricRaw.items : [],
      roleAssignments: Array.isArray(fabricRaw.roleAssignments)
        ? fabricRaw.roleAssignments
        : [],
      certTag: fabricRaw.certTag ?? null,
      errorMessage: fabricRaw.errorMessage ?? null,
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
