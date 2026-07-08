export interface ServiceCategory {
  id: number;
  name: string;
}

export interface CatalogService {
  id: number;
  name: string;
  service_name: string;
  category: string;
  service_family?: string;
  retail_price: number;
  price?: number;
  currency?: string;
  supports_instances: boolean;
  supports_regions?: boolean;
  supports_pricing?: boolean;
  supports_usage_limit?: boolean;
  default_role?: string | null;
  enable_role_selection?: boolean;
  role_required?: boolean;
  azure_role?: string | null;
  description?: string | null;
}

export interface ServiceRoleMapping {
  id?: number;
  serviceId: number;
  azure_role: string;
  auto_assign?: boolean;
  role_purpose?: string | null;
}

export interface CatalogInstance {
  id?: number;
  serviceId: number;
  option_name: string;
  guide?: string | { summary?: string; description?: string; tier?: string };
  sort_order?: number;
  daily_price?: number;
  dailyPrice?: number;
  hourlyPrice?: number;
  hourly_price?: number;
}

export interface InstanceRoleMapping {
  serviceId: number;
  instanceOption: string;
  azureRole: string;
  tierAutomated: boolean;
}

export interface ServiceCatalogResponse {
  success: boolean;
  categories: ServiceCategory[];
  services: CatalogService[];
  roles: ServiceRoleMapping[];
  regions: { arm_region_name: string; display_location: string; location?: string }[];
  instances: CatalogInstance[];
  instanceRoleMappings: InstanceRoleMapping[];
  count?: number;
}

export interface AvailableLocation {
  arm_region_name: string;
  display_location: string;
  basePrice?: number;
  serviceCount?: number;
  currency?: string;
}

export interface AvailableInstance {
  serviceId: number;
  option_name: string;
  guide?: string | { summary?: string; description?: string; tier?: string };
  hourlyPrice?: number;
  hourly_price?: number;
  dailyPrice?: number;
  daily_price?: number;
  currency?: string;
}

export interface SelectedInstance {
  serviceId: number;
  instanceOption: string;
}

export interface SelectedRole {
  serviceId: number;
  roles: string[];
}

export interface UsageWindow {
  day_of_week: number;
  window_start_time: string;
  window_end_time: string;
  timezone?: string;
  daily_limit_hours?: number;
}

export interface UsageDayConfig {
  enabled: boolean;
  limitMinutes: number;
  slots: { start: string; end: string }[];
}

export interface UsageSchedule {
  timezone: string;
  days: Record<string, UsageDayConfig>;
}

export interface PricingEstimatePayload {
  accountCount: number;
  serviceIds: number[];
  location: string;
  startDate: string;
  endDate: string;
  selectedInstances: SelectedInstance[];
  selectedRoles: SelectedRole[];
  costingMode?: CostingMode;
}

export interface PricingEstimateResponse {
  success?: boolean;
  services?: unknown[];
  baseHourlyPrice?: number;
  basePrice?: number;
  durationHours?: number;
  duration?: number;
  accounts?: number;
  totalPrice?: number;
  estimatedPrice?: number;
  currency?: string;
  roleCount?: number;
  costingMode?: CostingMode;
}

export type CostingMode = 'shared' | 'per_user';

export interface CreateRequestPayload {
  customerEmail: string;
  accountCount: number;
  location: string;
  startDate: string;
  endDate: string;
  serviceIds: number[];
  selectedRoles: SelectedRole[];
  selectedInstances: SelectedInstance[];
  costingMode?: CostingMode;
  enableDailyUsage?: boolean;
  usageSchedule?: UsageSchedule;
  dailyLimitMinutes?: number;
  cleanupEnabled?: boolean;
  cleanupIntervalHours?: number;
  resourceCleanupEnabled?: boolean;
  resourceCleanupIntervalHours?: number;
  resourceCleanupAction?: 'delete' | 'pause';
  usageWindows?: UsageWindow[];
  perUserBudgetUsd?: number;
}

export interface CreateRequestResponse {
  success: boolean;
  requestId: number;
  estimatedPrice?: number;
}

export interface AdminAccessRequestPayload {
  customerEmail: string;
  serviceId: number;
  serviceName: string;
  defaultRole: string;
  requestedAccess: string;
  accountCount: number;
}

export interface ServiceRole {
  id: number;
  azure_role: string;
  auto_assign?: boolean;
  role_purpose?: string | null;
}
