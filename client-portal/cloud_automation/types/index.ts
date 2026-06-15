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
