import { apiRequest } from './apiClient';
import type { AccessScheduleInput } from './accessSchedule';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const BASE = '/api/v1/super-admin/vm-inventory';

/**
 * `inventory` means the machine was added straight to the inventory via the
 * Excel upload and is assigned out from here. `imported` is reserved for the
 * external-server import, which is not built yet.
 */
export type InventorySource = 'inventory' | 'platform_vm' | 'catalog_vm' | 'dedicated_server';
export type AssigneeType = 'platform_user' | 'tenant_user';
export type VmType = 'rdp' | 'ssh' | 'vnc';
export type PlanDuration = 'hourly' | 'monthly' | 'quarterly' | 'yearly';

export const PLAN_DURATIONS: PlanDuration[] = ['hourly', 'monthly', 'quarterly', 'yearly'];

export const SOURCE_LABELS: Record<InventorySource, string> = {
  inventory: 'Inventory',
  platform_vm: 'VPS',
  catalog_vm: 'VM Catalog',
  dedicated_server: 'Dedicated',
};

export interface InventoryAssignmentView {
  assignmentId: string;
  assigneeType: AssigneeType;
  assigneeId: string;
  email: string | null;
  username: string | null;
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  clientStartDate: string | null;
  clientEndDate: string | null;
  accessOverride: boolean;
  accessOverrideUntil: string | null;
}

export interface InventoryCredentialView {
  credentialId: string | null;
  source: InventorySource;
  username: string | null;
  hasPassword: boolean;
  canReveal: boolean;
  assignments: InventoryAssignmentView[];
}

export interface InventoryOwnerView {
  adminId: string | null;
  adminEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
}

export interface VmInventoryRow {
  ipAddress: string;
  sources: InventorySource[];
  serverId: string | null;
  vmType: string | null;
  vmSpec: string | null;
  planDuration: string | null;
  provider: string | null;
  providerStartDate: string | null;
  providerEndDate: string | null;
  inventoryLocked: boolean;
  owner: InventoryOwnerView;
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  clientStartDate: string | null;
  clientEndDate: string | null;
  credentials: InventoryCredentialView[];
}

export interface VmInventoryListResult {
  rows: VmInventoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListInventoryQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  source?: InventorySource;
  projectId?: string;
  adminId?: string;
  tenantId?: string;
  assigned?: 'assigned' | 'unassigned';
  locked?: boolean;
}

export async function fetchVmInventory(
  query: ListInventoryQuery = {},
  signal?: AbortSignal
): Promise<VmInventoryListResult> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiRequest<ApiEnvelope<VmInventoryListResult>>(`${BASE}${suffix}`, {
    ...(signal ? { signal } : {}),
  });
  return res.data;
}

export async function revealCredentialPassword(
  credentialId: string
): Promise<{ username: string; password: string }> {
  const res = await apiRequest<ApiEnvelope<{ username: string; password: string }>>(
    `${BASE}/credentials/${encodeURIComponent(credentialId)}/password`
  );
  return res.data;
}

