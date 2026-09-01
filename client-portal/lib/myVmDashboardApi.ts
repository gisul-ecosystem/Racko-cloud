import { apiRequest } from './apiClient';
import { tenantPortalRequest } from './tenantPortalApiClient';

export type ExternalVMSource = 'admin_import' | 'tenant_import' | 'superadmin_bulk';

export type MyVmOriginServiceKey =
  | 'vm-management'
  | 'create-vm'
  | 'elastic-servers'
  | 'external-vm';

export type MyVmOriginServiceLabel =
  | 'VPS Hosting'
  | 'VM Catalog'
  | 'Elastic Server Import'
  | 'External VM Import';

export type MyVmResourceType = 'platform_vm' | 'catalog_vm' | 'external_vm';

export interface MyVmAssignment {
  assignmentId: string;
  userId?: string;
  tenantUserId?: string;
  email: string | null;
  username: string | null;
  status: string;
  schedule: {
    effectiveFrom: string;
    effectiveTo: string | null;
    daysOfWeek: number[];
    dailyStart: string;
    dailyEnd: string;
    timezone: string;
  } | null;
}

export interface MyVmDashboardRow {
  _id: string;
  resourceType: MyVmResourceType;
  originServiceKey: MyVmOriginServiceKey;
  originServiceLabel: MyVmOriginServiceLabel;
  name: string;
  ipAddress: string | null;
  protocol: 'rdp' | 'ssh' | 'vnc' | null;
  username: string | null;
  password: string | null;
  hostname?: string | null;
  status: string;
  statusLabel: string;
  canConsole: boolean;
  consolePath: string | null;
  managePath: string | null;
  parentRequestId?: string;
  instanceId?: string;
  assignments: MyVmAssignment[];
  accessSchedule: {
    startDate: string | null;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    override: boolean;
    overrideUntil: string | null;
    timezone: string;
    weeklySchedule: Array<{
      day: string;
      enabled: boolean;
      windows: Array<{ start: string; end: string }>;
    }> | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function fetchAdminMyVmDashboard(): Promise<MyVmDashboardRow[]> {
  const res = await apiRequest<ApiResponse<{ rows: MyVmDashboardRow[]; total: number }>>(
    '/api/v1/my-vms'
  );
  return res.data.rows;
}

export async function fetchTenantMyVmDashboard(): Promise<MyVmDashboardRow[]> {
  const res = await tenantPortalRequest<ApiResponse<{ rows: MyVmDashboardRow[]; total: number }>>(
    '/api/v1/tenant-my-vms'
  );
  return res.data.rows;
}
