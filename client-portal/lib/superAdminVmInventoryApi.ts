import { apiRequest } from './apiClient';
import { getSseGatewayBaseUrl } from './gatewayUrl';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type InventoryResourceType = 'platform_vm' | 'catalog_vm' | 'external_vm';
export type InventoryOwnerScope = 'admin' | 'tenant';
export type InventoryStatus = 'provisioning' | 'active' | 'suspended' | 'failed' | 'deleted';

export interface SuperAdminVmInventoryItem {
  inventoryId: string;
  resourceType: InventoryResourceType;
  sourceCollection: 'vms' | 'catalog_vms' | 'external_vms';
  sourceId: string;
  name: string;
  ipAddress?: string;
  protocol?: 'rdp' | 'ssh';
  status: InventoryStatus;
  originServiceKey: 'vm-management' | 'create-vm' | 'external-vm';
  originServiceLabel: 'VPS Hosting' | 'VM Catalog' | 'External VM Import';
  originChannel: string;
  providerVmSpec?: string | null;
  providerPlanDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly' | null;
  providerUsername?: string | null;
  providerPassword?: string | null;
  providerStartDate?: string | null;
  providerEndDate?: string | null;
  ownerScope: InventoryOwnerScope;
  ownerAdminId?: string;
  ownerAdminEmail?: string;
  ownerTenantId?: string;
  ownerTenantName?: string;
  mappedTenantId?: string;
  mappedTenantName?: string;
  mappedTenantUserId?: string;
  mappedTenantUserEmail?: string;
  mappedAssignments: Array<{
    username: string;
    isTenantUser: boolean;
    tenantName?: string;
    planDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly' | null;
    vmUsername?: string | null;
    vmPassword?: string | null;
    providerStartDate?: string | null;
    providerEndDate?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  mappedUsers: string[];
  assignmentLocation: string;
  projectId?: string;
  projectName?: string;
  projectClientName?: string;
  orderId?: string;
  vmid?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SuperAdminVmInventoryListResult {
  items: SuperAdminVmInventoryItem[];
  owners: SuperAdminVmInventoryOwnerOption[];
  total: number;
  page: number;
  limit: number;
}

export interface SuperAdminVmInventoryOwnerOption {
  label: string;
  count: number;
}

export interface VmProviderMetadataImportRow {
  ipAddress: string;
  name?: string;
  vmSpec?: string;
  protocol?: 'rdp' | 'ssh';
  planDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly';
  username?: string;
  password?: string;
  providerStartDate?: string;
  providerEndDate?: string;
}

export interface VmProviderMetadataImportResult {
  total: number;
  updated: number;
  created: number;
}

export interface SuperAdminVmInventoryClearAssignmentBody {
  resourceType: InventoryResourceType;
  sourceId: string;
}

export interface SuperAdminVmInventoryClearAssignmentResult {
  updated: boolean;
  deletedPlatformUsers?: number;
  deletedTenantUsers?: number;
}

export interface SuperAdminVmInventoryDeleteAssignedUserResult {
  updated: boolean;
  deletedPlatformUsers: number;
  deletedTenantUsers: number;
}

export interface SuperAdminVmInventoryFreeVmResult {
  updated: boolean;
  deletedPlatformUsers: number;
  deletedTenantUsers: number;
  clearedAssignment: boolean;
  clearedOwner: boolean;
}

export interface SuperAdminVmInventoryQuery {
  resourceType?: InventoryResourceType;
  originServiceKey?: 'vm-management' | 'create-vm' | 'external-vm';
  ownerScope?: InventoryOwnerScope;
  tenantId?: string;
  adminId?: string;
  projectId?: string;
  status?: InventoryStatus;
  search?: string;
  ownerSearch?: string;
  sortBy?: 'createdAt' | 'owner' | 'service';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  createdFrom?: string;
  createdTo?: string;
}

export async function fetchSuperAdminVmInventory(
  query: SuperAdminVmInventoryQuery = {}
): Promise<SuperAdminVmInventoryListResult> {
  const params = new URLSearchParams();

  if (query.resourceType) params.set('resourceType', query.resourceType);
  if (query.originServiceKey) params.set('originServiceKey', query.originServiceKey);
  if (query.ownerScope) params.set('ownerScope', query.ownerScope);
  if (query.tenantId) params.set('tenantId', query.tenantId);
  if (query.adminId) params.set('adminId', query.adminId);
  if (query.projectId) params.set('projectId', query.projectId);
  if (query.status) params.set('status', query.status);
  if (query.search && query.search.trim()) params.set('search', query.search.trim());
  if (query.ownerSearch && query.ownerSearch.trim()) {
    params.set('ownerSearch', query.ownerSearch.trim());
  }
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDirection) params.set('sortDirection', query.sortDirection);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.createdFrom) params.set('createdFrom', query.createdFrom);
  if (query.createdTo) params.set('createdTo', query.createdTo);

  const qs = params.toString();
  const path = qs
    ? `/api/v1/super-admin/vm-inventory?${qs}`
    : '/api/v1/super-admin/vm-inventory';

  const res = await apiRequest<ApiEnvelope<SuperAdminVmInventoryListResult>>(path);
  return res.data;
}

