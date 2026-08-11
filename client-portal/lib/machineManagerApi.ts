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
  trackingEnabled: boolean;
  trackingEnabledAt?: string;
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
  supportedOS: MachineOS[];
  installMethod: InstallMethod;
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  fileUrl?: string;
  fileName?: string;
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
  supportedOS: MachineOS[];
  installMethod: InstallMethod;
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  fileUrl?: string;
  fileName?: string;
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

/**
 * Enable or disable file tracking on one or more machines.
 * When enabled, the agent starts the filesystem watcher and activity log.
 * When disabled, the watcher stops — no more activity is recorded.
 */
export async function setMachineTracking(
  machineIds: string[],
  enabled: boolean
): Promise<IMachine[]> {
  const res = await apiRequest<ApiResponse<{ machines: IMachine[]; total: number }>>(
    '/api/v1/machines/tracking',
    { method: 'PATCH', body: JSON.stringify({ machineIds, enabled }) }
  );
  return res.data.machines;
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

// ─── Clone API ────────────────────────────────────────────────────────────────

export interface ActivityEvent {
  _id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
  sequence: number;
}

export async function fetchActivityLog(machineId: string): Promise<ActivityEvent[]> {
  const res = await apiRequest<{ success: boolean; data: { activities: ActivityEvent[]; total: number } }>(
    `/api/v1/machines/${machineId}/activity`
  );
  return res.data.activities;
}

export async function cloneMachineTo(
  sourceMachineId: string,
  targetMachineId: string
): Promise<{ sessionId: string }> {
  const res = await apiRequest<{ success: boolean; message: string; data: { sessionId: string } }>(
    `/api/v1/machines/${sourceMachineId}/clone-to/${targetMachineId}`,
    { method: 'POST' }
  );
  return res.data;
}

export async function issueCloneStreamTicket(
  sessionId: string
): Promise<{ streamTicket: string; expiresInSeconds: number }> {
  const res = await apiRequest<{ success: boolean; data: { streamTicket: string; expiresInSeconds: number } }>(
    '/api/v1/machines/clone-stream-ticket',
    { method: 'POST', body: JSON.stringify({ sessionId }) }
  );
  return res.data;
}

export function openCloneStatusStream(
  sessionId: string,
  streamTicket: string
): EventSource {
  const url = `${getSseGatewayBaseUrl()}/api/v1/machines/clone-stream/${sessionId}?ticket=${streamTicket}`;
  return new EventSource(url, { withCredentials: true });
}
