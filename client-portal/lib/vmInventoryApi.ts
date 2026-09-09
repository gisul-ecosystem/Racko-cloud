import { apiRequest } from './apiClient';
import type { AccessScheduleInput } from './accessSchedule';
import type { IJob } from './machineManagerApi';

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
  /** Plaintext. Null with `hasPassword` true means it would not decrypt. */
  password: string | null;
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
  /** Parent catalog VM, when this IP came from the VM catalog. */
  catalogVmId: string | null;
  /** Machines in that purchase; deleting removes all of them together. */
  catalogQuantity: number | null;
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
  clientName?: string;
  /** A user holding an assignment on one of the row's logins. */
  assigneeId?: string;
  vmSpec?: string;
  assigned?: 'assigned' | 'unassigned';
  locked?: boolean;
}

export interface InventoryFilterOptions {
  owners: Array<{ type: 'admin' | 'tenant'; id: string; label: string }>;
  projects: Array<{ id: string; name: string; clientName: string }>;
  clients: string[];
  assignees: Array<{ id: string; label: string }>;
  vmSpecs: string[];
}

/** Only lists values present in the inventory, so no filter yields nothing. */
export async function fetchInventoryFilterOptions(
  signal?: AbortSignal
): Promise<InventoryFilterOptions> {
  const res = await apiRequest<ApiEnvelope<InventoryFilterOptions>>(`${BASE}/filter-options`, {
    ...(signal ? { signal } : {}),
  });
  return res.data;
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

/** One VM the reset reached, keyed by IP and by its Machine Manager record. */
export interface ResetTarget {
  ipAddress: string;
  machineId: string;
  machineName: string;
}

export interface BulkResetResult {
  /** Session to follow on the machine-manager reset stream. */
  sessionId: string;
  accepted: ResetTarget[];
  offline: ResetTarget[];
  /** IPs with no Racko agent installed, so nothing to reset. */
  notManaged: string[];
}

export async function bulkResetInventoryServers(serverIds: string[]): Promise<BulkResetResult> {
  const res = await apiRequest<ApiEnvelope<BulkResetResult>>(`${BASE}/servers/bulk-reset`, {
    method: 'POST',
    body: JSON.stringify({ serverIds }),
  });
  return res.data;
}

/** One VM an agent push was started on. */
export interface PushAgentTarget {
  ipAddress: string;
  machineId: string;
  machineName: string;
  os: string;
  /** The inventory login the push authenticated with. */
  username: string;
}

export interface PushAgentResult {
  /** Session to follow on the machine-manager push stream. */
  sessionId: string;
  targets: PushAgentTarget[];
  /** VMs whose agent is already installed and connected, so nothing was pushed. */
  alreadyOnline: Array<{ ipAddress: string; machineId: string; machineName: string }>;
  /** VMs that could not be attempted, with the reason. */
  skipped: Array<{ ipAddress: string; reason: string }>;
}

/**
 * Installs the Racko agent on the selected VMs over WinRM or SSH, using the
 * login stored in the inventory. Returns as soon as the pushes are dispatched;
 * results arrive on the push stream.
 */
export async function pushInventoryAgent(
  serverIds: string[],
  installRackoApp: boolean
): Promise<PushAgentResult> {
  const res = await apiRequest<ApiEnvelope<PushAgentResult>>(`${BASE}/push-agent`, {
    method: 'POST',
    body: JSON.stringify({ serverIds, installRackoApp }),
  });
  return res.data;
}

export interface InventoryNotificationSettings {
  /** Alerted before a provider contract lapses. Empty means nobody is told. */
  providerExpiryRecipients: string[];
  /** How many days ahead the alert goes out, from server config. */
  warningDays: number;
}

export async function fetchInventoryNotificationSettings(): Promise<InventoryNotificationSettings> {
  const res = await apiRequest<ApiEnvelope<InventoryNotificationSettings>>(
    `${BASE}/notification-settings`
  );
  return res.data;
}

export async function updateInventoryNotificationSettings(
  providerExpiryRecipients: string[]
): Promise<InventoryNotificationSettings> {
  const res = await apiRequest<ApiEnvelope<InventoryNotificationSettings>>(
    `${BASE}/notification-settings`,
    {
      method: 'PUT',
      body: JSON.stringify({ providerExpiryRecipients }),
    }
  );
  return res.data;
}

/** One VM the install reached, with its live agent connection state. */
export interface InstallTarget {
  machineId: string;
  ipAddress: string;
  machineName: string;
  online: boolean;
}

export interface InstallSoftwareResult {
  /** Null when the run could not be saved; the installs still went ahead. */
  runId: string | null;
  /** One Machine Manager job per VM per software item, streamable by job id. */
  jobs: IJob[];
  targets: InstallTarget[];
  /** IPs with no Racko agent installed, so nothing to install on. */
  notManaged: string[];
}

/**
 * What the assign flow knows and the install endpoint otherwise wouldn't. Saved
 * on the run so the tracking view can say who the install was for.
 */
export interface InstallSoftwareContext {
  targetType?: 'admin' | 'tenant';
  targetId?: string;
  projectId?: string;
  assignedCount?: number;
  assigned?: Array<{ ipAddress: string; email: string }>;
  resetSummary?: string;
}

/**
 * Queues Machine Manager install jobs on the VMs behind the selected logins.
 * Logins that share an IP collapse to a single machine server-side.
 */
export async function installInventorySoftware(
  credentialIds: string[],
  softwareIds: string[],
  context?: InstallSoftwareContext
): Promise<InstallSoftwareResult> {
  const res = await apiRequest<ApiEnvelope<InstallSoftwareResult>>(`${BASE}/install-software`, {
    method: 'POST',
    body: JSON.stringify({ credentialIds, softwareIds, ...(context ? { context } : {}) }),
  });
  return res.data;
}

/** One past install batch, with its jobs rolled up by status. */
export interface InstallRunSummary {
  id: string;
  createdAt: string;
  projectName: string | null;
  clientName: string | null;
  targetLabel: string | null;
  targetType: 'admin' | 'tenant' | null;
  assignedCount: number | null;
  softwareNames: string[];
  vmCount: number;
  notManagedCount: number;
  resetSummary: string | null;
  jobTotal: number;
  pending: number;
  installing: number;
  success: number;
  failed: number;
  /** Jobs cleared from the Machine Manager since the run. */
  gone: number;
}

/** One VM as it stood when the run was queued. */
export interface InstallRunVm {
  ipAddress: string;
  vmUsername: string | null;
  email: string | null;
  notManaged: boolean;
}

/**
 * A run reopened for tracking. Extends `InstallSoftwareResult`'s shape so the
 * same progress panel renders a live install and a revisited one alike.
 */
export interface InstallRunDetail {
  id: string;
  createdAt: string;
  projectName: string | null;
  clientName: string | null;
  targetLabel: string | null;
  targetType: 'admin' | 'tenant' | null;
  assignedCount: number | null;
  softwareNames: string[];
  resetSummary: string | null;
  vms: InstallRunVm[];
  jobs: IJob[];
  targets: InstallTarget[];
  notManaged: string[];
}

export async function fetchInstallRuns(limit?: number): Promise<InstallRunSummary[]> {
  const query = limit ? `?limit=${limit}` : '';
  const res = await apiRequest<ApiEnvelope<{ runs: InstallRunSummary[] }>>(
    `${BASE}/install-runs${query}`
  );
  return res.data.runs;
}

export async function fetchInstallRun(runId: string): Promise<InstallRunDetail> {
  const res = await apiRequest<ApiEnvelope<InstallRunDetail>>(`${BASE}/install-runs/${runId}`);
  return res.data;
}

export interface BulkOverrideResult {
  /** Active assignments touched across the selected servers. */
  updated: number;
  servers: number;
  serversWithoutAssignments: number;
}

export async function bulkSetInventoryOverride(body: {
  serverIds: string[];
  accessOverride: boolean;
  accessOverrideUntil?: string | null;
}): Promise<BulkOverrideResult> {
  const res = await apiRequest<ApiEnvelope<BulkOverrideResult>>(`${BASE}/servers/bulk-override`, {
    method: 'POST',
    body: JSON.stringify(body),
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

/** What releasing one login actually changed. */
export interface UnassignResult {
  /** True when the lab user created for this login was removed with it. */
  userDeleted: boolean;
  /** True when the VM went back to the free pool. */
  serverFreed: boolean;
  /** Logins still assigned on that VM, which is why it kept its owner. */
  remainingLogins: number;
  owner: 'admin' | 'tenant' | 'free' | null;
}

/**
 * Releases one login: drops the grant and its portal access, removes the lab
 * user created for it, and frees the VM once no other login is assigned.
 */
export async function unassignCredential(assignmentId: string): Promise<UnassignResult> {
  const res = await apiRequest<ApiEnvelope<UnassignResult>>(
    `${BASE}/assignments/${encodeURIComponent(assignmentId)}`,
    { method: 'DELETE' }
  );
  return res.data;
}

export interface BulkUnassignResult {
  servers: number;
  loginsUnassigned: number;
  usersDeleted: number;
  serversFreed: number;
}

/** Releases every login on the selected VMs and returns them to the free pool. */
export async function bulkUnassignInventoryServers(
  serverIds: string[]
): Promise<BulkUnassignResult> {
  const res = await apiRequest<ApiEnvelope<BulkUnassignResult>>(`${BASE}/servers/bulk-unassign`, {
    method: 'POST',
    body: JSON.stringify({ serverIds }),
  });
  return res.data;
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
  /** Set when the users' portal copy differs from what was requested. */
  note?: string;
}

export interface BulkAssignBody {
  credentialIds: string[];
  targetType: 'admin' | 'tenant';
  targetId: string;
  projectId: string;
  /** Base address for the numbered series. Omit when `emails` is supplied. */
  emailPrefix?: string;
  /** Exact addresses, one per credential, instead of a generated series. */
  emails?: string[];
  passwordMode: 'auto' | 'shared' | 'per_row';
  sharedPassword?: string;
  /** One password per credential, from an uploaded file. Only for `per_row`. */
  passwords?: string[];
  accessSchedule?: AccessScheduleInput | null;
  dryRun: boolean;
}

/** One row of an uploaded assignment file, matched against the inventory. */
export interface ResolvedLoginRow {
  index: number;
  ipAddress: string;
  username: string;
  /** Null when the IP or username is not in the inventory. */
  credentialId: string | null;
  serverId: string | null;
  assigned: boolean;
  /** False means the file's VM password differs from the stored one. */
  vmPasswordMatches: boolean | null;
  error: string | null;
}

export interface ResolveLoginsResult {
  rows: ResolvedLoginRow[];
  summary: {
    total: number;
    resolved: number;
    unresolved: number;
    passwordMismatches: number;
  };
}

/**
 * Matches uploaded IP + username pairs to inventory logins. Resolving on the
 * server keeps the upload independent of the page's first-200 login list.
 */
export async function resolveInventoryLogins(
  rows: Array<{ ipAddress: string; username: string; vmPassword?: string | null }>
): Promise<ResolveLoginsResult> {
  const res = await apiRequest<ApiEnvelope<ResolveLoginsResult>>(`${BASE}/resolve-logins`, {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
  return res.data;
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
  /** Null when the project has no client dates set; it cannot be assigned yet. */
  startDate: string | null;
  endDate: string | null;
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
