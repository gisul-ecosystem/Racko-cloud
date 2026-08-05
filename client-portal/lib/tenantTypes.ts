export type TenantStatus = 'pending' | 'active' | 'suspended' | 'cancelled';
export type ServiceKey =
  | 'vm-management'
  | 'create-vm'
  | 'dedicated-server'
  | 'elastic-servers'
  | 'azure'
  | 'aws'
  | 'gcp'
  | 'docs'
  | 'machine-manager';
export type ServiceConfigStatus = 'active' | 'suspended';

export const PLATFORM_SERVICE_CATALOG: Array<{
  key: ServiceKey;
  name: string;
  description: string;
}> = [
  {
    key: 'vm-management',
    name: 'VPS Hosting',
    description: 'Provision and manage Racko cloud virtual machines',
  },
  {
    key: 'create-vm',
    name: 'VM Catalog',
    description: 'Browse Webyne VM plans and request catalog virtual machines',
  },
  {
    key: 'dedicated-server',
    name: 'Dedicated Server',
    description: 'Request and manage dedicated bare-metal servers',
  },
  {
    key: 'elastic-servers',
    name: 'Elastic Server Import',
    description: 'Connect to external servers from any provider via secure browser console',
  },
  {
    key: 'azure',
    name: 'Azure Services',
    description: 'Azure access management, provisioning, and lab environments.',
  },
  {
    key: 'aws',
    name: 'AWS Services',
    description: 'AWS access management, provisioning, and lab environments.',
  },
  // GCP is temporarily hidden from UI until automation is ready (see lib/hiddenServices.ts).
  {
    key: 'docs',
    name: 'Documentation',
    description: 'Guides and reference for VPS, Elastic Server, AWS, and Azure services',
  },
  {
    key: 'machine-manager',
    name: 'Machine Manager',
    description: 'Install and manage software on any machine',
  },
];

export interface TenantBranding {
  logoUrl?: string;
  faviconUrl?: string;
  loginPageImageUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  supportEmail?: string;
}

export type TenantIpAccessMode = 'all' | 'restricted';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  domain: string;
  status: TenantStatus;
  branding: TenantBranding;
  enabledServices: string[];
  limits: Record<string, unknown>;
  ipAccessMode: TenantIpAccessMode;
  allowedIps: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantServiceConfig {
  id: string;
  tenantId: string;
  serviceKey: ServiceKey;
  status: ServiceConfigStatus;
  limits: Record<string, unknown>;
  pricing: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantAdmin {
  id: string;
  email: string;
  role: 'tenant_admin';
  tenantId: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface SuperAdminOverview {
  totalTenants: number;
  tenantsByStatus: Record<TenantStatus, number>;
  totalTenantAdmins: number;
  totalTenantUsers: number;
}

export interface VmManagementLimits {
  maxVms: number;
  maxTotalVcpu: number;
  maxTotalRamGb: number;
  maxTotalDiskGb: number;
}

export interface VmManagementPricing {
  cpuRatePerCoreMonthly: number;
  ramRatePerGbMonthly: number;
  diskRatePerGbMonthly: number;
  billingDiscounts?: {
    quarterly: number;
    yearly: number;
  };
  fixedPlans?: Array<{
    name: string;
    cpuCores: number;
    memoryGb: number;
    diskGb: number;
    priceMonthly: number;
  }>;
  /** Per-template pricing: keyed by templateId (as string) */
  templatePricing?: Record<string, TemplateItemPricing>;
}

export interface TemplateItemPricing {
  cpuRatePerCoreMonthly: number;
  ramRatePerGbMonthly: number;
  diskRatePerGbMonthly: number;
  billingDiscounts: {
    quarterly: number;
    yearly: number;
  };
}

export interface CreateTenantInput {
  name: string;
  domain: string;
  branding?: TenantBranding;
}

export interface UpdateTenantInput {
  name?: string;
  domain?: string;
  status?: TenantStatus;
  branding?: TenantBranding;
}

export interface UpdateTenantIpAccessInput {
  ipAccessMode: TenantIpAccessMode;
  allowedIps: string[];
}

export interface CreateTenantAdminInput {
  email: string;
  password: string;
}

export interface AssignServiceInput {
  serviceKey: ServiceKey;
  limits: Record<string, unknown>;
  pricing: Record<string, unknown>;
}

export interface UpdateServiceConfigInput {
  limits?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  status?: ServiceConfigStatus;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface TenantsListResult {
  tenants: Tenant[];
  total: number;
  page: number;
  limit: number;
}

export type BrandingAssetType = 'logo' | 'favicon' | 'login-page-image';

export interface PlatformTemplateOption {
  templateId: number;
  name: string;
  node: string;
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  enabled: boolean;
  selected: boolean;
}

export interface VmManagementPlatformTemplates {
  platformCatalogPath: string;
  platformSelectionPath: string;
  selectionMode: 'all_enabled' | 'allowlist';
  allowedTemplateIds: number[];
  templates: PlatformTemplateOption[];
}

export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';

export type SuperAdminOrderStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'approved'
  | 'provisioning'
  | 'rejected'
  | 'fulfilled';

export type ManualWalletPaymentMethod = 'upi' | 'bank_transfer' | 'cash' | 'other';

export interface TenantWalletBalance {
  balance: number;
  currency: string;
}

export interface SuperAdminWalletTransaction {
  id: string;
  type: string;
  amount: number;
  reason: string;
  source?: string;
  externalReference?: string | null;
  relatedOrderId: string | null;
  relatedVmId?: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface SuperAdminWalletTransactionsResult {
  transactions: SuperAdminWalletTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface ManualWalletCredit {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  paymentMethod: ManualWalletPaymentMethod;
  paymentReference: string;
  internalNote: string | null;
  creditedBy: string;
  walletTransactionId: string;
  createdAt: string;
}

export interface ManualWalletCreditsResult {
  credits: ManualWalletCredit[];
  total: number;
  page: number;
  limit: number;
}

export interface ManualWalletCreditInput {
  amount: number;
  paymentReference: string;
  paymentMethod: ManualWalletPaymentMethod;
  internalNote?: string;
}

export interface ManualWalletCreditResult {
  credit: ManualWalletCredit;
  wallet: TenantWalletBalance;
  idempotentReplay: boolean;
}

export interface SuperAdminOrder {
  id: string;
  tenantId: string;
  templateId: number;
  templateName: string;
  count: number;
  specs: {
    cpuCores: number;
    memoryGb: number;
    diskGb: number;
  };
  calculatedAmount: number;
  status: SuperAdminOrderStatus;
  billingPeriod?: BillingPeriod;
  networkType?: 'public' | 'private';
  createdBy: string;
  approvedBy: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  provisionJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuperAdminTenantVmAssignment {
  tenantUserId: string;
  email: string;
  isActive: boolean;
}

export interface SuperAdminTenantVm {
  id: string;
  vmid: number;
  node: string;
  name: string;
  description?: string;
  status: string;
  proxmoxStatus: string;
  ipAddress?: string;
  templateName: string;
  orderId: string | null;
  cloneType: 'dedicated_storage' | 'dynamic_storage';
  allocatedCpu: number;
  allocatedMemoryGb: number;
  allocatedDiskGb: number;
  planStatus?: 'active' | 'expired' | null;
  planPeriodEnd?: string | null;
  billingPeriod?: BillingPeriod | null;
  assignment?: SuperAdminTenantVmAssignment | null;
  accessSchedule?: import('./accessSchedule').AccessSchedule | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuperAdminTenantVmsResult {
  vms: SuperAdminTenantVm[];
  total: number;
}
