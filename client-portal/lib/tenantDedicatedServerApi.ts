import { tenantPortalRequest } from './tenantPortalApiClient';
import type {
  DedicatedConsoleSession,
  IDedicatedPlan,
  IDedicatedServer,
} from './dedicatedServerApi';

export type {
  DedicatedConsoleSession,
  DedicatedServerProtocol,
  DedicatedServerStatus,
  IDedicatedPlan,
  IDedicatedServer,
} from './dedicatedServerApi';

export { formatDedicatedStatus } from './dedicatedServerApi';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function fetchTenantDedicatedPlans(): Promise<IDedicatedPlan[]> {
  const res = await tenantPortalRequest<ApiEnvelope<{ plans: IDedicatedPlan[]; total: number }>>(
    '/api/v1/tenant-dedicated-servers/plans'
  );
  return res.data.plans;
}

export async function fetchTenantDedicatedServers(): Promise<IDedicatedServer[]> {
  const res = await tenantPortalRequest<ApiEnvelope<{ servers: IDedicatedServer[]; total: number }>>(
    '/api/v1/tenant-dedicated-servers/servers'
  );
  return res.data.servers;
}

export async function fetchTenantDedicatedServer(id: string): Promise<IDedicatedServer> {
  const res = await tenantPortalRequest<ApiEnvelope<{ server: IDedicatedServer }>>(
    `/api/v1/tenant-dedicated-servers/servers/${id}`
  );
  return res.data.server;
}

export async function submitTenantDedicatedServerRequest(opts: {
  planId: string;
  notes?: string;
}): Promise<IDedicatedServer> {
  const res = await tenantPortalRequest<ApiEnvelope<{ request: IDedicatedServer }>>(
    '/api/v1/tenant-dedicated-servers/requests',
    { method: 'POST', body: JSON.stringify(opts) }
  );
  return res.data.request;
}

export async function getTenantDedicatedServerConsole(
  id: string,
  dimensions?: { width?: number; height?: number }
): Promise<DedicatedConsoleSession> {
  const params = new URLSearchParams();
  if (dimensions?.width) params.set('width', String(Math.round(dimensions.width)));
  if (dimensions?.height) params.set('height', String(Math.round(dimensions.height)));
  const qs = params.toString() ? `?${params}` : '';
  const res = await tenantPortalRequest<ApiEnvelope<DedicatedConsoleSession>>(
    `/api/v1/tenant-dedicated-servers/servers/${id}/console${qs}`
  );
  return res.data;
}