export async function fetchSuperAdminVmInventoryOwners(
  query: Omit<SuperAdminVmInventoryQuery, 'ownerSearch' | 'page' | 'limit'> = {}
): Promise<SuperAdminVmInventoryOwnerOption[]> {
  const params = new URLSearchParams();

  if (query.resourceType) params.set('resourceType', query.resourceType);
  if (query.originServiceKey) params.set('originServiceKey', query.originServiceKey);
  if (query.ownerScope) params.set('ownerScope', query.ownerScope);
  if (query.tenantId) params.set('tenantId', query.tenantId);
  if (query.adminId) params.set('adminId', query.adminId);
  if (query.projectId) params.set('projectId', query.projectId);
  if (query.status) params.set('status', query.status);
  if (query.search && query.search.trim()) params.set('search', query.search.trim());
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDirection) params.set('sortDirection', query.sortDirection);
  if (query.createdFrom) params.set('createdFrom', query.createdFrom);
  if (query.createdTo) params.set('createdTo', query.createdTo);

  const qs = params.toString();
  const path = qs
    ? `/api/v1/super-admin/vm-inventory/owners?${qs}`
    : '/api/v1/super-admin/vm-inventory/owners';

  const res = await apiRequest<ApiEnvelope<{ owners: SuperAdminVmInventoryOwnerOption[] }>>(path);
  return res.data.owners;
}

export async function importVmProviderMetadata(
  rows: VmProviderMetadataImportRow[]
): Promise<VmProviderMetadataImportResult> {
  const res = await apiRequest<ApiEnvelope<VmProviderMetadataImportResult>>(
    '/api/v1/super-admin/vm-inventory/provider-metadata/import',
    {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }
  );
  return res.data;
}

export async function clearSuperAdminVmInventoryAssignment(
  body: SuperAdminVmInventoryClearAssignmentBody
): Promise<SuperAdminVmInventoryClearAssignmentResult> {
  const res = await apiRequest<ApiEnvelope<SuperAdminVmInventoryClearAssignmentResult>>(
    '/api/v1/super-admin/vm-inventory/assignment/clear',
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  );
  return res.data;
}

export async function deleteSuperAdminVmInventoryAssignedUser(
  body: SuperAdminVmInventoryClearAssignmentBody
): Promise<SuperAdminVmInventoryDeleteAssignedUserResult> {
  const res = await apiRequest<ApiEnvelope<SuperAdminVmInventoryDeleteAssignedUserResult>>(
    '/api/v1/super-admin/vm-inventory/assignment/delete-user',
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  );
  return res.data;
}

export async function freeSuperAdminVmInventoryAndDeleteUser(
  body: SuperAdminVmInventoryClearAssignmentBody
): Promise<SuperAdminVmInventoryFreeVmResult> {
  const res = await apiRequest<ApiEnvelope<SuperAdminVmInventoryFreeVmResult>>(
    '/api/v1/super-admin/vm-inventory/assignment/free-and-delete-user',
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  );
  return res.data;
}

// ─── Super-Admin Machine Reset API ────────────────────────────────────────────

export interface SuperAdminResetMachinesResult {
  accepted: string[]; // machineIds that will be reset
  offline: string[]; // machineIds that are offline
  sessionId: string;
  notFound: string[]; // inventoryIds that don't map to machines
}

export async function superAdminResetMachinesByInventory(
  inventoryIds: string[],
  sessionId: string
): Promise<SuperAdminResetMachinesResult> {
  const res = await apiRequest<ApiEnvelope<SuperAdminResetMachinesResult>>(
    '/api/v1/super-admin/machines/reset',
    {
      method: 'POST',
      body: JSON.stringify({ inventoryIds, sessionId }),
    }
  );
  return res.data;
}

export async function superAdminIssueResetStreamTicket(
  sessionId: string
): Promise<{ streamToken: string; expiresIn: number }> {
  const res = await apiRequest<ApiEnvelope<{ streamToken: string; expiresIn: number }>>(
    '/api/v1/super-admin/machines/reset-stream-ticket',
    {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }
  );
  return res.data;
}

export function superAdminOpenResetStatusStream(
  sessionId: string,
  streamToken: string
): EventSource {
  const url = `${getSseGatewayBaseUrl()}/api/v1/machines/reset-stream/${sessionId}?streamToken=${streamToken}`;
  return new EventSource(url, { withCredentials: true });
}

export function superAdminOpenResetStatusStreamWithReconnect(
  sessionId: string,
  streamToken: string,
  onEvent: (event: { type: string; machineId?: string; success?: boolean; error?: string }) => void,
  onTerminal: () => void,
  onGiveUp: () => void,
  expectedCount: number = 1,
): () => void {
  const BASE_DELAY_MS = 1_000;
  const MAX_DELAY_MS  = 30_000;
  const MAX_ATTEMPTS  = 10;

  let stopped = false;
  let attempt = 0;
  let currentController: AbortController | null = null;
  const completedMachines = new Set<string>();

  const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const connect = async () => {
    while (!stopped && attempt <= MAX_ATTEMPTS) {
      currentController = new AbortController();
      const url = `${getSseGatewayBaseUrl()}/api/v1/machines/reset-stream/${sessionId}?streamToken=${streamToken}`;

      try {
        const response = await fetch(url, {
          credentials: 'include',
          signal: currentController.signal,
          headers: { Accept: 'text/event-stream' },
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        attempt = 0;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;

            try {
              const event = JSON.parse(raw) as {
                type: string;
                machineId?: string;
                success?: boolean;
                error?: string;
              };

              if (event.type === 'reset_complete' && event.machineId) {
                if (!completedMachines.has(event.machineId)) {
                  completedMachines.add(event.machineId);
                  onEvent(event);
                }

                if (completedMachines.size >= expectedCount) {
                  stopped = true;
                  onTerminal();
                  return;
                }
              } else {
                onEvent(event);
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      } catch (err) {
        if (stopped) return;
        if (err instanceof Error && err.name === 'AbortError') return;
      }

      if (stopped) return;

      attempt++;
      if (attempt > MAX_ATTEMPTS) {
        onGiveUp();
        return;
      }

      const backoff = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      await delay(backoff);
    }
  };

  void connect();

  return () => {
    stopped = true;
    currentController?.abort();
  };
}
