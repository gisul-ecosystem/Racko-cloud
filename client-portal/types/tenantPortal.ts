export type TenantUserRole = 'tenant_admin' | 'tenant_user';

/** Query param values for GET /api/v1/tenant-branding/asset?assetType= */
export type TenantBrandingAssetType = 'logo' | 'favicon' | 'login-page-image';

export interface TenantPortalUser {
  id: string;
  email: string;
  role: TenantUserRole;
  tenantId: string;
}

export interface TenantBranding {
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
}

export interface TenantWalletTransaction {
  id: string;
  type: string;
  amount: number;
  reason: string;
  relatedOrderId: string | null;
  balanceAfter: number;
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
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}
