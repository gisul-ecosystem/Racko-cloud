import type mongoose from 'mongoose';
import type { FlattenMaps } from 'mongoose';
import type { IVM } from '../vm/vm.model';
import type { VMStatus, JobVMCredential } from '../vm/vm.types';
import type {
  TenantVmSummary,
  TenantVmDetails,
  TenantVmAccessScheduleView,
  TenantVmAssignmentSummary,
} from '../tenantVm/tenantVm.types';
import { accessSchedulePublicView } from '../vmAccessSchedule/accessScheduleParse';

export interface PublicVmAssignment {
  assigneeId: string;
  email?: string;
  isActive?: boolean;
}

export interface PublicVmAccessSchedule {
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  override: boolean;
  overrideUntil: string | null;
  timezone: string;
  weeklySchedule: TenantVmAccessScheduleView['weeklySchedule'];
}

/** Contract-stable VM fields for all `/api/v1/public/*` list and detail responses. */
export interface PublicVm {
  id: string;
  name: string;
  description?: string;
  status: string;
  proxmoxStatus?: string;
  ipAddress?: string;
  networkType?: 'public' | 'private';
  cloneType?: 'dedicated_storage' | 'dynamic_storage';
  allocatedCpu: number;
  allocatedMemoryGb: number;
  allocatedDiskGb: number;
  consoleProtocol: 'rdp' | 'ssh';
  consoleReady: boolean;
  planStatus?: 'active' | 'expired' | null;
  planPeriodEnd?: string | null;
  billingPeriod?: 'monthly' | 'quarterly' | 'yearly' | null;
  assignment?: PublicVmAssignment | null;
  accessSchedule?: PublicVmAccessSchedule | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicVmLiveStatus {
  status: string;
  cpu?: VMStatus['cpu'];
  memory?: VMStatus['memory'];
  disk?: VMStatus['disk'];
  uptime?: VMStatus['uptime'];
  ipAddress?: string;
}

export interface PublicVmDetail {
  vm: PublicVm;
  liveStatus?: PublicVmLiveStatus;
}

/** VM rows returned on bulk job status (no credentials or provisioning internals). */
export interface PublicJobVmSummary {
  id: string;
  name: string;
  status: string;
  ipAddress?: string;
  consoleProtocol: 'rdp' | 'ssh';
}

function toIso(d: Date | string | undefined | null): string | null {
  if (d == null) return null;
  if (typeof d === 'string') return d;
  return d.toISOString();
}

function accessScheduleFromVm(
  vm: Pick<
    IVM,
    | 'accessStartDate'
    | 'accessEndDate'
    | 'accessStartTime'
    | 'accessEndTime'
    | 'accessOverride'
    | 'accessOverrideUntil'
    | 'weeklySchedule'
    | 'weeklyScheduleTz'
  >
): PublicVmAccessSchedule | null {
  const raw = accessSchedulePublicView(vm);
  const hasAny =
    raw.accessStartDate ||
    raw.accessEndDate ||
    raw.accessStartTime ||
    raw.accessEndTime ||
    raw.accessOverride ||
    raw.accessOverrideUntil ||
    (raw.weeklySchedule && raw.weeklySchedule.length > 0);
  if (!hasAny) return null;

  return {
    startDate: raw.accessStartDate
      ? new Date(raw.accessStartDate).toISOString().slice(0, 10)
      : null,
    endDate: raw.accessEndDate ? new Date(raw.accessEndDate).toISOString().slice(0, 10) : null,
    startTime: raw.accessStartTime ?? null,
    endTime: raw.accessEndTime ?? null,
    override: Boolean(raw.accessOverride),
    overrideUntil: raw.accessOverrideUntil
      ? new Date(raw.accessOverrideUntil).toISOString()
      : null,
    timezone: raw.weeklyScheduleTz || 'Asia/Kolkata',
    weeklySchedule: raw.weeklySchedule ?? null,
  };
}

function assignmentFromTenant(
  a: TenantVmAssignmentSummary | null | undefined
): PublicVmAssignment | null {
  if (!a) return null;
  return { assigneeId: a.tenantUserId, email: a.email, isActive: a.isActive };
}

function assignmentFromPlatformDoc(
  vm: FlattenMaps<IVM> | IVM
): PublicVmAssignment | null {
  const assignee = vm.assignedTenantUserId ?? vm.assignedTo;
  if (!assignee) return null;
  return { assigneeId: assignee.toString() };
}

export function publicVmFromTenantSummary(summary: TenantVmSummary): PublicVm {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    status: summary.status,
    proxmoxStatus: summary.proxmoxStatus,
    ipAddress: summary.ipAddress,
    cloneType: summary.cloneType,
    allocatedCpu: summary.allocatedCpu,
    allocatedMemoryGb: summary.allocatedMemoryGb,
    allocatedDiskGb: summary.allocatedDiskGb,
    consoleProtocol: summary.consoleProtocol,
    consoleReady: summary.consoleReady,
    planStatus: summary.planStatus ?? null,
    planPeriodEnd: toIso(summary.planPeriodEnd),
    billingPeriod: summary.billingPeriod ?? null,
    assignment: assignmentFromTenant(summary.assignment ?? null),
    accessSchedule: summary.accessSchedule ?? null,
    createdAt: toIso(summary.createdAt)!,
    updatedAt: toIso(summary.updatedAt)!,
  };
}

