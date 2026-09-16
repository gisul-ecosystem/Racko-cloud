import { tenantPortalRequest, getTenantAccessToken } from './tenantPortalApiClient';
import { closeConsoleSessionAtPath } from './consoleApi';
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

export async function bulkDeleteTenantExternalVMs(
  ids: string[]
): Promise<{ deleted: number }> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<{ deleted: number }>>('/api/v1/tenant-external-vms/bulk', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  );
}

export async function getTenantExternalVMConsole(
  id: string,
  dimensions?: { width?: number; height?: number }
): Promise<ExternalVMConsoleSession> {
  const params = new URLSearchParams();
  if (dimensions?.width) params.set('width', String(Math.round(dimensions.width)));
  if (dimensions?.height) params.set('height', String(Math.round(dimensions.height)));
  const qs = params.toString() ? `?${params.toString()}` : '';

  return unwrap(
    tenantPortalRequest<ApiEnvelope<ExternalVMConsoleSession>>(
      `/api/v1/tenant-external-vms/${id}/console${qs}`
    )
  );
}

export function tenantExternalVmConsoleClosePath(id: string): string {
  return `/api/v1/tenant-external-vms/${encodeURIComponent(id)}/console/close`;
}

export function closeTenantExternalVMConsole(id: string): void {
  closeConsoleSessionAtPath(tenantExternalVmConsoleClosePath(id), {
    accessToken: getTenantAccessToken(),
    tenantPortal: true,
  });
}

export async function fetchAvailableTenantExternalVMs(userId?: string): Promise<IExternalVM[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ externalVms: IExternalVM[]; total: number }>>(
      `/api/v1/tenant-external-vms/assign/available${qs}`
    )
  );
  return data.externalVms;
}

export async function fetchTenantExternalVMAssignCounts(): Promise<Record<string, number>> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ counts: Record<string, number> }>>(
      '/api/v1/tenant-external-vms/assign/counts'
    )
  );
  return data.counts;
}

export async function fetchAssignedTenantExternalVMsForUser(userId: string): Promise<IExternalVM[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ externalVms: IExternalVM[]; total: number }>>(
      `/api/v1/tenant-external-vms/assign/user/${userId}`
    )
  );
  return data.externalVms;
}

export async function assignTenantExternalVMs(
  userId: string,
  externalVmIds: string[],
  accessSchedule?: import('./accessSchedule').AccessScheduleInput
): Promise<{ assigned: number; skipped?: number }> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ assigned: number }>>('/api/v1/tenant-external-vms/assign', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        externalVmIds,
        ...(accessSchedule ? { accessSchedule } : {}),
      }),
    })
  );
  return data;
}

export type {
  BulkAssignExternalPairRow,
  BulkAssignExternalPairsDto,
  BulkAssignExternalPairsResult,
} from './externalVmApi';

export async function bulkAssignTenantExternalOneToOne(
  dto: import('./externalVmApi').BulkAssignExternalPairsDto
): Promise<import('./externalVmApi').BulkAssignExternalPairsResult> {
  const start = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ jobId: string }>>(
      '/api/v1/tenant-external-vms/assign/bulk',
      {
        method: 'POST',
        body: JSON.stringify(dto),
      }
    )
  );
  const { pollBulkAssignJob } = await import('./pollBulkAssignJob');
  type Pair = import('./externalVmApi').BulkAssignExternalPairRow;
  const done = await pollBulkAssignJob<Pair>(async () =>
    unwrap(
      tenantPortalRequest<
        ApiEnvelope<{
          job: {
            id: string;
            status: string;
            total: number;
            completed: number;
            failed: number;
            pending: number;
            errorMessage?: string;
          };
          assigned: number;
          failed: number;
          pairs: Pair[];
        }>
      >(`/api/v1/tenant-external-vms/assign/jobs/${start.jobId}`)
    )
  );
  return {
    assigned: done.assigned,
    failed: done.failed,
    pairs: done.pairs,
  };
}

