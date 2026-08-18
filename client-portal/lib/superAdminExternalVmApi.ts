import { apiRequest } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface AssignmentScheduleDto {
  effectiveFrom: string;
  effectiveTo?: string | null;
  daysOfWeek: number[];
  dailyStart: string;
  dailyEnd: string;
  timezone: string;
}

export interface SuperAdminBulkImportAssignmentDto {
  userId?: string;
  tenantUserId?: string;
  userEmail?: string;
  userUsername?: string;
  tenantUserEmail?: string;
  schedule?: AssignmentScheduleDto;
}

export interface SuperAdminBulkImportInlineUserDto {
  name?: string;
  email: string;
  username: string;
  password: string;
}

/** Legacy row — target + optional assignments. */
export interface SuperAdminBulkImportLegacyRowDto {
  name: string;
  ip?: string;
  ipAddress?: string;
  protocol?: 'rdp' | 'ssh';
  username?: string;
  password: string;
  projectId?: string;
  target:
    | { tenantId: string }
    | { adminId: string }
    | { tenantSlug: string }
    | { adminEmail: string };
  assignments?: SuperAdminBulkImportAssignmentDto[];
}

/** Extended row — tenant by name, optional inline user create + schedule. */
export interface SuperAdminBulkImportExtendedRowDto {
  name: string;
  ip?: string;
  ipAddress?: string;
  protocol?: 'rdp' | 'ssh';
  username?: string;
  password: string;
  projectId?: string;
  tenantName: string;
  user?: SuperAdminBulkImportInlineUserDto;
  schedule?: AssignmentScheduleDto;
}

/** Extended row — admin by email, optional inline user create + schedule. */
export interface SuperAdminBulkImportExtendedAdminRowDto {
  name: string;
  ip?: string;
  ipAddress?: string;
  protocol?: 'rdp' | 'ssh';
  username?: string;
  password: string;
  adminEmail: string;
  user?: SuperAdminBulkImportInlineUserDto;
  schedule?: AssignmentScheduleDto;
}

export type SuperAdminBulkImportRowDto =
  | SuperAdminBulkImportLegacyRowDto
  | SuperAdminBulkImportExtendedRowDto
  | SuperAdminBulkImportExtendedAdminRowDto;

export interface SuperAdminBulkImportAssignmentResult {
  index: number;
  success: boolean;
  userId?: string;
  tenantUserId?: string;
  assignmentId?: string;
  error?: string;
}

export interface SuperAdminBulkImportRowResult {
  index: number;
  success: boolean;
  name?: string;
  ipAddress?: string;
  externalVmId?: string;
  tenantId?: string;
  tenantName?: string;
  userId?: string;
  userCreated?: boolean;
  userReused?: boolean;
  assignmentId?: string;
  error?: string;
  assignments: SuperAdminBulkImportAssignmentResult[];
}

export interface SuperAdminBulkImportResult {
  results: SuperAdminBulkImportRowResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

export interface SuperAdminExternalVmAssigneeView {
  assignmentId: string;
  stack: 'platform' | 'tenant';
  userId?: string;
  tenantUserId?: string;
  email: string | null;
  username: string | null;
  status: string;
  schedule: AssignmentScheduleDto | null;
  accessOverride?: boolean;
  accessOverrideUntil?: string | null;
}

export interface SuperAdminExternalVmOverviewRow {
  externalVmId: string;
  name: string;
  ipAddress: string;
  protocol: string;
  username: string;
  password: string;
  providerPlanDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly' | null;
  providerVmSpec?: string | null;
  providerUsername?: string | null;
  providerStartDate?: string | null;
  providerEndDate?: string | null;
  source: string;
  stack: 'platform' | 'tenant' | 'free';
  adminId: string | null;
  adminEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  assignedTo: string | null;
  assignedTenantUserId: string | null;
  assignments: SuperAdminExternalVmAssigneeView[];
  createdAt: string;
  updatedAt: string;
}

export interface SuperAdminAssigneeOption {
  id: string;
  email: string;
  username: string | null;
  role: string;
  isActive: boolean;
}

export interface SuperAdminTargetOption {
  id: string;
  label: string;
  email?: string | null;
  username?: string | null;
  slug?: string | null;
  name?: string | null;
}

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

export async function bulkImportSuperAdminExternalVms(
  vms: SuperAdminBulkImportRowDto[]
): Promise<SuperAdminBulkImportResult> {
  return unwrap(
    apiRequest<ApiEnvelope<SuperAdminBulkImportResult>>(
      '/api/v1/super-admin/external-vms/bulk-import',
      { method: 'POST', body: JSON.stringify({ vms }) }
    )
  );
}

export interface SuperAdminExternalVmOverviewResult {
  rows: SuperAdminExternalVmOverviewRow[];
  total: number;
}

/** GET /super-admin/external-vms/overview → { data: { rows, total } } */
export async function fetchSuperAdminExternalVmOverview(): Promise<
  SuperAdminExternalVmOverviewRow[]
> {
  const res = await apiRequest<ApiEnvelope<SuperAdminExternalVmOverviewResult>>(
    '/api/v1/super-admin/external-vms/overview'
  );
  return Array.isArray(res.data?.rows) ? res.data.rows : [];
}

export async function fetchSuperAdminExternalVmAssignees(params: {
  adminId?: string;
  tenantId?: string;
}): Promise<SuperAdminAssigneeOption[]> {
  const qs = new URLSearchParams();
  if (params.adminId) qs.set('adminId', params.adminId);
  if (params.tenantId) qs.set('tenantId', params.tenantId);
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ assignees: SuperAdminAssigneeOption[] }>>(
      `/api/v1/super-admin/external-vms/assignees?${qs.toString()}`
    )
  );
  return data.assignees;
}