export function publicVmFromMongoLean(doc: FlattenMaps<IVM>): PublicVm {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    status: doc.status,
    proxmoxStatus: doc.proxmoxStatus,
    ipAddress: doc.ipAddress,
    networkType: doc.networkType,
    cloneType: doc.cloneType,
    allocatedCpu: doc.allocatedCpu,
    allocatedMemoryGb: doc.allocatedMemoryGb,
    allocatedDiskGb: doc.allocatedDiskGb,
    consoleProtocol: doc.consoleProtocol ?? 'rdp',
    consoleReady: doc.consoleReady ?? false,
    planStatus: doc.planStatus ?? null,
    planPeriodEnd: toIso(doc.planPeriodEnd),
    billingPeriod: doc.billingPeriod ?? null,
    assignment: assignmentFromPlatformDoc(doc),
    accessSchedule: accessScheduleFromVm(doc),
    createdAt: toIso(doc.createdAt)!,
    updatedAt: toIso(doc.updatedAt)!,
  };
}

export function publicVmLiveStatusFromVmStatus(status: VMStatus): PublicVmLiveStatus {
  return {
    status: status.status,
    cpu: status.cpu,
    memory: status.memory,
    disk: status.disk,
    uptime: status.uptime,
    ipAddress: status.ipAddress,
  };
}

export function publicVmDetailFromTenant(details: TenantVmDetails): PublicVmDetail {
  return {
    vm: publicVmFromTenantSummary(details.vm),
    liveStatus: details.liveStatus
      ? publicVmLiveStatusFromVmStatus(details.liveStatus)
      : undefined,
  };
}

export function publicVmDetailFromPlatform(
  doc: FlattenMaps<IVM>,
  liveStatus?: VMStatus
): PublicVmDetail {
  return {
    vm: publicVmFromMongoLean(doc),
    liveStatus: liveStatus ? publicVmLiveStatusFromVmStatus(liveStatus) : undefined,
  };
}

export function publicJobVmFromCredential(credential: JobVMCredential): PublicJobVmSummary {
  return {
    id: credential.id,
    name: credential.name,
    status: credential.status,
    ipAddress: credential.ipAddress,
    consoleProtocol: credential.consoleProtocol,
  };
}

export function serializePublicJobPayload(payload: {
  job: mongoose.Document & { _id: mongoose.Types.ObjectId };
  vms: JobVMCredential[];
}): { job: Record<string, unknown>; vms: PublicJobVmSummary[] } {
  const jobDoc = payload.job as unknown as {
    _id: mongoose.Types.ObjectId;
    type: string;
    status: string;
    total: number;
    completed: number;
    failed: number;
    pending: number;
    vmIds: mongoose.Types.ObjectId[];
    failedVmids: number[];
    jobErrors: Array<{ index: number; vmName: string; error: string }>;
    startedAt: Date;
    completedAt?: Date;
    cancelledAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  };

  return {
    job: {
      id: jobDoc._id.toString(),
      type: jobDoc.type,
      status: jobDoc.status,
      total: jobDoc.total,
      completed: jobDoc.completed,
      failed: jobDoc.failed,
      pending: jobDoc.pending,
      vmIds: jobDoc.vmIds.map((id) => id.toString()),
      failedVmids: jobDoc.failedVmids,
      jobErrors: jobDoc.jobErrors.map(({ index, vmName, error }) => ({
        index,
        vmName,
        error,
      })),
      startedAt: toIso(jobDoc.startedAt),
      completedAt: toIso(jobDoc.completedAt ?? null),
      cancelledAt: toIso(jobDoc.cancelledAt ?? null),
      createdAt: toIso(jobDoc.createdAt),
      updatedAt: toIso(jobDoc.updatedAt),
    },
    vms: payload.vms.map(publicJobVmFromCredential),
  };
}