export async function updateInventoryServer(
  serverId: string,
  body: {
    vmType?: VmType;
    vmSpec?: string | null;
    planDuration?: PlanDuration | null;
    provider?: string | null;
    providerStartDate?: string | null;
    providerEndDate?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  await apiRequest<ApiEnvelope<void>>(`${BASE}/servers/${encodeURIComponent(serverId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function upsertInventoryCredential(
  serverId: string,
  body: { credentialId?: string; username: string; password?: string }
): Promise<{ credentialId: string }> {
  const res = await apiRequest<ApiEnvelope<{ credentialId: string }>>(
    `${BASE}/servers/${encodeURIComponent(serverId)}/credentials`,
    { method: 'POST', body: JSON.stringify(body) }
  );
  return res.data;
}

export async function setInventoryServerLock(
  serverId: string,
  inventoryLocked: boolean
): Promise<void> {
  await apiRequest<ApiEnvelope<void>>(`${BASE}/servers/${encodeURIComponent(serverId)}/lock`, {
    method: 'PATCH',
    body: JSON.stringify({ inventoryLocked }),
  });
}

export async function deleteInventoryServer(serverId: string): Promise<void> {
  await apiRequest<ApiEnvelope<void>>(`${BASE}/servers/${encodeURIComponent(serverId)}`, {
    method: 'DELETE',
  });
}

/** One server the bulk delete refused to touch, and why. */
export interface BulkDeleteSkip {
  serverId: string;
  ipAddress: string | null;
  reason: string;
}

export interface BulkDeleteResult {
  deleted: number;
  skipped: BulkDeleteSkip[];
}

export async function bulkDeleteInventoryServers(
  serverIds: string[]
): Promise<BulkDeleteResult> {
  const res = await apiRequest<ApiEnvelope<BulkDeleteResult>>(`${BASE}/servers/bulk-delete`, {
    method: 'POST',
    body: JSON.stringify({ serverIds }),
  });
  return res.data;
}

export async function assignCredential(body: {
  credentialId: string;
  assigneeType: AssigneeType;
  assigneeId: string;
  projectId: string;
}): Promise<{ assignmentId: string }> {
  const res = await apiRequest<ApiEnvelope<{ assignmentId: string }>>(`${BASE}/assignments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function revokeAssignment(assignmentId: string): Promise<void> {
  await apiRequest<ApiEnvelope<void>>(`${BASE}/assignments/${encodeURIComponent(assignmentId)}`, {
    method: 'DELETE',
  });
}

export async function setAssignmentOverride(
  assignmentId: string,
  body: { accessOverride: boolean; accessOverrideUntil?: string | null }
): Promise<void> {
  await apiRequest<ApiEnvelope<void>>(
    `${BASE}/assignments/${encodeURIComponent(assignmentId)}/override`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
}

export async function mapInventoryOwner(body: {
  source: InventorySource;
  sourceId: string;
  adminId?: string | null;
  tenantId?: string | null;
}): Promise<void> {
  await apiRequest<ApiEnvelope<void>>(`${BASE}/map-owner`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ── Bulk assign (Server Assign page) ───────────────────────────────────────

export interface BulkAssignRowResult {
  index: number;
  credentialId: string;
  ipAddress: string | null;
  username: string | null;
  email: string;
  password: string | null;
  status: 'assigned' | 'ready' | 'failed';
  error?: string;
}

export interface BulkAssignResult {
  rows: BulkAssignRowResult[];
  summary: { total: number; assigned: number; ready: number; failed: number };
  projectName: string;
  dryRun: boolean;
}

export interface BulkAssignBody {
  credentialIds: string[];
  targetType: 'admin' | 'tenant';
  targetId: string;
  projectId: string;
  emailPrefix: string;
  passwordMode: 'auto' | 'shared';
  sharedPassword?: string;
  accessSchedule?: AccessScheduleInput | null;
  dryRun: boolean;
}

export async function bulkAssignInventory(body: BulkAssignBody): Promise<BulkAssignResult> {
  const res = await apiRequest<ApiEnvelope<BulkAssignResult>>(`${BASE}/bulk-assign`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data;
}

/**
 * Numbered emails from a base address: ("labuser@gmail.com", 3) → "labuser3@gmail.com".
 * Must stay identical to `buildSeriesEmail` on the server so the preview is truthful.
 */
export function buildSeriesEmail(base: string, index: number): string {
  const at = base.lastIndexOf('@');
  if (at <= 0) return '';
  return `${base.slice(0, at)}${index}${base.slice(at)}`;
}

export interface InventoryAssigneeOption {
  id: string;
  assigneeType: AssigneeType;
  email: string;
  username: string | null;
}

export async function fetchInventoryAssignees(params: {
  adminId?: string;
  tenantId?: string;
}): Promise<InventoryAssigneeOption[]> {
  const qs = new URLSearchParams();
  if (params.adminId) qs.set('adminId', params.adminId);
  if (params.tenantId) qs.set('tenantId', params.tenantId);
  const res = await apiRequest<ApiEnvelope<{ assignees: InventoryAssigneeOption[] }>>(
    `${BASE}/assignees?${qs.toString()}`
  );
  return res.data.assignees;
}

export interface InventoryProjectOption {
  id: string;
  name: string;
  clientName: string;
  startDate: string;
  endDate: string;
}

export async function fetchInventoryProjects(params: {
  adminId?: string;
  tenantId?: string;
}): Promise<InventoryProjectOption[]> {
  const qs = new URLSearchParams();
  if (params.adminId) qs.set('adminId', params.adminId);
  if (params.tenantId) qs.set('tenantId', params.tenantId);
  const res = await apiRequest<ApiEnvelope<{ projects: InventoryProjectOption[] }>>(
    `${BASE}/projects?${qs.toString()}`
  );
  return res.data.projects;
}

export interface ImportRowPayload {
  ipAddress: string;
  vmType?: string | null;
  vmSpec?: string | null;
  planDuration?: string | null;
  provider?: string | null;
  username?: string | null;
  password?: string | null;
  providerStartDate?: string | null;
  providerEndDate?: string | null;
}

export interface ImportRowResult {
  index: number;
  ipAddress: string;
  action: 'created' | 'updated' | 'credential_added' | 'skipped' | 'failed';
  error?: string;
  note?: string;
}

export interface ImportResult {
  results: ImportRowResult[];
  summary: {
    total: number;
    created: number;
    updated: number;
    credentialsAdded: number;
    skipped: number;
    failed: number;
  };
}

/**
 * Preview (`dryRun: true`) and commit (`dryRun: false`) run the same server-side
 * code path, so an approved preview matches exactly what gets written.
 */
export async function importInventoryRows(
  rows: ImportRowPayload[],
  dryRun: boolean
): Promise<ImportResult> {
  const res = await apiRequest<ApiEnvelope<ImportResult>>(`${BASE}/import`, {
    method: 'POST',
    body: JSON.stringify({ rows, dryRun }),
  });
  return res.data;
}
