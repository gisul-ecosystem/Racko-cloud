import { apiRequest } from './apiClient';
import { getGatewayBaseUrl, getSseGatewayBaseUrl } from './gatewayUrl';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MachineOS = 'windows' | 'linux' | 'macos';
export type MachineStatus = 'pending' | 'online' | 'offline';
export type JobStatus = 'pending' | 'installing' | 'success' | 'failed' | 'retrying';
export type InstallMethod = 'apt' | 'brew' | 'choco' | 'winget' | 'msi' | 'exe' | 'zip' | 'script';

export interface IMachine {
  _id: string;
  name: string;
  ipAddress: string;
  os: MachineOS;
  agentId: string;
  accountToken: string;
  status: MachineStatus;
  adminId: string;
  lastSeen?: string;
  specs?: {
    hostname?: string;
    osVersion?: string;
    cpuCores?: number;
    ramGb?: number;
    diskGb?: number;
  };
  agentVersion?: string;
  rackoAppVersion?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IJob {
  _id: string;
  machineId: string;
  softwareIds: string[];
  softwareName: string;
  status: JobStatus;
  logs: string;
  attempts: number;
  adminId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ISoftwareCatalog {
  _id: string;
  name: string;
  version: string;
  iconUrl?: string;
  supportedOS: MachineOS[];
  installMethod: InstallMethod;
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  fileUrl?: string;
  fileName?: string;
  zipInstallScript?: string;
  installArgs?: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMachineDto {
  name: string;
  ipAddress: string;
  os: MachineOS;
}

export interface BulkCreateMachineDto {
  machines: CreateMachineDto[];
}

export interface CreateJobDto {
  machineIds: string[];
  softwareIds: string[];
}

export interface CreateSoftwareCatalogDto {
  name: string;
  version: string;
  iconUrl?: string;
  supportedOS: MachineOS[];
  installMethod: InstallMethod;
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  fileUrl?: string;
  fileName?: string;
  zipInstallScript?: string;
  installArgs?: string;
}

// ─── API response wrapper ─────────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// ─── Machine API ──────────────────────────────────────────────────────────────

export async function fetchMachines(): Promise<IMachine[]> {
  const res = await apiRequest<ApiResponse<{ machines: IMachine[]; total: number }>>(
    '/api/v1/machines'
  );
  return res.data.machines;
}

export async function fetchMachine(id: string): Promise<IMachine> {
  const res = await apiRequest<ApiResponse<{ machine: IMachine }>>(`/api/v1/machines/${id}`);
  return res.data.machine;
}

export async function createMachine(dto: CreateMachineDto): Promise<IMachine> {
  const res = await apiRequest<ApiResponse<{ machine: IMachine }>>('/api/v1/machines', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  return res.data.machine;
}

export async function bulkCreateMachines(machines: CreateMachineDto[]): Promise<IMachine[]> {
  const res = await apiRequest<ApiResponse<{ machines: IMachine[]; total: number }>>(
    '/api/v1/machines/bulk',
    { method: 'POST', body: JSON.stringify({ machines }) }
  );
  return res.data.machines;
}

export async function deleteMachine(id: string): Promise<void> {
  await apiRequest(`/api/v1/machines/${id}`, { method: 'DELETE' });
}

export async function bulkDeleteMachines(machineIds: string[]): Promise<{
  deleted: string[];
  failed: Array<{ machineId: string; error: string }>;
}> {
  const res = await apiRequest<ApiResponse<{
    deleted: string[];
    failed: Array<{ machineId: string; error: string }>;
  }>>('/api/v1/machines/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ machineIds }),
  });
  return res.data;
}

export async function execCommand(
  machineId: string,
  command: string
): Promise<{ output: string; exitCode: number }> {
  const res = await apiRequest<ApiResponse<{ output: string; exitCode: number }>>(
    `/api/v1/machines/${machineId}/exec`,
    { method: 'POST', body: JSON.stringify({ command }) }
  );
  return res.data;
}

// ─── Job API ──────────────────────────────────────────────────────────────────

export async function createJobs(dto: CreateJobDto): Promise<IJob[]> {
  const res = await apiRequest<ApiResponse<{ jobs: IJob[]; total: number }>>(
    '/api/v1/machines/jobs',
    { method: 'POST', body: JSON.stringify(dto) }
  );
  return res.data.jobs;
}

export async function fetchJobs(): Promise<IJob[]> {
  const res = await apiRequest<ApiResponse<{ jobs: IJob[]; total: number }>>(
    '/api/v1/machines/jobs'
  );
  return res.data.jobs;
}

export async function fetchJob(id: string): Promise<IJob> {
  const res = await apiRequest<ApiResponse<{ job: IJob }>>(`/api/v1/machines/jobs/${id}`);
  return res.data.job;
}

export async function issueJobStreamTicket(jobId: string): Promise<{ streamToken: string; expiresIn: number }> {
  const res = await apiRequest<ApiResponse<{ streamToken: string; expiresIn: number }>>(
    `/api/v1/machines/jobs/${jobId}/stream-ticket`,
    { method: 'POST' }
  );
  return res.data;
}

// ─── Software Catalog API ─────────────────────────────────────────────────────

export async function fetchSoftwareCatalog(): Promise<ISoftwareCatalog[]> {
  const res = await apiRequest<ApiResponse<{ catalog: ISoftwareCatalog[]; total: number }>>(
    '/api/v1/software-catalog'
  );
  return res.data.catalog;
}

export async function createSoftwareCatalogEntry(
  dto: CreateSoftwareCatalogDto
): Promise<ISoftwareCatalog> {
  const res = await apiRequest<ApiResponse<{ software: ISoftwareCatalog }>>(
    '/api/v1/software-catalog',
    { method: 'POST', body: JSON.stringify(dto) }
  );
  return res.data.software;
}

export async function deleteSoftwareCatalogEntry(id: string): Promise<void> {
  await apiRequest(`/api/v1/software-catalog/${id}`, { method: 'DELETE' });
}

/**
 * Issues a presigned PUT URL so the browser can upload a software installer
 * directly to SeaweedFS without routing the file bytes through the API server.
 * Returns the storageRef to save as fileUrl in the catalog entry.
 */
export async function issueSoftwareCatalogUploadUrl(
  fileName: string,
  mimeType: string
): Promise<{ presignedUrl: string; storageRef: string; expiresIn: number }> {
  const res = await apiRequest<ApiResponse<{ presignedUrl: string; storageRef: string; expiresIn: number }>>(
    '/api/v1/software-catalog/upload-url',
    { method: 'POST', body: JSON.stringify({ fileName, mimeType }) }
  );
  return res.data;
}

// ─── VM Push API ──────────────────────────────────────────────────────────────

export interface VMPushTarget {
  name: string;
  ipAddress: string;
  os: MachineOS;
  username: string;
  password: string;
}

export interface VMPushResult {
  machineId: string;
  success: boolean;
  error?: string;
}

export async function pushAgentToVMs(
  vms: VMPushTarget[],
  sessionId: string,
  installRackoApp = true
): Promise<{ machines: IMachine[]; pushResults: VMPushResult[]; sessionId: string }> {
  const res = await apiRequest<ApiResponse<{ machines: IMachine[]; pushResults: VMPushResult[]; sessionId: string }>>(
    '/api/v1/machines/push-agent',
    { method: 'POST', body: JSON.stringify({ vms, sessionId, installRackoApp }) }
  );
  return res.data;
}

export async function issuePushStreamTicket(
  sessionId: string
): Promise<{ streamToken: string; expiresIn: number }> {
  const res = await apiRequest<ApiResponse<{ streamToken: string; expiresIn: number }>>(
    '/api/v1/machines/push-stream-ticket',
    { method: 'POST', body: JSON.stringify({ sessionId }) }
  );
  return res.data;
}

export function openPushStatusStream(
  sessionId: string,
  streamToken: string
): EventSource {
  const url = `${getSseGatewayBaseUrl()}/api/v1/machines/push-stream/${sessionId}?streamToken=${streamToken}`;
  return new EventSource(url, { withCredentials: true });
}

// ─── Push session recovery ────────────────────────────────────────────────────

export interface PushSessionMachineResult {
  machineId:          string;
  machineName:        string;
  ipAddress:          string;
  pushSuccess?:       boolean;
  pushError?:         string;
  agentConnected:     boolean;
  rackoAppInstalled?: boolean;
  rackoAppError?:     string;
}

export interface PushSessionState {
  sessionId: string;
  adminId:   string;
  machines:  PushSessionMachineResult[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetches persisted push session state from MongoDB.
 * Used to restore the Connection Status page after a browser refresh.
 * Returns null if session not found or expired (15-min TTL).
 */
export async function fetchPushSession(sessionId: string): Promise<PushSessionState | null> {
  try {
    const res = await apiRequest<ApiResponse<{ session: PushSessionState }>>(
      `/api/v1/machines/push-session/${sessionId}`
    );
    return res.data.session;
  } catch {
    return null;
  }
}

// ─── Enrollment Key API ───────────────────────────────────────────────────────

export async function fetchEnrollmentKey(): Promise<string> {
  const res = await apiRequest<ApiResponse<{ user: { enrollmentKey?: string } }>>(
    '/api/v1/auth/me'
  );
  return res.data.user.enrollmentKey ?? '';
}

// ─── Agent Download ───────────────────────────────────────────────────────────

/**
 * Step 1 (authenticated): issues a 60-second single-use download token.
 * Step 2 (public): browser navigates to the URL with ?dt=<token>.
 */
export async function issueAgentDownloadToken(
  machineId: string,
  os: MachineOS
): Promise<{ downloadToken: string; expiresInSeconds: number }> {
  const res = await apiRequest<ApiResponse<{ downloadToken: string; expiresInSeconds: number }>>(
    `/api/v1/machines/${machineId}/download-agent/token?os=${os}`,
    { method: 'POST' }
  );
  return res.data;
}

export function getAgentDownloadUrl(machineId: string, os: MachineOS): string {
  return `${getGatewayBaseUrl()}/api/v1/machines/${machineId}/download-agent?os=${os}`;
}

export function buildPublicDownloadUrl(downloadToken: string): string {
  return `${getGatewayBaseUrl()}/api/v1/machines/download-agent?dt=${downloadToken}`;
}

export function getEnrollmentAgentDownloadUrl(os: MachineOS): string {
  return `${getGatewayBaseUrl()}/api/v1/agent/download-enrollment?os=${os}`;
}

// ─── Reset API ────────────────────────────────────────────────────────────────

export async function resetMachines(
  machineIds: string[],
  sessionId: string
): Promise<{ accepted: string[]; offline: string[]; sessionId: string }> {
  const res = await apiRequest<ApiResponse<{ accepted: string[]; offline: string[]; sessionId: string }>>(
    '/api/v1/machines/reset',
    { method: 'POST', body: JSON.stringify({ machineIds, sessionId }) }
  );
  return res.data;
}

export async function issueResetStreamTicket(
  sessionId: string
): Promise<{ streamToken: string; expiresIn: number }> {
  const res = await apiRequest<ApiResponse<{ streamToken: string; expiresIn: number }>>(
    '/api/v1/machines/reset-stream-ticket',
    { method: 'POST', body: JSON.stringify({ sessionId }) }
  );
  return res.data;
}

export function openResetStatusStream(
  sessionId: string,
  streamToken: string
): EventSource {
  const url = `${getSseGatewayBaseUrl()}/api/v1/machines/reset-stream/${sessionId}?streamToken=${streamToken}`;
  return new EventSource(url, { withCredentials: true });
}

/**
 * Opens a reset status SSE stream with automatic reconnection and exponential backoff.
 *
 * Industry-standard pattern for long-running operations over SSE:
 * - Uses fetch + ReadableStream instead of native EventSource for reconnect control
 * - On any network error, waits with exponential backoff then reconnects
 * - Ticket is reusable within its TTL so reconnects don't need a new auth round-trip
 * - On reconnect, server checks MongoDB for persisted result and delivers it instantly
 * - Stops reconnecting once a terminal event (reset_complete) is received or max retries hit
 *
 * @param sessionId     The reset session ID
 * @param streamToken   The reusable stream ticket (valid for 15 minutes)
 * @param onEvent       Called for every parsed SSE event object
 * @param onTerminal    Called when a terminal event (reset_complete) is received
 * @param onGiveUp      Called when all retries are exhausted without a terminal event
 * @returns             A function to stop the stream (call on component unmount)
 */
export function openResetStatusStreamWithReconnect(
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
  // Track which machineIds have received reset_complete so we don't double-count on reconnect
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
                // Deduplicate — on reconnect the server replays all persisted results.
                // Only fire onEvent for machines not yet processed in this session.
                if (!completedMachines.has(event.machineId)) {
                  completedMachines.add(event.machineId);
                  onEvent(event);
                }

                // All expected machines done — stop cleanly
                if (completedMachines.size >= expectedCount) {
                  stopped = true;
                  onTerminal();
                  return;
                }
                // More machines still pending — keep stream open
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