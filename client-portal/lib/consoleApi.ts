import { apiRequest, getAccessToken } from './apiClient';
import { getGatewayBaseUrl, getTenantGatewayIdentityHeaders } from './gatewayUrl';

/**
 * VM console (Guacamole) API.
 *
 * Backend reference:
 *   GET  /api/v1/vms/:vmId/console?protocol=rdp|ssh|vnc
 *   POST /api/v1/vms/:vmId/console/close
 *
 * The returned clientUrl points at GUACAMOLE_PUBLIC_URL (the nginx-proxied
 * Guacamole web app) and contains a hash fragment of the form:
 *   https://<host>/guacamole/#/client/<base64>?token=<auth>
 *
 * IMPORTANT: clientUrl must be passed verbatim to an <iframe src>.
 * Do NOT encode it, do NOT pass it through next/navigation router —
 * both will strip or mangle the hash fragment.
 */

export type ConsoleProtocol = 'rdp' | 'ssh' | 'vnc';

export interface ConsoleSession {
  clientUrl: string;
  connectionId: string;
  protocol: ConsoleProtocol;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ConsoleDimensions {
  width?: number;
  height?: number;
}

export function platformVmConsoleClosePath(vmId: string): string {
  return `/api/v1/vms/${encodeURIComponent(vmId)}/console/close`;
}

export function tenantVmConsoleClosePath(vmId: string): string {
  return `/api/v1/tenant-vms/${encodeURIComponent(vmId)}/console/close`;
}

/**
 * Request a Guacamole console session for a VM.
 *
 * Uses the shared apiClient — sends auth headers, handles 401 refresh.
 * Throws ApiError on failure; callers should render a user-friendly message.
 *
 * Pass the browser's actual viewport dimensions (window.innerWidth /
 * window.innerHeight) so Guacamole renders at native resolution instead of
 * scaling — sharper text, no blur.
 */
export async function getConsoleSession(
  vmId: string,
  protocol: ConsoleProtocol,
  dimensions?: ConsoleDimensions
): Promise<ConsoleSession> {
  const params = new URLSearchParams({ protocol });
  if (dimensions?.width) params.set('width', String(Math.round(dimensions.width)));
  if (dimensions?.height) params.set('height', String(Math.round(dimensions.height)));

  const res = await apiRequest<ApiResponse<ConsoleSession>>(
    `/api/v1/vms/${vmId}/console?${params.toString()}`
  );
  return res.data;
}

/**
 * Fire-and-forget server-side Guacamole tunnel kill. Safe on tab close / unmount.
 *
 * Uses fetch with keepalive when a Bearer token is available (sendBeacon cannot
 * set Authorization). Falls back to sendBeacon for cookie-only flows.
 */
export function closeConsoleSessionAtPath(
  closePath: string,
  options?: { accessToken?: string | null; tenantPortal?: boolean }
): void {
  if (typeof window === 'undefined') return;

  const apiBase = getGatewayBaseUrl();
  const url = `${apiBase}${closePath}`;
  const token =
    options && 'accessToken' in options ? options.accessToken : getAccessToken();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.tenantPortal) {
    Object.assign(headers, getTenantGatewayIdentityHeaders(apiBase));
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!token && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(url, new Blob([], { type: 'application/json' }));
    return;
  }

  void fetch(url, {
    method: 'POST',
    headers,
    credentials: options?.tenantPortal ? 'omit' : 'include',
    keepalive: true,
  }).catch(() => {
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([], { type: 'application/json' }));
    }
  });
}

/** Kill platform VM console tunnels for `vmId`. */
export function closeConsoleSession(vmId: string): void {
  closeConsoleSessionAtPath(platformVmConsoleClosePath(vmId));
}
