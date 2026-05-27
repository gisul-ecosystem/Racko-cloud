import { apiRequest } from './apiClient';

/**
 * VM console (Guacamole) API.
 *
 * Backend reference:
 *   GET /api/v1/vms/:vmId/console?protocol=rdp|ssh|vnc
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

/**
 * Request a Guacamole console session for a VM.
 *
 * Uses the shared apiClient — sends auth headers, handles 401 refresh.
 * Throws ApiError on failure; callers should render a user-friendly message.
 */
export async function getConsoleSession(
  vmId: string,
  protocol: ConsoleProtocol
): Promise<ConsoleSession> {
  const res = await apiRequest<ApiResponse<ConsoleSession>>(
    `/api/v1/vms/${vmId}/console?protocol=${encodeURIComponent(protocol)}`
  );
  return res.data;
}

/**
 * Best-effort cleanup of a Guacamole connection when the user leaves
 * the console page. Fire-and-forget — never await in cleanup paths.
 *
 * NOTE: The backend cleanup route is not yet implemented. Guacamole
 * connections in core-api are upserted by name (`vm-<vmId>`), so they
 * are naturally replaced on the next openConsole call. This function
 * is a no-op placeholder until DELETE /api/v1/vms/console/:connectionId
 * is wired up.
 */
export async function closeConsoleSession(connectionId: string): Promise<void> {
  // Intentional no-op for now — see JSDoc above.
  void connectionId;
}
