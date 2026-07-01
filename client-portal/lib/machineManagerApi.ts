import { apiRequest } from './apiClient';
import { getGatewayBaseUrl } from './gatewayUrl';

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
  createdAt: string;
  updatedAt: string;
}

export interface IJob {
  _id: string;
  machineId: string;
  softwareIds: string[];
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
  vms: VMPushTarget[]
): Promise<{ machines: IMachine[]; pushResults: VMPushResult[] }> {
  const res = await apiRequest<ApiResponse<{ machines: IMachine[]; pushResults: VMPushResult[] }>>(
    '/api/v1/machines/push-agent',
    { method: 'POST', body: JSON.stringify({ vms }) }
  );
  return res.data;
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
