import type { CostingMode } from './catalog';

export interface OrgAdminProfile {
  id: string;
  email: string;
  username: string;
  role: string;
  mustChangePassword?: boolean;
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

export interface OrgAdminRequestSummary {
  id: number;
  customerEmail: string;
  status: string;
  costingMode: CostingMode;
  region: string | null;
  userCount: number;
  startDate: string;
  expiryDate: string | null;
  requestName: string | null;
  resourceGroupCount: number;
}

export interface OrgAdminLiveAzureResource {
  name: string;
  type: string;
  fullType?: string | null;
  location?: string | null;
  id?: string | null;
  provisioningState: string;
  createdAt?: string | null;
  tags?: Record<string, string>;
}

export interface OrgAdminUserSession {
  id: number;
  loginAt: string;
  logoutAt: string | null;
  minutesUsed: number | null;
  endedReason?: string | null;
  ipAddress?: string | null;
  status: string;
  isActive: boolean;
}

export interface OrgAdminCleanupLog {
  id: number;
  ranAt: string;
  triggeredBy: string;
  totalDeleted: number;
  status: string;
  error?: string | null;
  details?: unknown;
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
  activeSessions?: number;
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
  hasUsageWindows?: boolean;
  dailyLimitHours?: number | null;
  dailyLimitMinutes: number;
  usageSchedule: unknown;
  usageWindows?: unknown[];
  enforceInAzure: boolean;
  resourceCleanupEnabled?: boolean;
  resourceCleanupIntervalHours?: number | null;
  resourceCleanupAction?: 'delete' | 'pause';
  resourceCleanupLastRanAt?: string | null;
  resourceCleanupNextRunAt?: string | null;
  cleanupEnabled?: boolean;
  cleanupIntervalHours?: number | null;
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
  dailyLimitReached?: boolean;
  sessionExpiresAt?: string | null;
  totalSessions?: number;
  totalSessionsToday?: number;
  hasActiveSession: boolean;
  sessionActive?: boolean;
  sessionStartedAt?: string | null;
  lastLoginAt: string | null;
  resourceGroup: string | null;
  roles: OrgAdminRole[];
  liveResourceCount?: number;
  resourceCount?: number;
  liveResources?: OrgAdminLiveAzureResource[];
  todayMinutes?: number;
  lifetimeMinutes?: number;
  todayFormatted?: string;
  lifetimeFormatted?: string;
  activeSessionMinutes?: number;
  liveSessionMins?: number;
  hourlyResourceRate?: number;
  hourlyRate?: number;
  liveCost?: number;
  closedSessionCost?: number;
  totalCostToday?: number;
  liveCostRate?: string;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  peakResourceCount?: number;
  syncError?: string | null;
  lastSyncAttemptedAt?: string | null;
  totalMinutesSpent?: number;
  azureAccountEnabled?: boolean;
  budgetExceeded?: boolean;
  perUserBudgetUsd?: number | null;
  azureCostMtd?: number;
  azureCostLifetime?: number;
  totalBudget?: number | null;
  costCurrency?: string;
  lastCostSyncedAt?: string | null;
  storedMinsToday?: number;
  cleanupDisabled?: boolean;
  cleanupIntervalOverride?: number | null;
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
  fromCache?: boolean;
  rateLimited?: boolean;
  cacheAge?: number | null;
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

export interface OrgAdminCustomRoleDefinition {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgAdminCustomRoleAssignment {
  id: number;
  request_id: number;
  azure_user_id: string;
  username: string;
  custom_role_def_id: number | null;
  custom_role_name: string;
  azure_role_def_id: string | null;
  permissions: string[];
  assigned_by: string | null;
  assigned_at: string;
  revoked_at: string | null;
  status: string;
}

export interface OrgAdminCustomService {
  id: number;
  name: string;
  description: string | null;
  category: string;
  price_per_user: number;
  icon: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
