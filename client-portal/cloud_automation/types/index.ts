import type { UsageWindow } from './catalog';

export interface CloudAutomationHealth {
  success: boolean;
  message: string;
}

export type RequestStatusCategory = 'completed' | 'provisioning' | 'expired' | 'other';

export type CostingMode = 'shared' | 'per_user';

/** Raw request row from cloud_automation (snake_case or camelCase). */
export interface ProvisioningRequest {
  id: number | string;
  customer_email?: string;
  customerEmail?: string;
  account_count?: number;
  accountCount?: number;
  location?: string;
  status?: string;
  estimated_price?: number | string;
  estimatedPrice?: number | string;
  expiry_date?: string | null;
  expiryDate?: string | null;
  created_at?: string;
  createdAt?: string;
  enable_daily_usage?: boolean;
  enableDailyUsage?: boolean;
  costing_mode?: CostingMode;
  costingMode?: CostingMode;
  azure_resource_group_name?: string | null;
  azureResourceGroupName?: string | null;
  cleanup_enabled?: boolean;
  cleanupEnabled?: boolean;
  cleanup_interval_hours?: number | null;
  cleanupIntervalHours?: number | null;
  last_cleanup_at?: string | null;
  lastCleanupAt?: string | null;
  next_cleanup_at?: string | null;
  nextCleanupAt?: string | null;
  per_user_budget_usd?: number | string | null;
  perUserBudgetUsd?: number | null;
  resource_cleanup_enabled?: boolean;
  resourceCleanupEnabled?: boolean;
  resource_cleanup_interval_hours?: number | null;
  resourceCleanupIntervalHours?: number | null;
  resource_cleanup_last_ran_at?: string | null;
  resourceCleanupLastRanAt?: string | null;
  resource_cleanup_next_run_at?: string | null;
  resourceCleanupNextRunAt?: string | null;
  microsoft_license_sku_id?: string | null;
  microsoftLicenseSkuId?: string | null;
  microsoft_license_sku_part_number?: string | null;
  microsoftLicenseSkuPartNumber?: string | null;
  project_name?: string | null;
  projectName?: string | null;
  /** Racko org/tenant project ObjectId. */
  project_id?: string | null;
  projectId?: string | null;
  usage_windows?: UsageWindow[];
  usageWindows?: UsageWindow[];
}

export interface ListRequestsResponse {
  success: boolean;
  data: ProvisioningRequest[];
  count: number;
}

export interface RequestStats {
  total: number;
  completed: number;
  provisioning: number;
  expired: number;
}
