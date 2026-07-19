import type { VMOperationResult, VMStatus } from '../vm/vm.types';

export interface TenantVmListFilters {
  status?: string;
  node?: string;
}

export interface TenantVmActor {
  id: string;
  tenantId: string;
  role: 'tenant_admin' | 'tenant_user';
}

/** Create tenant users + 1:1 VM assign — single (vmIds.length === 1) or bulk */
export interface TenantOnboardDto {
  vmIds: string[];
  emailPrefix?: string;
  passwordMode: 'auto' | 'shared';
  sharedPassword?: string;
  /** Optional full email when onboarding exactly one VM (otherwise uses emailPrefix + index) */
  email?: string;
}

export interface TenantBulkAssignPairRow {
  vmId: string;
  vmName: string;
  userId?: string;
  userEmail: string;
  password?: string;
  status: 'assigned' | 'failed';
  error?: string;
}

export interface TenantBulkAssignPairsResult {
  assigned: number;
  failed: number;
  pairs: TenantBulkAssignPairRow[];
}

export interface TenantVmAssignmentSummary {
  tenantUserId: string;
  email: string;
  isActive: boolean;
}

export interface TenantVmSummary {
  id: string;
  vmid: number;
  node: string;
  name: string;
  description?: string;
  status: string;
  proxmoxStatus: string;
  ipAddress?: string;
  cloneType: 'dedicated_storage' | 'dynamic_storage';
  allocatedCpu: number;
  allocatedMemoryGb: number;
  allocatedDiskGb: number;
  consoleProtocol: 'rdp' | 'ssh';
  consoleReady: boolean;
  planStatus?: 'active' | 'expired' | null;
  planPeriodEnd?: Date | null;
  billingPeriod?: 'monthly' | 'quarterly' | 'yearly' | null;
  assignment?: TenantVmAssignmentSummary | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Super-admin tenant detail view — extends tenant portal summary with provisioning metadata. */
export interface SuperAdminTenantVmSummary extends TenantVmSummary {
  templateName: string;
  orderId: string | null;
}

export interface TenantVmDetails {
  vm: TenantVmSummary;
  liveStatus?: VMStatus;
}

export interface TenantVmConsoleResult {
  protocol: string;
  clientUrl: string;
  connectionId: string;
}

export type TenantVmPowerResult = VMOperationResult;