export async function fetchSuperAdminExternalVmTargets(): Promise<{
  admins: SuperAdminTargetOption[];
  tenants: SuperAdminTargetOption[];
}> {
  return unwrap(
    apiRequest<ApiEnvelope<{ admins: SuperAdminTargetOption[]; tenants: SuperAdminTargetOption[] }>>(
      '/api/v1/super-admin/external-vms/targets'
    )
  );
}

/** Client-side schedule overlap (mirrors core-api schedulesOverlap). */
export function clientSchedulesOverlap(
  a: AssignmentScheduleDto,
  b: AssignmentScheduleDto
): boolean {
  const aFrom = a.effectiveFrom.slice(0, 10);
  const bFrom = b.effectiveFrom.slice(0, 10);
  const aTo = a.effectiveTo ? a.effectiveTo.slice(0, 10) : '9999-12-31';
  const bTo = b.effectiveTo ? b.effectiveTo.slice(0, 10) : '9999-12-31';
  if (aFrom > bTo || bFrom > aTo) return false;

  const sharedDays = a.daysOfWeek.filter((d) => b.daysOfWeek.includes(d));
  if (sharedDays.length === 0) return false;

  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const aStart = minutes(a.dailyStart);
  const aEnd = minutes(a.dailyEnd);
  const bStart = minutes(b.dailyStart);
  const bEnd = minutes(b.dailyEnd);
  const segs = (start: number, end: number): Array<[number, number]> =>
    end < start
      ? [
          [start, 24 * 60],
          [0, end],
        ]
      : [[start, end]];

  for (const [as, ae] of segs(aStart, aEnd)) {
    for (const [bs, be] of segs(bStart, bEnd)) {
      if (as < be && bs < ae) return true;
    }
  }
  return false;
}

export type CreateSuperAdminAssignmentBody = {
  userId?: string;
  tenantUserId?: string;
  schedule?: AssignmentScheduleDto | null;
};

export type PatchSuperAdminAssignmentBody = {
  schedule?: AssignmentScheduleDto | null;
  status?: 'active' | 'revoked';
  accessOverride?: boolean;
  accessOverrideUntil?: string | null;
};

export async function createSuperAdminExternalVmAssignment(
  externalVmId: string,
  body: CreateSuperAdminAssignmentBody
): Promise<SuperAdminExternalVmOverviewRow> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ row: SuperAdminExternalVmOverviewRow }>>(
      `/api/v1/super-admin/external-vms/${encodeURIComponent(externalVmId)}/assignments`,
      { method: 'POST', body: JSON.stringify(body) }
    )
  );
  return data.row;
}

export async function patchSuperAdminExternalVmAssignment(
  externalVmId: string,
  assignmentId: string,
  body: PatchSuperAdminAssignmentBody
): Promise<SuperAdminExternalVmOverviewRow> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ row: SuperAdminExternalVmOverviewRow }>>(
      `/api/v1/super-admin/external-vms/${encodeURIComponent(externalVmId)}/assignments/${encodeURIComponent(assignmentId)}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    )
  );
  return data.row;
}

export async function updateSuperAdminExternalVmProviderMetadata(body: {
  ipAddress: string;
  providerStartDate?: string | null;
  providerEndDate?: string | null;
  planDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly';
}): Promise<{ updated: boolean }> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ updated: boolean }>>('/api/v1/super-admin/vm-inventory/provider-metadata', {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  );
  return data;
}

export async function deleteSuperAdminExternalVmAssignment(
  externalVmId: string,
  assignmentId: string
): Promise<SuperAdminExternalVmOverviewRow> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ row: SuperAdminExternalVmOverviewRow }>>(
      `/api/v1/super-admin/external-vms/${encodeURIComponent(externalVmId)}/assignments/${encodeURIComponent(assignmentId)}`,
      { method: 'DELETE' }
    )
  );
  return data.row;
}

export interface SuperAdminExternalVmDeleteItemResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface SuperAdminExternalVmBulkDeleteResult {
  results: SuperAdminExternalVmDeleteItemResult[];
  summary: {
    total: number;
    deleted: number;
    failed: number;
  };
}

export async function deleteSuperAdminExternalVm(
  externalVmId: string
): Promise<SuperAdminExternalVmBulkDeleteResult> {
  return unwrap(
    apiRequest<ApiEnvelope<SuperAdminExternalVmBulkDeleteResult>>(
      `/api/v1/super-admin/external-vms/${encodeURIComponent(externalVmId)}`,
      { method: 'DELETE' }
    )
  );
}

/** Matches the server-side Zod cap on bulk-delete ids. */
const BULK_DELETE_CHUNK_SIZE = 500;

/** Small chunk size to keep each request well within the gateway timeout. */
export const BULK_DELETE_UI_CHUNK_SIZE = 25;

export async function bulkDeleteSuperAdminExternalVms(
  ids: string[]
): Promise<SuperAdminExternalVmBulkDeleteResult> {
  const aggregated: SuperAdminExternalVmBulkDeleteResult = {
    results: [],
    summary: { total: 0, deleted: 0, failed: 0 },
  };

  for (let i = 0; i < ids.length; i += BULK_DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_DELETE_CHUNK_SIZE);
    const res = await unwrap(
      apiRequest<ApiEnvelope<SuperAdminExternalVmBulkDeleteResult>>(
        '/api/v1/super-admin/external-vms/bulk-delete',
        { method: 'POST', body: JSON.stringify({ ids: chunk }) }
      )
    );
    aggregated.results.push(...res.results);
    aggregated.summary.total += res.summary.total;
    aggregated.summary.deleted += res.summary.deleted;
    aggregated.summary.failed += res.summary.failed;
  }

  return aggregated;
}
