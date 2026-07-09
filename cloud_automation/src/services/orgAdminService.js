const db = require('../db/postgres');
const { DateTime } = require('luxon');
const { ResourceManagementClient } = require('@azure/arm-resources');
const adminAccessRequestService = require('./adminAccessRequestService');
const AppError = require('../utils/AppError');
const managePortalService = require('./managePortalService');
const usageService = require('./usageService');
const { evaluateUsageAccess } = require('./usageAccessEvaluator');
const { isPerUserCosting } = require('../utils/costingMode');
const { getStagingResourceGroups, getResourceGroupNameForUser } = require('./userResourceGroupService');
const { attachLiveUsageToUsers } = require('./userLiveUsageService');
const { isRequestExpired } = require('../utils/requestExpiry');
const {
  getResourceGroupCosts,
  getCachedResourceGroupCosts,
  COST_CACHE_TTL_MS
} = require('./azureCostManagementService');
const { formatMinutes } = require('../utils/formatMinutes');
const { createAzureCredential, validateAzureEnv } = require('../config/azure');
const { filterResourcesForUser, expandDeploymentResources } = require('../utils/resourceOwnership');
const { listResourcesInResourceGroup } = require('./resourceCleanupService');
const {
  loadUsageWindowsByRequest,
  evaluateWindowDailyLimitAccess,
  getTodayWindowConfig
} = require('./usageWindowAccessService');
const { sumMergedSessionMinutes } = require('../utils/sessionIntervalMerge');
const {
  resolveScheduleForRequest,
  getTodayLimitMinutes
} = require('../utils/usageSchedule');
const { getConsumedMinutesToday } = require('./dailyUsageEnforcementService');

let armClient = null;

const getArmClient = () => {
  if (armClient) {
    return armClient;
  }

  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  armClient = new ResourceManagementClient(credential, azureConfig.subscriptionId);
  return armClient;
};

const formatArmResource = (resource) => ({
  name: resource.name,
  type: resource.type?.split('/').pop() || resource.type || 'Unknown',
  fullType: resource.type || null,
  location: resource.location || null,
  id: resource.id || null,
  provisioningState: resource.properties?.provisioningState || 'Unknown',
  createdAt: resource.systemData?.createdAt || null,
  tags: resource.tags || {}
});

const listResourcesForResourceGroup = async (resourceGroupName) => {
  const normalizedName = String(resourceGroupName || '').trim();
  if (!normalizedName) {
    return [];
  }

  try {
    return await listResourcesInResourceGroup(normalizedName);
  } catch {
    return [];
  }
};

const getLiveResourcesByUser = async (users, sharedResourceGroup, costingMode) => {
  const resourcesByUser = new Map();
  const isSharedCosting = !isPerUserCosting(costingMode);

  if (isSharedCosting && sharedResourceGroup) {
    const resources = await listResourcesForResourceGroup(sharedResourceGroup);

    for (const user of users) {
      const ownedResources = expandDeploymentResources(
        resources,
        filterResourcesForUser(resources, {
          entraObjectId: user.azure_user_id,
          username: user.username,
          userNumber: user.user_number
        })
      );

      const userResources =
        ownedResources.length || (users.length === 1 ? resources : []);

      resourcesByUser.set(
        Number(user.id),
        userResources.map(formatArmResource)
      );
    }

    return resourcesByUser;
  }

  const resourcesByRg = new Map();
  const rgNameByKey = new Map();

  for (const user of users) {
    const rgName = user.azure_resource_group_name || sharedResourceGroup;
    if (rgName) {
      rgNameByKey.set(String(rgName).toLowerCase(), rgName);
    }
  }

  await Promise.all(
    [...rgNameByKey.entries()].map(async ([rgKey, rgName]) => {
      const resources = await listResourcesForResourceGroup(rgName);
      resourcesByRg.set(rgKey, resources.map(formatArmResource));
    })
  );

  for (const user of users) {
    const rgName = user.azure_resource_group_name || sharedResourceGroup;
    const rgKey = rgName ? String(rgName).toLowerCase() : '';
    resourcesByUser.set(Number(user.id), resourcesByRg.get(rgKey) ?? []);
  }

  return resourcesByUser;
};

const getLiveResourceCountsByUser = async (users, sharedResourceGroup, costingMode) => {
  const resourcesByUser = await getLiveResourcesByUser(users, sharedResourceGroup, costingMode);
  const countsByUser = new Map();

  for (const [userId, resources] of resourcesByUser.entries()) {
    countsByUser.set(userId, resources.length);
  }

  return countsByUser;
};

const updateResourceCountHistory = async (userId, currentCount) => {
  await db.query(
    `
      UPDATE azure_users
      SET peak_resource_count = GREATEST(COALESCE(peak_resource_count, 0), $2),
          last_resource_count = $2,
          resources_synced_at = NOW()
      WHERE id = $1
    `,
    [userId, currentCount]
  );
};

const deriveUserDisplayStatus = ({
  azureAccountEnabled,
  budgetExceeded,
  hasOpenSession,
  expiryDate,
  expiresAt,
  expiryTimezone,
  expiryEndTime
}) => {
  if (azureAccountEnabled === false || budgetExceeded === true) {
    return 'Blocked';
  }

  if (hasOpenSession) {
    return 'Active';
  }

  if (
    isRequestExpired({
      expiry_date: expiryDate,
      expires_at: expiresAt,
      timezone: expiryTimezone,
      expiry_end_time: expiryEndTime
    })
  ) {
    return 'Expired';
  }

  return 'Created';
};

const mapUserUsage = (row) => {
  const access = evaluateUsageAccess({
    request: {
      enable_daily_usage: row.enable_daily_usage,
      daily_limit_minutes: row.daily_limit_minutes,
      usage_schedule: row.usage_schedule
    },
    user: {
      used_today_minutes: row.used_today_minutes,
      blocked_until: row.blocked_until,
      last_reset_date: row.last_reset_date
    },
    currentSessionMinutes: 0
  });

  const roles = Array.isArray(row.roles) ? row.roles : [];

  return {
    id: row.id,
    username: row.username,
    azureUserId: row.azure_user_id,
    status: row.display_status || row.status,
    displayStatus: row.display_status || row.status,
    createdAt: row.created_at,
    expiryDate: row.expiry_date,
    enableDailyUsage: row.enable_daily_usage === true,
    dailyLimitMinutes: Number(row.daily_limit_minutes || 0),
    usedTodayMinutes: Number(access.usedMinutes || 0),
    remainingMinutes: access.remainingMinutes,
    blockedUntil: row.blocked_until,
    lastResetDate: row.last_reset_date,
    hasActiveSession: false,
    sessionActive: false,
    sessionStartedAt: null,
    lastLoginAt: row.last_signin_at || row.last_session_login_at,
    resourceGroup: row.azure_resource_group_name || null,
    roles,
    azureAccountEnabled: row.azure_account_enabled !== false,
    budgetExceeded: row.budget_exceeded === true,
    cleanupDisabled: row.cleanup_disabled === true,
    cleanupIntervalOverride:
      row.cleanup_interval_override != null ? Number(row.cleanup_interval_override) : null,
    perUserBudgetUsd:
      row.per_user_budget_usd != null ? Number(row.per_user_budget_usd) : null,
    azureCostMtd: Number(row.azure_cost_mtd || 0),
    azureCostLifetime: Number(row.azure_cost_lifetime || 0),
    totalBudget: row.total_budget != null ? Number(row.total_budget) : null,
    costCurrency: row.cost_currency || 'USD',
    lastCostSyncedAt: row.last_synced_at || null,
    todayMinutes: 0,
    lifetimeMinutes: 0,
    todayFormatted: '0m',
    lifetimeFormatted: '0m',
    liveResourceCount: 0,
    peakResourceCount: 0
  };
};

