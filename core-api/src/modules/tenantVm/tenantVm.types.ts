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

export interface TenantBulkAssignPairsDto {
  vmIds: string[];
  mode: 'create' | 'existing';
  emailPrefix?: string;
  passwordMode?: 'auto' | 'shared';
  sharedPassword?: string;
  userIds?: string[];
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