export async function unassignTenantExternalVM(id: string, userId: string): Promise<void> {
  await tenantPortalRequest(
    `/api/v1/tenant-external-vms/assign/${id}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}

export async function updateTenantExternalVmSchedule(
  id: string,
  accessSchedule: import('./accessSchedule').AccessScheduleInput
): Promise<import('./accessSchedule').AccessSchedule> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<import('./accessSchedule').AccessSchedule>>(
      `/api/v1/tenant-external-vms/${id}/schedule`,
      { method: 'PATCH', body: JSON.stringify(accessSchedule) }
    )
  );
}

export async function updateTenantExternalVmOverride(
  id: string,
  body: { accessOverride: boolean; accessOverrideUntil?: string | null }
): Promise<import('./accessSchedule').AccessSchedule> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<import('./accessSchedule').AccessSchedule>>(
      `/api/v1/tenant-external-vms/${id}/override`,
      { method: 'PATCH', body: JSON.stringify(body) }
    )
  );
}

export async function bulkUpdateTenantExternalVmOverride(
  ids: string[],
  body: { accessOverride: boolean; accessOverrideUntil?: string | null }
): Promise<{ updated: number; results: Array<{ externalVmId: string; ok: boolean; error?: string }> }> {
  return unwrap(
    tenantPortalRequest<
      ApiEnvelope<{ updated: number; results: Array<{ externalVmId: string; ok: boolean; error?: string }> }>
    >('/api/v1/tenant-external-vms/override/bulk', {
      method: 'PATCH',
      body: JSON.stringify({ ids, ...body }),
    })
  );
}

// ─── Console Session API (tenant) ────────────────────────────────────────────

/** Start a console session when the Guacamole iframe loads. Returns sessionId and endToken. */
export async function startTenantConsoleSession(serverId: string): Promise<{ sessionId: string; endToken: string }> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ sessionId: string; endToken: string }>>(
      '/api/v1/tenant-external-vms/sessions/start',
      { method: 'POST', body: JSON.stringify({ serverId }) }
    )
  );
  return { sessionId: data.sessionId, endToken: data.endToken };
}

/** Fire-and-forget heartbeat every 60s. Never throws — must not affect console. */
export async function heartbeatTenantConsoleSession(sessionId: string): Promise<void> {
  try {
    await tenantPortalRequest(
      `/api/v1/tenant-external-vms/sessions/${sessionId}/heartbeat`,
      { method: 'POST' }
    );
  } catch {
    // Non-fatal
  }
}

/** End session on disconnect (normal path). */
export async function endTenantConsoleSession(sessionId: string): Promise<void> {
  try {
    await tenantPortalRequest(
      `/api/v1/tenant-external-vms/sessions/${sessionId}/end`,
      { method: 'POST' }
    );
  } catch {
    // Non-fatal — stale sweeper will close it
  }
}

export interface TenantConsoleSessionEntry {
  _id: string;
  userId: string;
  userEmail: string;
  serverId: string;
  serverName: string;
  loginAt: string;
  logoutAt: string | null;
  lastHeartbeatAt: string;
  durationSeconds: number | null;
  isActive: boolean;
}

export interface TenantConsoleSessionSummary {
  sessionsToday: number;
  uniqueUsersToday: number;
  avgDurationSeconds: number;
  activeSessions: number;
}

export interface TenantConsoleSessionsResponse {
  sessions: TenantConsoleSessionEntry[];
  pagination: { total: number; page: number; limit: number; pages: number };
  summary: TenantConsoleSessionSummary;
}

export async function fetchTenantConsoleSessions(params?: {
  userId?: string;
  serverId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<TenantConsoleSessionsResponse> {
  const query = new URLSearchParams();
  if (params?.userId) query.set('userId', params.userId);
  if (params?.serverId) query.set('serverId', params.serverId);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantConsoleSessionsResponse>>(
      `/api/v1/tenant-external-vms/sessions${qs ? `?${qs}` : ''}`
    )
  );
}

export async function bulkDeleteTenantConsoleSessions(ids: string[]): Promise<{ deleted: number }> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<{ deleted: number }>>(
      '/api/v1/tenant-external-vms/sessions/bulk',
      { method: 'DELETE', body: JSON.stringify({ ids }) }
    )
  );
}
