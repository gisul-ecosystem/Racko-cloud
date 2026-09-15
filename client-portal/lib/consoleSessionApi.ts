import { apiRequest } from './apiClient';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function startConsoleSession(serverId: string): Promise<string> {
  const res = await apiRequest<ApiResponse<{ sessionId: string }>>(
    '/api/v1/external-vms/sessions/start',
    { method: 'POST', body: JSON.stringify({ serverId }) }
  );
  return res.data.sessionId;
}

/** Fire-and-forget heartbeat. Never throws — console must never break due to this. */
export async function heartbeatConsoleSession(sessionId: string): Promise<void> {
  try {
    await apiRequest('/api/v1/external-vms/sessions/' + sessionId + '/heartbeat', {
      method: 'POST',
    });
  } catch {
    // Non-fatal — heartbeat failure must never affect the console experience
  }
}

/** End session via fetch (normal path). */
export async function endConsoleSession(sessionId: string): Promise<void> {
  try {
    await apiRequest('/api/v1/external-vms/sessions/' + sessionId + '/end', {
      method: 'POST',
    });
  } catch {
    // Non-fatal — session will be closed by stale sweeper anyway
  }
}

/**
 * End session via navigator.sendBeacon — the only reliable way to fire a
 * request on tab close (fetch is cancelled but sendBeacon is not).
 * Falls back to a fire-and-forget fetch on browsers that don't support sendBeacon.
 */
export function endConsoleSessionBeacon(sessionId: string, gatewayBaseUrl: string): void {
  const url = `${gatewayBaseUrl}/api/v1/external-vms/sessions/${sessionId}/end`;
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(url);
  } else {
    // Fallback
    void fetch(url, { method: 'POST', keepalive: true, credentials: 'include' }).catch(() => {});
  }
}

export interface ConsoleSessionEntry {
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

export interface ConsoleSessionSummary {
  sessionsToday: number;
  uniqueUsersToday: number;
  avgDurationSeconds: number;
  activeSessions: number;
}

export interface ConsoleSessionsResponse {
  sessions: ConsoleSessionEntry[];
  pagination: { total: number; page: number; limit: number; pages: number };
  summary: ConsoleSessionSummary;
}

export async function fetchConsoleSessions(params?: {
  userId?: string;
  serverId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<ConsoleSessionsResponse> {
  const query = new URLSearchParams();
  if (params?.userId) query.set('userId', params.userId);
  if (params?.serverId) query.set('serverId', params.serverId);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const res = await apiRequest<ApiResponse<ConsoleSessionsResponse>>(
    `/api/v1/external-vms/sessions${qs ? `?${qs}` : ''}`
  );
  return res.data;
}
