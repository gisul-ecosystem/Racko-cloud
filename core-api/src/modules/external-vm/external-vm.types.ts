import type { ExternalVMProtocol } from './external-vm.model';

/** Payload to create a single external VM. */
export interface CreateExternalVMDto {
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  port?: number;
  username?: string;
  password: string;
  /** Required for platform admin console creates. */
  projectId?: string;
}

/** Public assignment-window shape (ISO dates). */
export interface AssignmentSchedulePublic {
  effectiveFrom: string;
  effectiveTo: string | null;
  daysOfWeek: number[];
  dailyStart: string;
  dailyEnd: string;
  timezone: string;
}

/** Who holds an elastic server and when (no secrets). */
export interface ExternalVmAssignmentSummary {
  assignmentId: string;
  userId?: string;
  tenantUserId?: string;
  email: string | null;
  username: string | null;
  status: string;
  schedule: AssignmentSchedulePublic | null;
}

/** Caller's own access window (end-user lists / detail). */
export interface ExternalVmMyAccess {
  allowedNow: boolean;
  schedule: AssignmentSchedulePublic | null;
  nextWindow: string | null;
  overrideActive?: boolean;
  overrideUntil?: string | null;
}

/** API-facing external VM shape. Password is returned DECRYPTED for admins only. */
export interface ExternalVMResponse {
  _id: string;
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  username: string;
  password?: string;
  adminId?: string;
  tenantId?: string;
  assignedTo?: string | null;
  /** @deprecated Use assignedTenantUserIds — kept for backward compatibility (first assignee). */
  assignedTenantUserId?: string | null;
  /** Tenant end-users with access to this elastic server (multi-share). */
  assignedTenantUserIds?: string[];
  /** Active assignments with schedules (admin / tenant-admin lists). */
  assignments?: ExternalVmAssignmentSummary[];
  /** Caller's assignment window (role=user / tenant_user). */
  myAccess?: ExternalVmMyAccess;
  accessSchedule?: {
    startDate: string | null;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    override: boolean;
    overrideUntil: string | null;
    timezone: string;
    weeklySchedule: Array<{
      day: string;
      enabled: boolean;
      windows: Array<{ start: string; end: string }>;
    }> | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface BulkAssignExternalPairsDto {
  externalVmIds: string[];
  mode: 'create' | 'existing';
  emailPrefix?: string;
  passwordMode?: 'auto' | 'shared';
  sharedPassword?: string;
  userIds?: string[];
  accessSchedule?: {
    startDate?: string | null;
    endDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    weeklySchedule?: unknown[] | null;
    timezone?: string | null;
  };
}

export interface BulkAssignExternalPairRow {
  externalVmId: string;
  externalVmName: string;
  userId?: string;
  userEmail: string;
  password?: string;
  status: 'assigned' | 'failed';
  error?: string;
}

export interface BulkAssignExternalPairsResult {
  assigned: number;
  failed: number;
  pairs: BulkAssignExternalPairRow[];
}

export interface TenantBulkAssignExternalPairsDto {
  externalVmIds: string[];
  mode: 'create' | 'existing';
  emailPrefix?: string;
  passwordMode?: 'auto' | 'shared';
  sharedPassword?: string;
  userIds?: string[];
  accessSchedule?: {
    startDate?: string | null;
    endDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    weeklySchedule?: unknown[] | null;
    timezone?: string | null;
  };
}

/** Guacamole console session for an external VM (mirrors the VPS console shape). */
export interface ExternalVMConsoleSession {
  protocol: ExternalVMProtocol;
  clientUrl: string;
  connectionId: string;
}