const listResourceGroups = async () => {
  const result = await db.query(
    `
      SELECT
        r.id,
        r.customer_email,
        r.azure_resource_group_name,
        r.location,
        r.status,
        r.expiry_date,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule,
        r.enforce_in_azure,
        r.costing_mode,
        r.created_at,
        COUNT(DISTINCT au.id) FILTER (WHERE COALESCE(au.is_deleted, false) = false) AS user_count,
        COUNT(DISTINCT uus.id) FILTER (WHERE uus.logout_at IS NULL) AS active_sessions
      FROM requests r
      LEFT JOIN azure_users au ON au.request_id = r.id
      LEFT JOIN user_usage_sessions uus ON uus.request_id = r.id
      WHERE r.azure_resource_group_name IS NOT NULL
         OR r.costing_mode = 'per_user'
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `
  );

  return result.rows.map((row) => ({
    requestId: row.id,
    customerEmail: row.customer_email,
    resourceGroup: row.azure_resource_group_name,
    costingMode: row.costing_mode,
    location: row.location,
    status: row.status,
    expiryDate: row.expiry_date,
    enableDailyUsage: row.enable_daily_usage === true,
    dailyLimitMinutes: Number(row.daily_limit_minutes || 0),
    usageSchedule: row.usage_schedule,
    enforceInAzure: row.enforce_in_azure === true,
    createdAt: row.created_at,
    userCount: Number(row.user_count || 0),
    activeSessions: Number(row.active_sessions || 0)
  }));
};

const getResourceGroupDetail = async (requestId) => {
  const requestResult = await db.query(
    `
      SELECT
        r.id,
        r.customer_email,
        r.azure_resource_group_name,
        r.azure_resource_group_id,
        r.location,
        r.status,
        r.expiry_date,
        r.expires_at,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule,
        r.enforce_in_azure,
        r.costing_mode,
        r.created_at,
        r.resource_cleanup_enabled,
        r.resource_cleanup_interval_hours,
        r.resource_cleanup_action,
        r.resource_cleanup_last_ran_at,
        r.resource_cleanup_next_run_at,
        r.cleanup_enabled,
        r.cleanup_interval_hours
      FROM requests r
      WHERE r.id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const request = requestResult.rows[0];

  if (!request) {
    throw new AppError('Resource group request not found.', 404);
  }

  const usageWindowsByRequest = await loadUsageWindowsByRequest([requestId]);
  const usageWindows = usageWindowsByRequest.get(Number(requestId)) || [];
  const todayWindowConfig = getTodayWindowConfig(usageWindows);
  const hasUsageWindows = usageWindows.length > 0;
  const hasDailyLimitWindows = usageWindows.some(
    (window) => window.daily_limit_hours != null && Number(window.daily_limit_hours) > 0
  );
  const hasUsageTracking =
    request.enable_daily_usage === true || hasDailyLimitWindows;

  const usersResult = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.azure_user_id,
        au.status,
        au.created_at,
        au.used_today_minutes,
        au.blocked_until,
        au.last_reset_date,
        au.azure_resource_group_name,
        au.azure_account_enabled,
        au.budget_exceeded,
        au.cleanup_disabled,
        au.cleanup_interval_override,
        au.user_number,
        au.peak_resource_count,
        au.last_resource_count,
        au.resources_synced_at,
        r.expiry_date,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule,
        r.per_user_budget_usd,
        COALESCE(ubs.current_spend, 0) AS azure_cost_mtd,
        COALESCE(ubs.current_spend, 0) AS azure_cost_lifetime,
        COALESCE(
          ubs.budget_amount,
          r.per_user_budget_usd + COALESCE(au.budget_top_up_usd, 0)
        ) AS total_budget,
        ubs.currency AS cost_currency,
        ubs.last_synced_at,
        ubs.sync_error,
        ubs.last_sync_attempted_at,
        (
          SELECT MAX(uus.login_at)
          FROM user_usage_sessions uus
          WHERE uus.request_id = au.request_id
            AND uus.user_id = au.id
        ) AS last_session_login_at,
        (
          SELECT COUNT(*)
          FROM user_usage_sessions uus_today
          WHERE uus_today.user_id = au.id
            AND uus_today.login_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS sessions_today,
        au.last_signin_at,
        COALESCE(
          (
            SELECT json_agg(
              jsonb_build_object(
                'role', ura.azure_role,
                'scope', ura.scope
              )
            )
            FROM user_role_assignments ura
            WHERE ura.request_id = au.request_id
              AND ura.user_id = au.id
              AND ura.azure_role IS NOT NULL
          ),
          '[]'::json
        ) AS roles
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      LEFT JOIN user_budget_spend ubs ON ubs.azure_user_id = au.id
      WHERE au.request_id = $1
        AND COALESCE(au.is_deleted, false) = false
      ORDER BY au.created_at DESC
    `,
    [requestId]
  );

  const perUserResourceGroups = isPerUserCosting(request.costing_mode)
    ? await getStagingResourceGroups(requestId)
    : [];

  const liveResourcesByUser = await getLiveResourcesByUser(
    usersResult.rows,
    request.azure_resource_group_name,
    request.costing_mode
  );

  const liveResourceCountByUser = new Map(
    [...liveResourcesByUser.entries()].map(([userId, resources]) => [userId, resources.length])
  );

  for (const row of usersResult.rows) {
    const liveCount = liveResourceCountByUser.get(Number(row.id)) ?? 0;
    await updateResourceCountHistory(Number(row.id), liveCount);
  }

  const mappedUsers = usersResult.rows.map((row) => ({
    ...mapUserUsage(row),
    peakResourceCount: Math.max(
      Number(row.peak_resource_count || 0),
      liveResourceCountByUser.get(Number(row.id)) ?? 0
    ),
    liveResources: liveResourcesByUser.get(Number(row.id)) ?? [],
    totalSessionsToday: Number(row.sessions_today || 0),
    syncError: row.sync_error || null,
    lastSyncAttemptedAt: row.last_sync_attempted_at || null
  }));
  const { users: enrichedUsers, liveSummary } = await attachLiveUsageToUsers(
    requestId,
    mappedUsers,
    request.location,
    { liveResourceCountByUser }
  );

  const users = [];

  for (const user of enrichedUsers) {
      const todayMinutes = Math.round(Number(user.todayMinutes || 0));
      const lifetimeMinutes = Math.round(Number(user.totalMinutesSpent || 0));
      const activeSessionMinutes = Math.round(Number(user.activeSessionMinutes || 0));
      let usedTodayMinutes = todayMinutes;
      let remainingMinutes = user.remainingMinutes ?? null;
      let dailyLimitMinutes = Number(user.dailyLimitMinutes || 0);
      let limitReached = false;
      let blockedForToday = false;
      let blockedReason = null;
      let blockedReasonLabel = null;

      if (hasDailyLimitWindows) {
        const windowAccess = await evaluateWindowDailyLimitAccess({
          requestId,
          userId: user.id,
          windows: usageWindows
        });
        usedTodayMinutes = Math.round(Number(windowAccess.consumedMinutes || 0));
        remainingMinutes =
          windowAccess.remainingMinutes != null
            ? Math.round(Number(windowAccess.remainingMinutes))
            : null;
        dailyLimitMinutes = Number(windowAccess.limitMinutes || 0);
        limitReached = windowAccess.limitReached === true;
        blockedForToday = windowAccess.blockedForToday === true;
        blockedReason = windowAccess.blockedReason || null;
        blockedReasonLabel = windowAccess.blockedReasonLabel || null;
      } else if (request.enable_daily_usage === true) {
        const storedClosedMinutes =
          user.storedMinsToday ??
          Math.max(0, Math.round(Number(user.usedTodayMinutes || 0)) - activeSessionMinutes);
        const access = evaluateUsageAccess({
          request,
          user: {
            used_today_minutes: storedClosedMinutes,
            blocked_until: user.blockedUntil,
            last_reset_date: user.lastResetDate
          },
          currentSessionMinutes: activeSessionMinutes
        });
        usedTodayMinutes = Math.round(Number(access.usedMinutes || 0));
        remainingMinutes =
          access.remainingMinutes != null ? Math.round(Number(access.remainingMinutes)) : null;
        dailyLimitMinutes = Number(access.limitMinutes || 0);
        limitReached = access.reason === 'limit_exceeded' || access.reason === 'blocked';
        blockedForToday = !access.allowed;
        blockedReason = access.reason !== 'ok' ? access.reason : null;
        blockedReasonLabel = blockedReason
          ? blockedReason === 'limit_exceeded'
            ? 'Daily limit reached'
            : blockedReason === 'outside_window'
              ? 'Outside usage window'
              : blockedReason.replace(/_/g, ' ')
          : null;
      }

      const displayStatus = deriveUserDisplayStatus({
        azureAccountEnabled: user.azureAccountEnabled,
        budgetExceeded: user.budgetExceeded,
        hasOpenSession: user.hasActiveSession === true,
        expiryDate: user.expiryDate,
        expiresAt: request.expires_at,
        expiryTimezone: todayWindowConfig?.timezone || usageWindows[0]?.timezone,
        expiryEndTime: todayWindowConfig?.windowEndTime || usageWindows[0]?.windowEndTime
      });

      users.push({
        ...user,
        status: displayStatus,
        displayStatus,
        enableDailyUsage: hasUsageTracking,
        dailyLimitMinutes,
        usedTodayMinutes,
        remainingMinutes,
        dailyLimitReached: limitReached,
        blockedForToday,
        blockedReason,
        blockedReasonLabel,
        todayMinutes,
        lifetimeMinutes,
        todayFormatted: formatMinutes(todayMinutes),
        lifetimeFormatted: formatMinutes(lifetimeMinutes),
        hasActiveSession: user.hasActiveSession === true,
        sessionActive: user.hasActiveSession === true,
        liveResources: user.liveResources ?? [],
        liveResourceCount: user.liveResourceCount ?? user.liveResources?.length ?? 0,
        totalSessionsToday: user.totalSessionsToday ?? 0,
        closedSessionCost: user.closedSessionCost ?? 0,
        totalCostToday: user.totalCostToday ?? user.liveCost ?? 0,
        syncError: user.syncError ?? null,
        sessionExpiresAt:
          remainingMinutes != null && user.hasActiveSession
            ? new Date(Date.now() + remainingMinutes * 60 * 1000).toISOString()
            : null
      });
  }

  const activeSessions = users.filter((user) => user.hasActiveSession).length;

  return {
    request: {
      requestId: request.id,
      customerEmail: request.customer_email,
      resourceGroup: request.azure_resource_group_name,
      resourceGroupId: request.azure_resource_group_id,
      costingMode: request.costing_mode,
      perUserResourceGroupCount: perUserResourceGroups.length,
      location: request.location,
      status: request.status,
      expiryDate: request.expiry_date,
      enableDailyUsage: hasUsageTracking,
      hasUsageWindows,
      dailyLimitHours: todayWindowConfig?.dailyLimitHours ?? null,
      dailyLimitMinutes: hasDailyLimitWindows
        ? Math.round(Number(todayWindowConfig?.dailyLimitHours || 0) * 60)
        : Number(request.daily_limit_minutes || 0),
      usageSchedule: request.usage_schedule,
      usageWindows,
      enforceInAzure: request.enforce_in_azure === true || hasDailyLimitWindows,
      resourceCleanupEnabled: request.resource_cleanup_enabled === true,
      resourceCleanupIntervalHours:
        request.resource_cleanup_interval_hours != null
          ? Number(request.resource_cleanup_interval_hours)
          : null,
      resourceCleanupAction: request.resource_cleanup_action === 'pause' ? 'pause' : 'delete',
      resourceCleanupLastRanAt: request.resource_cleanup_last_ran_at || null,
      resourceCleanupNextRunAt: request.resource_cleanup_next_run_at || null,
      cleanupEnabled: request.cleanup_enabled === true,
      cleanupIntervalHours:
        request.cleanup_interval_hours != null ? Number(request.cleanup_interval_hours) : null,
      createdAt: request.created_at,
      liveSummary: {
        ...liveSummary,
        activeSessions
      }
    },
    users
  };
};

