export type TenantStatus = 'pending' | 'active' | 'suspended' | 'cancelled';
export type ServiceKey = 'vm-management' | 'azure';
export type ServiceConfigStatus = 'active' | 'suspended';

export interface TenantBranding {
  logoUrl?: string;
  faviconUrl?: string;
  loginPageImageUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  supportEmail?: string;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  domain: string;
  status: TenantStatus;
  branding: TenantBranding;
  enabledServices: string[];
  limits: Record<string, unknown>;
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
  fixedPlans?: Array<{
    name: string;
    cpuCores: number;
    memoryGb: number;
    diskGb: number;
    priceMonthly: number;
  }>;
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

export type SuperAdminOrderStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'fulfilled';

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
  createdBy: string;
  approvedBy: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  provisionJobId: string | null;
  createdAt: string;
  updatedAt: string;
}
