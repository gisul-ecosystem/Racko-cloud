import { apiRequest } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

/** An assignable owner (platform admin or tenant) for super-admin provisioning flows. */
export interface SuperAdminTargetOption {
  id: string;
  label: string;
  email?: string | null;
  username?: string | null;
  slug?: string | null;
  name?: string | null;
}

export async function fetchSuperAdminExternalVmTargets(): Promise<{
  admins: SuperAdminTargetOption[];
  tenants: SuperAdminTargetOption[];
}> {
  const res = await apiRequest<
    ApiEnvelope<{ admins: SuperAdminTargetOption[]; tenants: SuperAdminTargetOption[] }>
  >('/api/v1/super-admin/targets');
  return res.data;
}
