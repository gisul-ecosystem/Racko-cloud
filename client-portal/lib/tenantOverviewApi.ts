import { tenantPortalRequest } from './tenantPortalApiClient';
import type { ApiEnvelope } from '@/types/tenantPortal';

export interface TenantOverviewPayload {
  generatedAt: string;
  lastUpdatedLabel: string;
  periodLabel: string;
  currency: string;
  walletBalance: number;
  spend: { value: number; previous: number; changePct: number };
  activeServices: { value: number; previous: number; changePct: number };
  totalUsers: { value: number; previous: number; changePct: number };
  openRequests: { value: number; previous: number; changePct: number };
  newUsers: Array<{ label: string; value: number }>;
  assignmentSplit: {
    assigned: { count: number; pct: number };
    unassigned: { count: number; pct: number };
  };
  topUsers: Array<{ name: string; email: string; resources: number; up: boolean }>;
  spendSeries: {
    thisPeriod: number[];
    previousPeriod: number[];
    labels: string[];
  };
  streams: Array<{ name: string; pct: number; amount: number; color: string }>;
  alerts: Array<{ title: string; body: string; href?: string }>;
  goal: { target: number; current: number; pct: number; daysLeft: number };
  insights: {
    spendTrend: string;
    userGrowth: string;
    topStream: string;
    openRequests: string;
  };
}

export async function fetchTenantOverview(): Promise<TenantOverviewPayload> {
  const res = await tenantPortalRequest<ApiEnvelope<TenantOverviewPayload>>(
    '/api/v1/tenant-overview'
  );
  return res.data;
}
