import type { AccessSchedule, AccessScheduleInput } from '@/lib/accessSchedule';

export type { AccessSchedule, AccessScheduleInput };

export type TenantUserRole = 'tenant_admin' | 'tenant_user';

/** Query param values for GET /api/v1/tenant-branding/asset?assetType= */
export type TenantBrandingAssetType = 'logo' | 'favicon' | 'login-page-image';

export interface TenantPortalUser {
  id: string;
  email: string;
  role: TenantUserRole;
  tenantId: string;
  /** Invited Access-control operator (or tenant_admin). */
  isConsoleOperator?: boolean;
}

export interface TenantUserProfile {
  id: string;
  email: string;
  role: 'tenant_user';
  tenantId: string;
  isActive: boolean;
  createdAt: string;
}

export interface TenantUsersResult {
  users: TenantUserProfile[];
  total: number;
}

export interface TenantBulkCreateUsersResult {
  created: number;
  failed: number;
  users: Array<{
    email: string;
    password: string;
    status: 'created' | 'failed';
    error?: string;
  }>;
}

export interface TenantBranding {
  /** Tenant display name from the tenant record (white-label portal title). */
  name?: string;
  logoUrl: string;
  faviconUrl: string;
  loginPageImageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  supportEmail: string;
}

export interface TenantWallet {
  balance: number;
  currency: string;
  /** Present when returned from tenant-wallet — used to convert lab USD estimates to INR. */
  usdToInrRate?: number;
}

export type TenantServiceKey =
  | 'vm-management'
  | 'create-vm'
  | 'dedicated-server'
  | 'elastic-servers'
  | 'my-vms'
  | 'azure'
  | 'aws'
  | 'gcp'
  | 'cloud-labs'
  | 'docs'
  | 'machine-manager';
export type TenantServiceStatus = 'active' | 'suspended';

export interface TenantAssignedService {
  serviceKey: TenantServiceKey;
  status: TenantServiceStatus;
  label?: string;
}

export interface TenantWalletTransaction {
  id: string;
  type: string;
  amount: number;
  reason: string;
  relatedOrderId: string | null;
  balanceAfter: number;
  projectId?: string | null;
  serviceKey?: string | null;
  createdAt: string;
}