const getMonitoringLogs = async (requestId, { userId = null, limit = 50 } = {}) => {
  const resolvedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const resolvedUserId = userId ? Number(userId) : null;

  if (resolvedUserId && (!Number.isInteger(resolvedUserId) || resolvedUserId <= 0)) {
    throw new AppError('userId must be a positive integer.', 400);
  }

  const sessionParams = [requestId, resolvedLimit];
  let sessionFilter = '';

  if (resolvedUserId) {
    sessionParams.push(resolvedUserId);
    sessionFilter = 'AND uus.user_id = $3';
  }

  const sessionsResult = await db.query(
    `
      SELECT
        uus.id,
        uus.request_id,
        uus.user_id,
        au.username,
        uus.login_at,
        uus.logout_at,
        uus.minutes_used,
        CASE
          WHEN uus.logout_at IS NULL
            THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - uus.login_at)) / 60)
          ELSE NULL
        END AS current_session_minutes
      FROM user_usage_sessions uus
      JOIN azure_users au ON au.id = uus.user_id AND au.request_id = uus.request_id
      WHERE uus.request_id = $1
        ${sessionFilter}
      ORDER BY uus.login_at DESC
      LIMIT $2
    `,
    sessionParams
  );

  const enforcementParams = [requestId, resolvedLimit];
  let enforcementFilter = '';

  if (resolvedUserId) {
    enforcementParams.push(resolvedUserId);
    enforcementFilter = 'AND uel.user_id = $3';
  }

  const enforcementResult = await db.query(
    `
      SELECT
        uel.id,
        uel.request_id,
        uel.user_id,
        au.username,
        uel.action,
        uel.details,
        uel.created_at
      FROM usage_enforcement_logs uel
      JOIN azure_users au ON au.id = uel.user_id AND au.request_id = uel.request_id
      WHERE uel.request_id = $1
        ${enforcementFilter}
      ORDER BY uel.created_at DESC
      LIMIT $2
    `,
    enforcementParams
  );

  const auditParams = [requestId, resolvedLimit];
  const auditResult = await db.query(
    `
      SELECT
        id,
        request_id,
        customer_email,
        actor,
        action,
        target_user_id,
        details,
        created_at
      FROM access_portal_audit_logs
      WHERE request_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    auditParams
  );

  return {
    usageSessions: sessionsResult.rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      userId: row.user_id,
      username: row.username,
      loginAt: row.login_at,
      logoutAt: row.logout_at,
      minutesUsed: row.minutes_used !== null ? Number(row.minutes_used) : null,
      currentSessionMinutes:
        row.current_session_minutes !== null ? Number(row.current_session_minutes) : null,
      isActive: !row.logout_at
    })),
    enforcementLogs: enforcementResult.rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      userId: row.user_id,
      username: row.username,
      action: row.action,
      details: row.details,
      createdAt: row.created_at
    })),
    auditLogs: auditResult.rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      customerEmail: row.customer_email,
      actor: row.actor,
      action: row.action,
      targetUserId: row.target_user_id,
      details: row.details,
      createdAt: row.created_at
    }))
  };
};

const deleteUser = async ({ adminEmail, requestId, userId }) =>
  managePortalService.deletePortalUserByOrgAdmin({
    adminEmail,
    requestId,
    userId
  });

const deleteRequest = async ({ adminEmail, requestId }) =>
  managePortalService.deleteRequestByOrgAdmin({
    adminEmail,
    requestId
  });

const updateUserRoles = async ({ adminEmail, requestId, userId, roles }) =>
  managePortalService.updatePortalUserRolesByOrgAdmin({
    adminEmail,
    requestId,
    userId,
    roles
  });

const forceLogoutUser = async ({ requestId, userId }) =>
  usageService.forceLogoutUser({
    requestId: Number(requestId),
    userId: Number(userId)
  });

const listAccessRequests = async ({ status, requestId } = {}) =>
  adminAccessRequestService.listAdminAccessRequests({ status, requestId });

const reviewAccessRequest = async ({ id, status, reviewNotes, reviewedBy }) =>
  adminAccessRequestService.reviewAdminAccessRequest({
    id,
    status,
    reviewNotes,
    reviewedBy
  });

const AZURE_COST_FRESHNESS_NOTE =
  'Azure billing data is typically delayed by several hours and may not include the current session.';

const getSessionMergeGapMs = () =>
  Number(process.env.SESSION_MERGE_GAP_MINUTES || 2) * 60 * 1000;

const resolveRequestUsageTimezone = async (requestId) => {
  const windowsByRequest = await loadUsageWindowsByRequest([requestId]);
  const windows = windowsByRequest.get(requestId) || [];
  const config = getTodayWindowConfig(windows);
  return config?.timezone || 'Asia/Kolkata';
};

const loadMergedMinutesByUserForPeriod = async (
  requestId,
  timezone,
  periodStartDate,
  periodEndDate
) => {
  const tz = timezone || 'Asia/Kolkata';
  const { rows } = await db.query(
    `
      SELECT
        user_id,
        login_at,
        COALESCE(logout_at, NOW()) AS end_at
      FROM user_usage_sessions
      WHERE request_id = $1
        AND DATE(login_at AT TIME ZONE $2) >= $3::date
        AND DATE(login_at AT TIME ZONE $2) <= $4::date
      ORDER BY user_id ASC, login_at ASC
    `,
    [requestId, tz, periodStartDate, periodEndDate]
  );

  const gapMs = getSessionMergeGapMs();
  const intervalsByUser = new Map();

  for (const row of rows) {
    const userId = Number(row.user_id);
    if (!intervalsByUser.has(userId)) {
      intervalsByUser.set(userId, []);
    }
    intervalsByUser.get(userId).push({
      start: new Date(row.login_at),
      end: new Date(row.end_at)
    });
  }

  const mergedMinutesByUser = new Map();
  for (const [userId, intervals] of intervalsByUser) {
    mergedMinutesByUser.set(userId, sumMergedSessionMinutes(intervals, gapMs));
  }

  return mergedMinutesByUser;
};

const computeSharedAttributionFromMinutes = ({
  userId,
  costs,
  mergedMinutesByUser
}) => {
  const userMinutes = mergedMinutesByUser.get(Number(userId)) || 0;
  const totalMinutes = [...mergedMinutesByUser.values()].reduce(
    (sum, value) => sum + value,
    0
  );

  const resourceGroupTotalCost = {
    monthToDateCost: costs.monthToDateCost,
    lifetimeCost: costs.lifetimeCost
  };

  if (totalMinutes <= 0 || userMinutes <= 0) {
    return {
      monthToDateCost: 0,
      lifetimeCost: 0,
      attributionMethod: 'proportional',
      resourceGroupTotalCost,
      sharePercent: 0,
      mergedMinutesMtd: userMinutes,
      totalMergedMinutesMtd: totalMinutes
    };
  }

  const ratio = userMinutes / totalMinutes;

  return {
    monthToDateCost: Number((costs.monthToDateCost * ratio).toFixed(4)),
    lifetimeCost: Number((costs.lifetimeCost * ratio).toFixed(4)),
    attributionMethod: 'proportional',
    resourceGroupTotalCost,
    sharePercent: Number((ratio * 100).toFixed(2)),
    mergedMinutesMtd: userMinutes,
    totalMergedMinutesMtd: totalMinutes
  };
};
const buildAzureCostResponse = ({
  userId,
  user,
  request,
  resourceGroup,
  monthToDateCost,
  lifetimeCost,
  currency,
  attributionMethod,
  resourceGroupTotalCost,
  sharePercent,
  queriedAt,
  fromCache = false,
  rateLimited = false,
  cacheAge = null
}) => ({
  userId: Number(userId),
  username: user.username,
  resourceGroup,
  costingMode: request.costing_mode,
  attributionMethod,
  monthToDateCost,
  lifetimeCost,
  currency: currency || 'USD',
  resourceGroupTotalCost,
  sharePercent,
  dataFreshnessNote: AZURE_COST_FRESHNESS_NOTE,
  queriedAt: queriedAt || new Date().toISOString(),
  fromCache,
  rateLimited,
  cacheAge
});

const applySharedCostAttribution = async ({
  requestId,
  userId,
  costs,
  perUserCosting,
  timezone = null
}) => {
  if (perUserCosting) {
    return {
      monthToDateCost: costs.monthToDateCost,
      lifetimeCost: costs.lifetimeCost,
      attributionMethod: 'direct',
      resourceGroupTotalCost: null,
      sharePercent: null,
      mergedMinutesMtd: null,
      totalMergedMinutesMtd: null
    };
  }

  const tz = timezone || (await resolveRequestUsageTimezone(requestId));
  const monthStart = DateTime.now().setZone(tz).startOf('month').toISODate();
  const today = DateTime.now().setZone(tz).toISODate();
  const mergedMinutesByUser = await loadMergedMinutesByUserForPeriod(
    requestId,
    tz,
    monthStart,
    today
  );

  return computeSharedAttributionFromMinutes({
    userId,
    costs,
    mergedMinutesByUser
  });
};

const getUserAzureCost = async (requestId, userId, { refresh = false } = {}) => {
  const requestResult = await db.query(
    `
      SELECT
        r.id,
        r.costing_mode,
        r.created_at
      FROM requests r
      WHERE r.id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const request = requestResult.rows[0];

  if (!request) {
    throw new AppError('Resource group request not found.', 404);
  }

  const userResult = await db.query(
    `
      SELECT id, username
      FROM azure_users
      WHERE request_id = $1
        AND id = $2
        AND COALESCE(is_deleted, false) = false
      LIMIT 1
    `,
    [requestId, userId]
  );

  const user = userResult.rows[0];

  if (!user) {
    throw new AppError('User not found for this request.', 404);
  }

  const resourceGroup = await getResourceGroupNameForUser(requestId, userId);

  if (!resourceGroup) {
    throw new AppError('No Azure resource group is linked to this user yet.', 404);
  }

  const perUserCosting = isPerUserCosting(request.costing_mode);

  const dbCostResult = await db.query(
    `
      SELECT current_spend, currency, last_synced_at
      FROM user_budget_spend
      WHERE azure_user_id = $1
      LIMIT 1
    `,
    [userId]
  );
  const dbCost = dbCostResult.rows[0];
  const dbAgeMs = dbCost?.last_synced_at
    ? Date.now() - new Date(dbCost.last_synced_at).getTime()
    : null;
  const dbIsFresh = dbAgeMs != null && dbAgeMs < COST_CACHE_TTL_MS;

  const returnDbCost = (options = {}) => {
    const spend = parseFloat(dbCost?.current_spend || 0);
    return buildAzureCostResponse({
      userId,
      user,
      request,
      resourceGroup,
      monthToDateCost: spend,
      lifetimeCost: spend,
      currency: dbCost?.currency || 'USD',
      attributionMethod: perUserCosting ? 'direct' : 'proportional',
      resourceGroupTotalCost: null,
      sharePercent: null,
      queriedAt: dbCost?.last_synced_at || new Date().toISOString(),
      fromCache: true,
      cacheAge: dbAgeMs != null ? Math.round(dbAgeMs / 60000) : null,
      ...options
    });
  };

  if (!refresh && dbCost) {
    console.log(
      `[azureCost] Serving DB value for user ${userId}${
        dbIsFresh ? '' : ' (stale — scheduler will refresh)'
      }`
    );
    return returnDbCost();
  }

  if (!refresh) {
    const memoryCache = getCachedResourceGroupCosts(resourceGroup, request.created_at);
    if (memoryCache && !memoryCache.cacheExpired) {
      const attributed = await applySharedCostAttribution({
        requestId,
        userId,
        costs: memoryCache,
        perUserCosting
      });

      return buildAzureCostResponse({
        userId,
        user,
        request,
        resourceGroup,
        monthToDateCost: attributed.monthToDateCost,
        lifetimeCost: attributed.lifetimeCost,
        currency: memoryCache.currency,
        attributionMethod: attributed.attributionMethod,
        resourceGroupTotalCost: attributed.resourceGroupTotalCost,
        sharePercent: attributed.sharePercent,
        fromCache: true,
        cacheAge: memoryCache.cacheAge
      });
    }
  }

  try {
    const costs = await getResourceGroupCosts({
      resourceGroupName: resourceGroup,
      requestCreatedAt: request.created_at,
      bypassCache: refresh
    });

    const attributed = await applySharedCostAttribution({
      requestId,
      userId,
      costs,
      perUserCosting
    });

    await db.query(
      `
        INSERT INTO user_budget_spend
          (azure_user_id, request_id, current_spend, currency, last_synced_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (azure_user_id)
        DO UPDATE SET
          current_spend = EXCLUDED.current_spend,
          currency = EXCLUDED.currency,
          last_synced_at = NOW()
      `,
      [userId, requestId, attributed.monthToDateCost, costs.currency || 'USD']
    );

    return buildAzureCostResponse({
      userId,
      user,
      request,
      resourceGroup,
      monthToDateCost: attributed.monthToDateCost,
      lifetimeCost: attributed.lifetimeCost,
      currency: costs.currency,
      attributionMethod: attributed.attributionMethod,
      resourceGroupTotalCost: attributed.resourceGroupTotalCost,
      sharePercent: attributed.sharePercent,
      fromCache: costs.fromCache === true,
      cacheAge: costs.cacheAge ?? null
    });
  } catch (err) {
    const statusCode = err.statusCode || err.response?.status;
    const isRateLimited =
      statusCode === 429 ||
      String(err.message || '')
        .toLowerCase()
        .includes('too many requests');

    if (isRateLimited) {
      console.warn('[azureCost] Rate limited — returning cached/stored value');

      const memoryCache = getCachedResourceGroupCosts(resourceGroup, request.created_at);
      if (memoryCache) {
        const attributed = await applySharedCostAttribution({
          requestId,
          userId,
          costs: memoryCache,
          perUserCosting
        });

        return buildAzureCostResponse({
          userId,
          user,
          request,
          resourceGroup,
          monthToDateCost: attributed.monthToDateCost,
          lifetimeCost: attributed.lifetimeCost,
          currency: memoryCache.currency,
          attributionMethod: attributed.attributionMethod,
          resourceGroupTotalCost: attributed.resourceGroupTotalCost,
          sharePercent: attributed.sharePercent,
          fromCache: true,
          rateLimited: true,
          cacheAge: memoryCache.cacheAge
        });
      }

      if (dbCost) {
        return returnDbCost({ rateLimited: true });
      }

      return buildAzureCostResponse({
        userId,
        user,
        request,
        resourceGroup,
        monthToDateCost: 0,
        lifetimeCost: 0,
        currency: 'USD',
        attributionMethod: perUserCosting ? 'direct' : 'proportional',
        resourceGroupTotalCost: null,
        sharePercent: null,
        fromCache: false,
        rateLimited: true
      });
    }

    if (dbCost) {
      return returnDbCost();
    }

    throw err;
  }
};

const getSharedAzureCostForRequest = async (requestId, { refresh = false } = {}) => {
  const requestResult = await db.query(
    `
      SELECT
        id,
        costing_mode,
        created_at,
        azure_resource_group_name
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const request = requestResult.rows[0];

  if (!request) {
    throw new AppError('Resource group request not found.', 404);
  }

  if (isPerUserCosting(request.costing_mode)) {
    throw new AppError('Shared Azure cost summary is only available for shared costing mode.', 400);
  }

  const resourceGroup = request.azure_resource_group_name;

  if (!resourceGroup) {
    throw new AppError('No shared Azure resource group is linked to this request.', 404);
  }

  const timezone = await resolveRequestUsageTimezone(requestId);
  const monthStart = DateTime.now().setZone(timezone).startOf('month').toISODate();
  const today = DateTime.now().setZone(timezone).toISODate();

  const costs = await getResourceGroupCosts({
    resourceGroupName: resourceGroup,
    requestCreatedAt: request.created_at,
    bypassCache: refresh
  });

  const mergedMinutesByUser = await loadMergedMinutesByUserForPeriod(
    requestId,
    timezone,
    monthStart,
    today
  );
  const totalMergedMinutesMtd = [...mergedMinutesByUser.values()].reduce(
    (sum, value) => sum + value,
    0
  );

  const { rows: users } = await db.query(
    `
      SELECT id, username
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
      ORDER BY username ASC
    `,
    [requestId]
  );

  const userCosts = [];

  for (const user of users) {
    const attributed = computeSharedAttributionFromMinutes({
      userId: user.id,
      costs,
      mergedMinutesByUser
    });

    await db.query(
      `
        INSERT INTO user_budget_spend
          (azure_user_id, request_id, current_spend, currency, last_synced_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (azure_user_id)
        DO UPDATE SET
          current_spend = EXCLUDED.current_spend,
          currency = EXCLUDED.currency,
          last_synced_at = NOW()
      `,
      [user.id, requestId, attributed.monthToDateCost, costs.currency || 'USD']
    );

    userCosts.push(
      buildAzureCostResponse({
        userId: user.id,
        user,
        request,
        resourceGroup,
        monthToDateCost: attributed.monthToDateCost,
        lifetimeCost: attributed.lifetimeCost,
        currency: costs.currency || 'USD',
        attributionMethod: attributed.attributionMethod,
        resourceGroupTotalCost: attributed.resourceGroupTotalCost,
        sharePercent: attributed.sharePercent,
        queriedAt: new Date().toISOString(),
        fromCache: costs.fromCache === true,
        cacheAge: costs.cacheAge ?? null
      })
    );
  }

  return {
    requestId: Number(requestId),
    resourceGroup,
    costingMode: request.costing_mode,
    monthToDateCost: costs.monthToDateCost,
    lifetimeCost: costs.lifetimeCost,
    currency: costs.currency || 'USD',
    totalMergedMinutesMtd: Number(totalMergedMinutesMtd.toFixed(2)),
    periodStart: monthStart,
    periodEnd: today,
    timezone,
    dataFreshnessNote: AZURE_COST_FRESHNESS_NOTE,
    queriedAt: new Date().toISOString(),
    fromCache: costs.fromCache === true,
    cacheAge: costs.cacheAge ?? null,
    users: userCosts
  };
};

const getDailyUsageForRequest = async (requestId) => {
  const requestResult = await db.query(
    `
      SELECT
        id,
        enable_daily_usage,
        daily_limit_minutes,
        usage_schedule
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  if (!requestResult.rows.length) {
    throw new AppError('Resource group request not found.', 404);
  }

  const request = requestResult.rows[0];
  const usageWindowsByRequest = await loadUsageWindowsByRequest([requestId]);
  const usageWindows = usageWindowsByRequest.get(Number(requestId)) || [];
  const todayWindowConfig = getTodayWindowConfig(usageWindows);
  const hasDailyLimitWindows = usageWindows.some(
    (window) => window.daily_limit_hours != null && Number(window.daily_limit_hours) > 0
  );

  if (hasDailyLimitWindows) {
    const tz = todayWindowConfig?.timezone || 'Asia/Kolkata';
    const todayDate = todayWindowConfig?.todayDate || DateTime.now().setZone(tz).toISODate();
    const dailyLimitHours = todayWindowConfig?.dailyLimitHours ?? null;
    const dailyLimitMinutes = dailyLimitHours ? dailyLimitHours * 60 : null;

    const { rows: users } = await db.query(
      `
        SELECT
          au.id,
          au.username,
          au.azure_user_id,
          au.azure_account_enabled,
          COALESCE(dut.consumed_minutes, 0) AS tracked_consumed_minutes,
          COALESCE(dut.limit_reached, FALSE) AS limit_reached,
          dut.tracking_date
        FROM azure_users au
        LEFT JOIN daily_usage_tracking dut
          ON dut.azure_user_id = au.id
         AND dut.tracking_date = $1
        WHERE au.request_id = $2
          AND COALESCE(au.is_deleted, FALSE) = FALSE
        ORDER BY au.username
      `,
      [todayDate, requestId]
    );

    const data = await Promise.all(
      users.map(async (user) => {
        const windowAccess = await evaluateWindowDailyLimitAccess({
          requestId,
          userId: user.id,
          windows: usageWindows
        });
        const consumedMinutes = Number(windowAccess.consumedMinutes || 0);
        const remainingMinutes = windowAccess.remainingMinutes;
        const roundedConsumed = Math.round(consumedMinutes);
        const roundedRemaining = remainingMinutes !== null ? Math.round(remainingMinutes) : null;

        return {
          userId: user.id,
          username: user.username,
          email: user.username,
          accountEnabled: user.azure_account_enabled !== false,
          limitReached: windowAccess.limitReached === true,
          blockedForToday: windowAccess.blockedForToday === true,
          blockedReason: windowAccess.blockedReason || null,
          blockedReasonLabel: windowAccess.blockedReasonLabel || null,
          dailyLimitHours: dailyLimitHours !== null ? Number(dailyLimitHours) : null,
          consumedMinutes: roundedConsumed,
          remainingMinutes: roundedRemaining,
          consumedFormatted: formatMinutes(roundedConsumed),
          remainingFormatted: roundedRemaining !== null ? formatMinutes(roundedRemaining) : null,
          todayWindow: todayWindowConfig?.todayWindow
            ? {
                start: todayWindowConfig.todayWindow.window_start_time,
                end: todayWindowConfig.todayWindow.window_end_time
              }
            : null
        };
      })
    );

    return {
      data,
      timezone: tz,
      date: todayDate
    };
  }

  if (request.enable_daily_usage !== true) {
    return {
      data: [],
      timezone: 'Asia/Kolkata',
      date: DateTime.now().setZone('Asia/Kolkata').toISODate()
    };
  }

  const schedule = resolveScheduleForRequest(request);
  const tz = schedule?.timezone || 'Asia/Kolkata';
  const todayDate = DateTime.now().setZone(tz).toISODate();
  const dailyLimitMinutes = schedule
    ? getTodayLimitMinutes(schedule)
    : Number(request.daily_limit_minutes || 0);
  const dailyLimitHours = dailyLimitMinutes ? dailyLimitMinutes / 60 : null;

  const { rows: users } = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.azure_user_id,
        au.azure_account_enabled,
        au.used_today_minutes,
        au.blocked_until,
        au.last_reset_date
      FROM azure_users au
      WHERE au.request_id = $1
        AND COALESCE(au.is_deleted, FALSE) = FALSE
      ORDER BY au.username
    `,
    [requestId]
  );

  const data = await Promise.all(
    users.map(async (user) => {
      const consumedMinutes = await getConsumedMinutesToday(user.id, todayDate, tz);
      const access = evaluateUsageAccess({
        request,
        user,
        currentSessionMinutes: 0,
        at: new Date()
      });
      const remainingMinutes = access.remainingMinutes;
      const roundedConsumed = Math.round(consumedMinutes);
      const roundedRemaining = remainingMinutes !== null ? Math.round(remainingMinutes) : null;

      return {
        userId: user.id,
        username: user.username,
        email: user.username,
        accountEnabled: user.azure_account_enabled !== false,
        limitReached: access.reason === 'limit_exceeded' || access.reason === 'blocked',
        dailyLimitHours: dailyLimitHours !== null ? Number(dailyLimitHours) : null,
        consumedMinutes: roundedConsumed,
        remainingMinutes: roundedRemaining,
        consumedFormatted: formatMinutes(roundedConsumed),
        remainingFormatted: roundedRemaining !== null ? formatMinutes(roundedRemaining) : null,
        todayWindow: access.activeSlot
          ? {
              start: access.activeSlot.start,
              end: access.activeSlot.end
            }
          : null
      };
    })
  );

  return {
    data,
    timezone: tz,
    date: todayDate
  };
};

const listRequests = async () => {
  const result = await db.query(
    `
      SELECT
        r.id,
        r.customer_email,
        r.status,
        r.costing_mode,
        r.location,
        r.created_at,
        r.expiry_date,
        r.azure_resource_group_name,
        COUNT(DISTINCT au.id) FILTER (WHERE COALESCE(au.is_deleted, false) = false) AS user_count,
        COUNT(DISTINCT au.azure_resource_group_name) FILTER (
          WHERE au.azure_resource_group_name IS NOT NULL
            AND COALESCE(au.is_deleted, false) = false
        ) AS resource_group_count
      FROM requests r
      LEFT JOIN azure_users au ON au.request_id = r.id
      WHERE r.azure_resource_group_name IS NOT NULL
         OR r.costing_mode = 'per_user'
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `
  );

  return result.rows.map((row) => ({
    id: row.id,
    customerEmail: row.customer_email,
    status: row.status,
    costingMode: row.costing_mode,
    region: row.location,
    requestName: row.azure_resource_group_name,
    startDate: row.created_at,
    expiryDate: row.expiry_date,
    userCount: Number(row.user_count || 0),
    resourceGroupCount: Number(row.resource_group_count || 0)
  }));
};

const renewUserBudget = async ({ requestId, userId, topUpAmount, adminEmail }) => {
  const amount = parseFloat(topUpAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('topUpAmount must be positive.', 400);
  }

  const { rows } = await db.query(
    `
      SELECT
        au.id,
        au.azure_user_id,
        au.azure_resource_group_name,
        au.budget_id,
        au.budget_top_up_usd,
        au.budget_exceeded,
        au.request_id,
        r.per_user_budget_usd AS base_budget,
        r.expiry_date
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE au.id = $1
        AND au.request_id = $2
        AND COALESCE(au.is_deleted, FALSE) = FALSE
    `,
    [userId, requestId]
  );

  if (!rows.length) {
    throw new AppError('User not found.', 404);
  }

  const user = rows[0];
  const previousTopUp = parseFloat(user.budget_top_up_usd || 0);
  const newTopUp = previousTopUp + amount;
  const newTotalBudget = parseFloat(user.base_budget || 0) + newTopUp;

  if (user.azure_resource_group_name) {
    try {
      const { updateUserBudgetAmount } = require('../provisioners/azure/azureBudgetProvisioner');
      await updateUserBudgetAmount({
        resourceGroupName: user.azure_resource_group_name,
        userId: user.id,
        newBudgetAmount: newTotalBudget,
        endDate: new Date(user.expiry_date)
      });
    } catch {
      // Non-fatal — DB state is still updated.
    }
  }

  await db.query(
    `
      UPDATE azure_users
      SET budget_top_up_usd = $1,
          budget_exceeded = FALSE,
          budget_exceeded_at = NULL,
          budget_renewed_at = NOW(),
          budget_renewed_count = COALESCE(budget_renewed_count, 0) + 1
      WHERE id = $2
    `,
    [newTopUp, userId]
  );

  await db.query(
    `
      INSERT INTO user_budget_spend
        (azure_user_id, request_id, current_spend, budget_amount, last_synced_at)
      SELECT au.id, au.request_id, COALESCE(ubs.current_spend, 0), $1, NOW()
      FROM azure_users au
      LEFT JOIN user_budget_spend ubs ON ubs.azure_user_id = au.id
      WHERE au.id = $2
      ON CONFLICT (azure_user_id)
      DO UPDATE SET budget_amount = EXCLUDED.budget_amount, last_synced_at = NOW()
    `,
    [newTotalBudget, userId]
  );

  if (user.budget_exceeded && user.azure_user_id) {
    const { createGraphClient } = require('../provisioners/azure/userProvisioner');
    const { graphClient } = createGraphClient();
    await graphClient.api(`/users/${user.azure_user_id}`).patch({ accountEnabled: true });

    await db.query(
      `
        UPDATE azure_users
        SET azure_account_enabled = TRUE
        WHERE id = $1
      `,
      [userId]
    );
  }

  await db.query(
    `
      INSERT INTO access_portal_audit_logs (request_id, customer_email, actor, action, target_user_id, details)
      SELECT r.id, r.customer_email, $1, 'budget_renewed', $2, $3::jsonb
      FROM requests r
      WHERE r.id = $4
    `,
    [adminEmail, userId, JSON.stringify({ topUpAmount: amount, newTotalBudget }), requestId]
  );

  return {
    newTotalBudget,
    topUpAmount: amount,
    previousTopUp
  };
};

const updateUserCleanupSettings = async (
  requestId,
  userId,
  { cleanupDisabled, cleanupIntervalOverride }
) => {
  const userResult = await db.query(
    `
      SELECT request_id
      FROM azure_users
      WHERE id = $1
        AND request_id = $2
        AND COALESCE(is_deleted, FALSE) = FALSE
    `,
    [userId, requestId]
  );

  if (!userResult.rows.length) {
    throw new AppError('User not found.', 404);
  }

  const updates = [];
  const values = [];
  let idx = 1;

  if (cleanupDisabled !== undefined) {
    updates.push(`cleanup_disabled = $${idx++}`);
    values.push(Boolean(cleanupDisabled));
  }

  if (cleanupIntervalOverride !== undefined) {
    updates.push(`cleanup_interval_override = $${idx++}`);
    values.push(cleanupIntervalOverride);
  }

  if (!updates.length) {
    throw new AppError('No fields to update.', 400);
  }

  values.push(userId);
  await db.query(
    `
      UPDATE azure_users
      SET ${updates.join(', ')}
      WHERE id = $${idx}
    `,
    values
  );
};

const triggerUserCleanup = async (requestId, userId, { action } = {}) => {
  const { rows } = await db.query(
    `
      SELECT
        au.azure_resource_group_name,
        au.request_id,
        au.azure_user_id,
        au.username,
        au.user_number,
        r.costing_mode,
        r.azure_resource_group_name AS shared_resource_group_name,
        r.resource_cleanup_action,
        (
          SELECT COUNT(*)
          FROM azure_users active_users
          WHERE active_users.request_id = au.request_id
            AND COALESCE(active_users.is_deleted, FALSE) = FALSE
        ) AS active_user_count
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE au.id = $1
        AND au.request_id = $2
        AND COALESCE(au.is_deleted, FALSE) = FALSE
    `,
    [userId, requestId]
  );

  if (!rows.length) {
    throw new AppError('User not found.', 404);
  }

  const user = rows[0];
  const { runResourceActionForUser } = require('./resourceCleanupService');
  const { captureUserLabMetrics, recordCleanupSnapshot } = require('./labHistoryService');
  const resolvedAction = action === 'pause' || action === 'delete' ? action : user.resource_cleanup_action || 'delete';

  const metrics = await captureUserLabMetrics(requestId, user.id);

  const affected = await runResourceActionForUser({
    costingMode: user.costing_mode,
    perUserResourceGroupName: user.azure_resource_group_name,
    sharedResourceGroupName: user.shared_resource_group_name,
    entraObjectId: user.azure_user_id,
    username: user.username,
    userNumber: user.user_number,
    activeUserCount: Number(user.active_user_count || 0),
    action: resolvedAction
  });

  await db.query(
    `
      INSERT INTO resource_cleanup_logs
        (request_id, ran_at, resources_deleted, user_count, status, triggered_by, total_deleted)
      VALUES ($1, NOW(), $2, 1, 'success', 'admin_manual', $3)
    `,
    [user.request_id, JSON.stringify(affected), affected.length]
  );

  if (metrics) {
    await recordCleanupSnapshot({
      requestId,
      userId: user.id,
      triggeredBy: 'admin_manual',
      cleanupAction: resolvedAction,
      resourcesDeleted: affected,
      metrics
    }).catch(() => {});
  }

  const deletedCount = resolvedAction === 'delete' ? affected.length : 0;
  const pausedCount =
    resolvedAction === 'pause'
      ? affected.filter((entry) => entry.action && entry.action !== 'skipped' && entry.action !== 'failed').length
      : 0;

  return {
    action: resolvedAction,
    affectedCount: affected.length,
    deletedCount,
    pausedCount,
    affected
  };
};

const triggerRequestCleanup = async (requestId, { action, triggeredBy = 'admin_manual' } = {}) => {
  const { runResourceCleanupForRequest } = require('./resourceCleanupService');
  const { rows: requestRows } = await db.query(
    `
      SELECT resource_cleanup_action, resource_cleanup_interval_hours
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  if (!requestRows.length) {
    throw new AppError('Resource group request not found.', 404);
  }

  const request = requestRows[0];
  const resolvedAction =
    action === 'pause' || action === 'delete'
      ? action
      : request.resource_cleanup_action || 'delete';

  const { affected, deleted } = await runResourceCleanupForRequest(requestId, resolvedAction);
  const totalDeleted = deleted?.length ?? affected?.length ?? 0;

  await db.query(
    `
      INSERT INTO resource_cleanup_logs
        (request_id, ran_at, resources_deleted, user_count, status, triggered_by, total_deleted)
      VALUES ($1, NOW(), $2, NULL, 'success', $3, $4)
    `,
    [requestId, JSON.stringify(affected), triggeredBy, totalDeleted]
  );

  if (request.resource_cleanup_interval_hours) {
    const nextRun = new Date(
      Date.now() + Number(request.resource_cleanup_interval_hours) * 3600000
    );
    await db.query(
      `
        UPDATE requests
        SET resource_cleanup_next_run_at = $1,
            resource_cleanup_last_ran_at = NOW()
        WHERE id = $2
      `,
      [nextRun.toISOString(), requestId]
    );
  }

  return {
    action: resolvedAction,
    affectedCount: affected.length,
    deletedCount: deleted?.length ?? 0,
    totalDeleted,
    affected
  };
};

const getLabHistory = async (requestId, { userId = null, limit = 200 } = {}) => {
  const { getLabHistoryForRequest } = require('./labHistoryService');
  const history = await getLabHistoryForRequest(requestId, { userId, limit });

  if (!history) {
    throw new AppError('Resource group request not found.', 404);
  }

  return history;
};

const getCleanupLogs = async (requestId, { limit = 20 } = {}) => {
  const resolvedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const { rows } = await db.query(
    `
      SELECT
        id,
        ran_at,
        triggered_by,
        total_deleted,
        resources_deleted,
        user_count,
        status,
        error
      FROM resource_cleanup_logs
      WHERE request_id = $1
      ORDER BY ran_at DESC
      LIMIT $2
    `,
    [requestId, resolvedLimit]
  );

  return rows.map((row) => {
    let deletedCount = Number(row.total_deleted || 0);
    if (!deletedCount && row.resources_deleted) {
      try {
        const parsed = Array.isArray(row.resources_deleted)
          ? row.resources_deleted
          : JSON.parse(row.resources_deleted);
        deletedCount = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        deletedCount = 0;
      }
    }

    return {
      id: row.id,
      ranAt: row.ran_at,
      triggeredBy: row.triggered_by || (row.user_count === 1 ? 'admin_manual' : 'scheduler'),
      totalDeleted: deletedCount,
      status: row.status || (row.error ? 'failed' : 'success'),
      error: row.error || null,
      details: row.resources_deleted
    };
  });
};

const unblockUser = async ({ requestId, userId, adminEmail, resetUsage = false }) => {
  const { DateTime } = require('luxon');
  const { createGraphClient } = require('../provisioners/azure/userProvisioner');

  const userResult = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.azure_user_id,
        au.request_id,
        au.azure_account_enabled,
        au.status,
        au.blocked_until
      FROM azure_users au
      WHERE au.request_id = $1
        AND au.id = $2
        AND COALESCE(au.is_deleted, false) = false
      LIMIT 1
    `,
    [requestId, userId]
  );

  if (!userResult.rows.length) {
    throw new AppError('User not found for this request.', 404);
  }

  const user = userResult.rows[0];

  if (!user.azure_user_id) {
    throw new AppError('User has no Azure account to unblock.', 400);
  }

  const windowResult = await db.query(
    `
      SELECT timezone
      FROM request_usage_windows
      WHERE request_id = $1
      LIMIT 1
    `,
    [requestId]
  );
  const timezone = windowResult.rows[0]?.timezone || 'Asia/Kolkata';
  const todayDate = DateTime.now().setZone(timezone).toISODate();

  const { graphClient } = createGraphClient();
  await graphClient.api(`/users/${user.azure_user_id}`).patch({ accountEnabled: true });

  await db.query(
    `
      UPDATE azure_users
      SET
        azure_account_enabled = TRUE,
        blocked_until = NULL,
        used_today_minutes = CASE WHEN $2 THEN 0 ELSE used_today_minutes END,
        status = CASE WHEN status = 'Blocked' THEN 'Created' ELSE status END
      WHERE id = $1
    `,
    [userId, resetUsage]
  );

  if (resetUsage) {
    await db.query(
      `
        INSERT INTO daily_usage_tracking
          (request_id, azure_user_id, tracking_date, consumed_minutes, limit_reached, limit_reached_at)
        VALUES ($1, $2, $3, 0, FALSE, NULL)
        ON CONFLICT (azure_user_id, tracking_date)
        DO UPDATE SET
          consumed_minutes = 0,
          limit_reached = FALSE,
          limit_reached_at = NULL,
          updated_at = NOW()
      `,
      [requestId, userId, todayDate]
    );
  } else {
    await db.query(
      `
        UPDATE daily_usage_tracking
        SET
          limit_reached = FALSE,
          limit_reached_at = NULL,
          updated_at = NOW()
        WHERE azure_user_id = $1
          AND tracking_date = $2
      `,
      [userId, todayDate]
    );
  }

  await db.query(
    `
      INSERT INTO access_portal_audit_logs (request_id, customer_email, actor, action, target_user_id, details)
      SELECT r.id, r.customer_email, $1, 'user_unblocked', $2, $3::jsonb
      FROM requests r
      WHERE r.id = $4
    `,
    [adminEmail || 'org-admin', userId, JSON.stringify({ resetUsage }), requestId]
  );

  return {
    userId,
    username: user.username,
    resetUsage
  };
};

const getUserSessions = async (requestId, userId, { limit = 50 } = {}) => {
  const resolvedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const userResult = await db.query(
    `
      SELECT id, username
      FROM azure_users
      WHERE request_id = $1
        AND id = $2
        AND COALESCE(is_deleted, false) = false
      LIMIT 1
    `,
    [requestId, userId]
  );

  if (!userResult.rows.length) {
    throw new AppError('User not found for this request.', 404);
  }

  const { rows } = await db.query(
    `
      SELECT
        id,
        login_at,
        logout_at,
        minutes_used,
        ended_reason,
        ip_address,
        CASE
          WHEN logout_at IS NULL THEN 'Active'
          ELSE COALESCE(ended_reason, 'closed')
        END AS status,
        CASE
          WHEN logout_at IS NULL
            THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - login_at)) / 60)
          ELSE COALESCE(minutes_used, FLOOR(EXTRACT(EPOCH FROM (logout_at - login_at)) / 60))
        END AS duration_minutes
      FROM user_usage_sessions
      WHERE user_id = $1
        AND login_at >= NOW() - INTERVAL '7 days'
      ORDER BY login_at DESC
      LIMIT $2
    `,
    [userId, resolvedLimit]
  );

  const user = userResult.rows[0];

  return rows.map((row) => ({
    id: row.id,
    loginAt: row.login_at,
    logoutAt: row.logout_at,
    minutesUsed: row.duration_minutes != null ? Number(row.duration_minutes) : null,
    endedReason: row.ended_reason,
    ipAddress: row.ip_address,
    status: row.status,
    isActive: row.logout_at == null
  }));
};

const listAzureRoles = () => [
  { name: 'Owner', definitionId: '8e3af657-a8ff-443c-a75c-2fe8c4bcb635' },
  { name: 'Contributor', definitionId: 'b24988ac-6180-42a0-ab88-20f7382dd24c' },
  { name: 'Reader', definitionId: 'acdd72a7-3385-48ef-bd42-f606fba81ae7' },
  { name: 'Virtual Machine Contributor', definitionId: '9980e02c-c2be-4d73-94e8-173b1dc7cf3c' },
  {
    name: 'Virtual Machine Administrator Login',
    definitionId: '1c0163c0-47e6-4577-8991-ea5c82e286e4'
  },
  { name: 'Storage Blob Data Contributor', definitionId: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe' },
  { name: 'Storage Account Contributor', definitionId: '17d1049b-9a84-46fb-8f53-869881c3d3ab' },
  { name: 'SQL DB Contributor', definitionId: '9b7fa17d-e63e-47b0-bb0a-15c516ac86ec' },
  { name: 'AKS Cluster User Role', definitionId: '4abbcc35-e782-43d8-92c5-2d3f1bd2253f' },
  { name: 'Key Vault Contributor', definitionId: 'f25e0fa2-a7c8-4b68-b2c4-4e531fbf2015' },
  { name: 'Network Contributor', definitionId: '4d97b98b-1d4f-4787-a291-c67834d212e7' },
  { name: 'Monitoring Reader', definitionId: '43d0d8ad-25c7-4714-9337-8ba259a9fe05' }
];

module.exports = {
  listResourceGroups,
  listRequests,
  getResourceGroupDetail,
  getMonitoringLogs,
  deleteUser,
  deleteRequest,
  updateUserRoles,
  forceLogoutUser,
  listAccessRequests,
  reviewAccessRequest,
  getUserAzureCost,
  getSharedAzureCostForRequest,
  getDailyUsageForRequest,
  listAzureRoles,
  renewUserBudget,
  updateUserCleanupSettings,
  triggerUserCleanup,
  triggerRequestCleanup,
  getCleanupLogs,
  getLabHistory,
  getUserSessions,
  unblockUser
};
