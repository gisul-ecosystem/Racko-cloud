import type { MachineOS, MachineStatus } from './machine-manager.model';
import type { JobStatus } from './machine-manager.model';

// ─── Machine DTOs ─────────────────────────────────────────────────────────────

export interface CreateMachineDto {
  name: string;
  ipAddress: string;
  os: MachineOS;
}

export interface BulkCreateMachineDto {
  machines: CreateMachineDto[];
}

export interface MachineResponse {
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

// ─── Job DTOs ─────────────────────────────────────────────────────────────────

export interface CreateJobDto {
  machineIds: string[];
  softwareIds: string[];
}

export interface JobResponse {
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

// ─── Agent DTOs ───────────────────────────────────────────────────────────────

export interface AgentRegisterDto {
  accountToken: string;
  hostname: string;
  mac: string;
  os: string;
  cpuId: string;
}

export interface AgentEnrollDto {
  enrollmentKey: string;
  hostname: string;
  mac: string;
  os: string;
  cpuId: string;
}

export interface AgentJobResultDto {
  agentId: string;
  status: JobStatus;
  logs: string;
}

export interface AgentHeartbeatDto {
  agentId: string;
  status: string;
}
