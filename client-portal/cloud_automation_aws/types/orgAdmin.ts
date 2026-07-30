export type AwsAccessType = 'magic_link' | 'identity_center';

export type AwsCostingMode = 'shared' | 'per_user';

export type AwsRequestStatus =
  | 'Pending'
  | 'Provisioning'
  | 'Completed'
  | 'Failed'
  | 'Expired';

export interface AwsOrgAdminRequestSummary {
  requestId: string;
  customerEmail: string;
  region: string;
  status: AwsRequestStatus | string;
  costingMode: AwsCostingMode;
  accountCount: number;
  startDate: string;
  endDate: string;
  estimatedPrice: number;
  awsAccountId?: string | null;
  userCount: number;
  createdAt: string;
  selectedServices: string[];
  requestName?: string | null;
  projectName?: string | null;
  idMode?: 'test_ids' | 'aws_ids' | null;
}

export interface AwsOrgAdminUser {
  userIndex: number;
  username: string;
  roleName: string;
  roleArn: string;
  status: string;
  suspended: boolean;
  budgetExceeded: boolean;
  currentSpend: number;
  spendByService: { serviceName: string; spendUsd: number }[];
  lastCleanupAt?: string | null;
  cleanupDisabled?: boolean;
  cleanupIntervalOverride?: number | null;
  cleanupEnabled?: boolean;
  cleanupIntervalHours?: number | null;
  cleanupLogs?: {
    cleanedAt?: string;
    ranAt?: string;
    results?: Record<string, { terminated?: number; deleted?: number; error?: string }>;
  }[];
  permissionSetArn?: string | null;
  policies: string[];
  email?: string;
  consoleUrl?: string | null;
  password?: string | null;
  accountId?: string | null;
  needsActivation?: boolean;
  lastResourceCount?: number;
  peakResourceCount?: number;
  totalSessions?: number;
  totalMins?: number;
  activeSession?: {
    expiresAt?: string;
    startedAt?: string;
    status?: string;
  } | null;
  lastSessionAt?: string | null;
  sessionHistory?: unknown[];
  hasActiveSession?: boolean;
  sessionStartedAt?: string | null;
  lastLoginAt?: string | null;
  totalMinutesSpent?: number;
  todayMinutes?: number;
  activeSessionMinutes?: number;
  usedTodayMinutes?: number;
  remainingMinutes?: number | null;
  dailyLimitHours?: number | null;
  dailyLimitMinutes?: number | null;
  dailyLimitReached?: boolean;
  todayFormatted?: string;
  lifetimeFormatted?: string;
}

export interface AwsOrgAdminLiveSummary {
  activeSessions: number;
  totalMinutesSpent: number;
}

export interface AwsOrgAdminRequestDetail {
  requestId: string;
  requestName?: string | null;
  projectName?: string | null;
  idMode?: 'test_ids' | 'aws_ids' | null;
  customerEmail: string;
  region: string;
  status: AwsRequestStatus | string;
  costingMode: AwsCostingMode;
  accessType?: AwsAccessType;
  accountCount: number;
  awsAccountId?: string | null;
  startDate: string;
  endDate: string;
  estimatedPrice: number;
  perUserBudgetUsd?: number | null;
  cleanupEnabled: boolean;
  cleanupIntervalHours?: number | null;
  selectedServices: string[];
  permissions: { serviceName?: string; policies?: string[] }[];
  progress?: number;
  credentialsSent?: boolean;
  userCount: number;
  users: AwsOrgAdminUser[];
  enableDailyUsage?: boolean;
  usageWindows?: {
    dayOfWeek?: number;
    windowStartTime?: string;
    windowEndTime?: string;
    timezone?: string;
    dailyLimitHours?: number | null;
  }[];
  timezone?: string;
  dailyLimitHours?: number | null;
  usageWindowSummary?: string;
  todayWindow?: { start: string; end: string } | null;
  liveSummary?: AwsOrgAdminLiveSummary | null;
  sharedCost?: AwsOrgAdminSharedCost | null;
  resourceCleanupAction?: 'delete' | 'pause';
  resourceCleanupNextRunAt?: string | null;
  resourceCleanupLastRanAt?: string | null;
}

export interface AwsIamPolicyGroup {
  service: string;
  policies: string[];
}

export interface AwsOrgAdminUserCost {
  username: string;
  totalSpend: number;
  todaySpend: number;
  services: { serviceName: string; spendUsd: number }[];
  budgetUsd?: number | null;
  budgetExceeded: boolean;
  syncedAt?: string | null;
}

export type AwsOrgAdminErrorKind = 'session_expired' | 'network' | 'unknown';

export interface AwsOrgAdminDailyUsageEntry {
  userIndex: number;
  username: string;
  accountEnabled: boolean;
  limitReached: boolean;
  dailyLimitHours: number | null;
  consumedMinutes: number;
  remainingMinutes: number | null;
  consumedFormatted: string;
  remainingFormatted: string | null;
  todayWindow: { start: string; end: string } | null;
}

