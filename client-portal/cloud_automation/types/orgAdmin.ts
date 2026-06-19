import type { CostingMode } from './catalog';

export interface OrgAdminProfile {
  id: string;
  email: string;
  username: string;
  role: string;
  mustChangePassword?: boolean;
}

export interface OrgAdminSession {
  sessionToken: string;
  expiresAt: string;
  admin: OrgAdminProfile;
}

export interface OrgAdminLoginResponse {
  success: boolean;
  admin: OrgAdminProfile;
  sessionToken: string;
  expiresAt: string;
}

export interface OrgAdminRole {
  role: string;
  scope?: string | null;
}

export interface OrgAdminAzureRoleOption {
  name: string;
  definitionId: string;
}

export type OrgAdminUserDisplayStatus = 'Created' | 'Active' | 'Blocked' | 'Expired';

export interface OrgAdminResourceGroup {
  requestId: number;
  customerEmail: string;
  resourceGroup: string | null;
  costingMode: CostingMode;
  location: string | null;
  status: string;
  expiryDate: string | null;
  enableDailyUsage: boolean;
  dailyLimitMinutes: number;
  usageSchedule: unknown;
  enforceInAzure: boolean;
  createdAt: string;
  userCount: number;
  activeSessions: number;
}

export interface OrgAdminLiveResource {
  serviceId: number;
  name: string;
  instanceOption: string | null;
  resourceType: string;
  resourceName: string;
  hourlyRate: number;
}

export interface OrgAdminLiveSummary {
  hourlyResourceRate: number;
  resourceCount: number;
  resources: OrgAdminLiveResource[];
  totalLiveCost: number;
  totalMinutesSpent: number;
}

export interface OrgAdminRequestDetail {
  requestId: number;
  customerEmail: string;
  resourceGroup: string | null;
  resourceGroupId: string | null;
  costingMode: CostingMode;
  perUserResourceGroupCount: number;
  location: string | null;
  status: string;
  expiryDate: string | null;
  enableDailyUsage: boolean;
  dailyLimitMinutes: number;
  usageSchedule: unknown;
  enforceInAzure: boolean;
  createdAt: string;
  liveSummary?: OrgAdminLiveSummary | null;
}

export interface OrgAdminUser {
  id: number;
  username: string;
  azureUserId: string | null;
  status: OrgAdminUserDisplayStatus | string;
  displayStatus?: OrgAdminUserDisplayStatus | string;
  createdAt: string;
  expiryDate: string | null;
  enableDailyUsage: boolean;
  dailyLimitMinutes: number;
  usedTodayMinutes: number;
  remainingMinutes: number | null;
  blockedUntil: string | null;
  hasActiveSession: boolean;
  sessionActive?: boolean;
  sessionStartedAt?: string | null;
  lastLoginAt: string | null;
  resourceGroup: string | null;
  roles: OrgAdminRole[];
  liveResourceCount?: number;
  resourceCount?: number;
  totalMinutesSpent?: number;
  todayMinutes?: number;
  lifetimeMinutes?: number;
  todayFormatted?: string;
  lifetimeFormatted?: string;
  activeSessionMinutes?: number;
  hourlyResourceRate?: number;
  liveCost?: number;
  azureAccountEnabled?: boolean;
  budgetExceeded?: boolean;
  perUserBudgetUsd?: number | null;
  azureCostMtd?: number;
  azureCostLifetime?: number;
  totalBudget?: number | null;
  costCurrency?: string;
  lastCostSyncedAt?: string | null;
}

export interface OrgAdminUserAzureCost {
  userId: number;
  username: string;
  resourceGroup: string;
  costingMode: CostingMode;
  attributionMethod: 'direct' | 'proportional';
  monthToDateCost: number;
  lifetimeCost: number;
  currency: string;
  resourceGroupTotalCost: {
    monthToDateCost: number;
    lifetimeCost: number;
  } | null;
  sharePercent: number | null;
  dataFreshnessNote: string;
  queriedAt: string;
}

export interface OrgAdminUserAzureCostResponse {
  success: boolean;
  cost: OrgAdminUserAzureCost;
}

export interface OrgAdminResourceGroupDetailResponse {
  success: boolean;
  request: OrgAdminRequestDetail;
  users: OrgAdminUser[];
}

export interface OrgAdminUsageSession {
  id: number;
  requestId: number;
  userId: number;
  username: string;
  loginAt: string;
  logoutAt: string | null;
  minutesUsed: number | null;
  currentSessionMinutes: number | null;
  isActive: boolean;
}

export interface OrgAdminMonitoringResponse {
  success: boolean;
  requestId: number;
  usageSessions: OrgAdminUsageSession[];
  enforcementLogs: {
    id: number;
    requestId: number;
    userId: number;
    username: string;
    action: string;
    details: unknown;
    createdAt: string;
  }[];
  auditLogs: {
    id: number;
    requestId: number;
    customerEmail: string;
    actor: string;
    action: string;
    targetUserId: number | null;
    details: unknown;
    createdAt: string;
  }[];
}

export interface OrgAdminAccessRequest {
  id: number;
  requestId: number | null;
  customerEmail: string;
  serviceId: number;
  serviceName: string;
  defaultRole: string | null;
  requestedAccess: string;
  accountCount: number | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  resourceGroup: string | null;
  requestLocation: string | null;
  requestStatus: string | null;
}

export type OrgAdminErrorKind = 'invalid_credentials' | 'session_expired' | 'network' | 'unknown';

export interface OrgAdminDailyUsageEntry {
  userId: number;
  username: string;
  email: string;
  accountEnabled: boolean;
  limitReached: boolean;
  dailyLimitHours: number | null;
  consumedMinutes: number;
  remainingMinutes: number | null;
  consumedFormatted: string;
  remainingFormatted: string | null;
  todayWindow: { start: string; end: string } | null;
}

export interface OrgAdminDailyUsageResponse {
  success: boolean;
  data: OrgAdminDailyUsageEntry[];
  timezone: string;
  date: string;
}

export interface OrgAdminAzureRolesResponse {
  success: boolean;
  data: OrgAdminAzureRoleOption[];
}
