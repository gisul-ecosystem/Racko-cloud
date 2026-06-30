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