export interface TenantWalletTransactionsResult {
  transactions: TenantWalletTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface TenantTopupResult {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface OrderSpecs {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
}

export interface BillingDiscounts {
  quarterly: number;
  yearly: number;
}

export interface VmManagementPricing {
  cpuRatePerCoreMonthly: number;
  ramRatePerGbMonthly: number;
  diskRatePerGbMonthly: number;
  billingDiscounts?: BillingDiscounts;
  fixedPlans?: unknown[];
  templatePricing?: Record<string, {
    cpuRatePerCoreMonthly: number;
    ramRatePerGbMonthly: number;
    diskRatePerGbMonthly: number;
    billingDiscounts?: BillingDiscounts;
  }>;
}

export interface TenantOrderTemplate {
  templateId: number;
  name: string;
  node: string;
  baselineSpecs: OrderSpecs;
  pricePerVm: number;
}

export interface TenantOrderCatalog {
  templates: TenantOrderTemplate[];
  pricing: VmManagementPricing;
}

export interface TenantTemplateDetail extends TenantOrderTemplate {
  pricing: VmManagementPricing;
}

export interface TenantOrderQuote {
  templateId: number;
  count: number;
  billingPeriod: BillingPeriod;
  templateName: string;
  baselineSpecs: OrderSpecs;
  specs: OrderSpecs;
  amount: number;
  pricePerVm: number;
}

export type TenantOrderStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'approved'
  | 'provisioning'
  | 'rejected'
  | 'fulfilled';

export type PlanStatus = 'active' | 'expired';

export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';

export type TenantVmStatus =
  | 'creating'
  | 'running'
  | 'stopped'
  | 'paused'
  | 'suspended'
  | 'error'
  | 'deleting'
  | 'deleted';

export interface TenantVmAssignmentSummary {
  tenantUserId: string;
  email: string;
  isActive: boolean;
}

export interface TenantVmLiveStatus {
  vmid: number;
  node: string;
  status: string;
  cpu: { usagePercent: number; allocated: number };
  memory: { usedGb: number; allocatedGb: number; usagePercent: number };
  disk: { usedGb: number; allocatedGb: number };
  uptime: { seconds: number; formatted: string };
  ipAddress?: string;
}

export interface TenantVmSummary {
  id: string;
  vmid: number;
  node: string;
  name: string;
  description?: string;
  status: TenantVmStatus;
  proxmoxStatus: string;
  ipAddress?: string;
  cloneType: 'dedicated_storage' | 'dynamic_storage';
  allocatedCpu: number;
  allocatedMemoryGb: number;
  allocatedDiskGb: number;
  consoleProtocol: 'rdp' | 'ssh';
  consoleReady: boolean;
  planStatus?: PlanStatus | null;
  planPeriodEnd?: string | null;
  billingPeriod?: BillingPeriod | null;
  assignment?: TenantVmAssignmentSummary | null;
  accessSchedule?: AccessSchedule | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantVmsResult {
  vms: TenantVmSummary[];
  total: number;
}

export interface TenantVmDetails {
  vm: TenantVmSummary;
  liveStatus?: TenantVmLiveStatus;
}

export interface TenantVmConsoleResult {
  protocol: 'rdp' | 'ssh' | 'vnc' | string;
  clientUrl: string;
  connectionId: string;
}

export interface TenantVmOperationResult {
  success: boolean;
  vmid: number;
  node: string;
  operation: string;
  taskId?: string;
  error?: string;
}

export interface TenantVmAssignmentCountsResult {
  counts: Record<string, number>;
}

export interface TenantOnboardPair {
  vmId: string;
  vmName: string;
  userId?: string;
  userEmail: string;
  password?: string;
  status: 'assigned' | 'failed';
  error?: string;
}

export interface TenantOnboardResult {
  assigned: number;
  failed: number;
  pairs: TenantOnboardPair[];
}

export interface TenantOnboardDto {
  vmIds: string[];
  passwordMode: 'auto' | 'shared';
  sharedPassword?: string;
  emailPrefix?: string;
  email?: string;
  accessSchedule?: AccessScheduleInput;
}

export interface TenantPlanSpecs {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
}

export interface TenantPlan {
  vmId: string;
  vmid: string;
  node: string;
  name: string;
  status: string;
  planStatus: PlanStatus;
  planPeriodEnd: string;
  billingPeriod: BillingPeriod;
  specs: TenantPlanSpecs;
  orderId: string | null;
  renewalAmount: number;
  canExtend: boolean;
  canRenew: boolean;
}

export interface TenantPlanQuote {
  amount: number;
  billingPeriod: BillingPeriod;
  currentPlanPeriodEnd: string;
  projectedPlanPeriodEnd: string;
  action: 'extend' | 'renew';
}

export interface TenantPlanActionResult {
  vmId: string;
  planStatus: PlanStatus;
  planPeriodEnd: string;
  amountCharged: number;
  billingPeriod: BillingPeriod;
  vmStatus?: string;
}

export interface TenantPlanHistoryEntry {
  id: string;
  type: string;
  amount: number;
  reason: 'plan_extend' | 'plan_renew';
  balanceAfter: number;
  createdAt: string;
}

export type TenantNotificationType = 'vm_plan_expiring_soon' | string;

export interface TenantNotification {
  id: string;
  type: TenantNotificationType;
  title: string;
  message: string;
  severity: 'info' | 'warning';
  read: boolean;
  metadata?: {
    vmId?: string;
    planPeriodEnd?: string;
    daysRemaining?: number;
    [key: string]: unknown;
  };
  createdAt: string;
}

export interface TenantNotificationsResult {
  notifications: TenantNotification[];
  total: number;
  page: number;
  limit: number;
}

export interface TenantOrder {
  id: string;
  tenantId: string;
  templateId: number;
  templateName: string;
  count: number;
  specs: OrderSpecs;
  calculatedAmount: number;
  status: TenantOrderStatus;
  billingPeriod: BillingPeriod;
  networkType?: 'public' | 'private';
  createdBy: string;
  approvedBy: string | null;
  rejectedBy: string | null;
  rejectionReason?: string | null;
  provisionJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceOrderInput {
  templateId: number;
  count: number;
  billingPeriod?: BillingPeriod;
  cpuCores?: number;
  memoryGb?: number;
  diskGb?: number;
  networkType?: 'public' | 'private';
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}
