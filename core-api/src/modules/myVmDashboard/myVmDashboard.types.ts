import type { ExternalVMProtocol, ExternalVMSource } from '../external-vm/external-vm.model';
import type { ExternalVmAssignmentSummary } from '../external-vm/external-vm.types';

export interface MyVmDashboardRow {
  _id: string;
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  username: string;
  /** Always masked — never revealed in this dashboard. */
  password: '••••••••';
  source: ExternalVMSource;
  /** UI label — always "External Server" for any source value. */
  sourceLabel: 'External Server';
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
