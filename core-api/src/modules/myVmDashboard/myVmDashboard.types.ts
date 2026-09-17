import type { ExternalVmAssignmentSummary } from '../external-vm/external-vm.types';

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
  /** Catalog multi-instance parent request id. */
  parentRequestId?: string;
  /** Catalog instance row id. */
  instanceId?: string;
  /** Catalog VM power UI mode (webyne vs azure). */
  powerControlMode?: 'webyne' | 'azure';
  assignments: ExternalVmAssignmentSummary[];
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

export interface MyVmDashboardResult {
  rows: MyVmDashboardRow[];
  total: number;
}

export type MyVmDashboardScope = 'admin' | 'tenant';
