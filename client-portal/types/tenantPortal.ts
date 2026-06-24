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

export interface VmManagementPricing {
  cpuRatePerCoreMonthly: number;
  ramRatePerGbMonthly: number;
  diskRatePerGbMonthly: number;
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
  | 'rejected'
  | 'fulfilled';

export interface TenantOrder {
  id: string;
  tenantId: string;
  templateId: number;
  templateName: string;
  count: number;
  specs: OrderSpecs;
  calculatedAmount: number;
  status: TenantOrderStatus;
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
  cpuCores?: number;
  memoryGb?: number;
  diskGb?: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}