export interface AwsOrgAdminDailyUsageResponse {
  success: boolean;
  data: AwsOrgAdminDailyUsageEntry[];
  timezone: string;
  date: string;
}

export interface AwsOrgAdminUsageSession {
  id: string;
  requestId: string;
  userIndex: number | null;
  username: string;
  loginAt: string;
  logoutAt: string | null;
  minutesUsed: number | null;
  currentSessionMinutes: number | null;
  isActive: boolean;
}

export interface AwsOrgAdminMonitoringResponse {
  success: boolean;
  requestId: string;
  usageSessions: AwsOrgAdminUsageSession[];
  enforcementLogs: unknown[];
  auditLogs: unknown[];
}

export interface AwsOrgAdminAccessRequest {
  id: string;
  requestId: string | null;
  customerEmail: string;
  serviceName: string;
  requestedAccess: string;
  accountCount?: number | null;
  status: string;
  reviewNotes?: string | null;
  createdAt: string;
  region?: string | null;
}

export interface AwsOrgAdminPrivilegedRoleRequest {
  id: string;
  requestId: string | null;
  customerEmail: string;
  awsRole: string;
  awsRoleKey?: string;
  status: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  region?: string | null;
  requestStatus?: string | null;
  projectName?: string | null;
  rolesAssigned?: number;
  usersProcessed?: number;
  accessApplied?: boolean;
}

export interface AwsPrivilegedRoleOption {
  key: string;
  name: string;
  description?: string;
  managedPolicyArn?: string;
}

export interface AwsOrgAdminSharedCost {
  requestId: string;
  costingMode?: AwsCostingMode;
  monthToDateCost: number;
  lifetimeCost?: number;
  currency?: string;
  queriedAt?: string | null;
  totalMergedMinutesMtd?: number;
  users?: {
    userIndex: number;
    username: string;
    mergedMinutesMtd: number;
    sharePercent: number;
    monthToDateCost: number;
    attributionMethod: string;
  }[];
  dataFreshnessNote?: string;
}

export interface AwsOrgAdminHistoryEntry {
  id: string | number;
  type: string;
  at: string;
  userIndex?: number | null;
  username?: string | null;
  title: string;
  subtitle?: string | null;
  costUsd?: number;
  resourcesDeleted?: number;
  status?: string;
}

export interface AwsOrgAdminLabHistoryUserSummary {
  userIndex: number;
  userId?: string;
  username: string;
  totalMinutesLifetime: number;
  totalMinutesToday: number;
  liveCostUsd: number;
  awsCostMtdUsd: number;
  budgetAmountUsd?: number | null;
  costCurrency?: string;
  currentResourceCount: number;
  peakResourceCount: number;
  sessionCount: number;
  openSessions: number;
  cleanupRunCount: number;
}

export interface AwsOrgAdminLabHistoryTimelineEntry {
  id: string;
  type: 'session' | 'cleanup_snapshot' | 'cleanup_log' | 'daily_usage' | 'admin_event' | string;
  at: string;
  userIndex?: number | null;
  username?: string | null;
  title: string;
  subtitle?: string;
  minutes?: number;
  liveCostUsd?: number;
  awsCostMtdUsd?: number;
  costUsd?: number;
  resourceCount?: number;
  peakResourceCount?: number;
  resourcesDeleted?: number;
  limitReached?: boolean;
  isActive?: boolean;
  triggeredBy?: string;
  status?: string;
  error?: string | null;
  minutesLifetime?: number;
  minutesToday?: number;
}

export interface AwsOrgAdminLabHistory {
  requestId: string;
  expiryDate?: string | null;
  labCreatedAt?: string | null;
  hourlyRateUsd?: number;
  defaultCostCurrency?: string;
  userSummaries?: AwsOrgAdminLabHistoryUserSummary[];
  timeline?: AwsOrgAdminLabHistoryTimelineEntry[];
  sessions?: Array<{
    id: string;
    userIndex?: number | null;
    username: string;
    loginAt: string;
    logoutAt: string | null;
    minutesUsed: number;
    endedReason: string | null;
    liveCostUsd: number;
    isActive: boolean;
  }>;
  dailyUsage?: Array<{
    userIndex?: number | null;
    userId?: string;
    username: string;
    trackingDate: string;
    consumedMinutes: number;
    limitReached: boolean;
    limitReachedAt: string | null;
  }>;
  /** @deprecated Prefer timeline + userSummaries */
  entries?: AwsOrgAdminHistoryEntry[];
}

export interface AwsCustomIamPolicy {
  id: string;
  name: string;
  description?: string | null;
  document: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface AwsCustomService {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  pricePerUser: number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AwsCustomIamPolicyAssignment {
  _id?: string;
  id?: string;
  requestId: string;
  userIndex: number;
  policyId?: string | null;
  name: string;
  active: boolean;
  createdAt?: string;
}

export interface AwsOrgAdminCleanupLog {
  _id?: string;
  id?: string;
  requestId: string;
  userIndex?: number | null;
  ranAt: string;
  triggeredBy?: string;
  totalDeleted?: number;
  status: string;
  error?: string | null;
  action?: string;
}
