const db = require('../db/postgres');
const { DateTime } = require('luxon');
const adminAccessRequestService = require('./adminAccessRequestService');
const AppError = require('../utils/AppError');
const adminAuthService = require('./adminAuthService');
const managePortalService = require('./managePortalService');
const usageService = require('./usageService');
const { evaluateUsageAccess } = require('./usageAccessEvaluator');
const { isPerUserCosting } = require('../utils/costingMode');
const { getStagingResourceGroups, getResourceGroupNameForUser } = require('./userResourceGroupService');
const { attachLiveUsageToUsers } = require('./userLiveUsageService');
const { getResourceGroupCosts } = require('./azureCostManagementService');
const { formatMinutes } = require('../utils/formatMinutes');

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
    currentSessionMinutes: Number(row.active_session_minutes || 0)
  });

  return {
    id: row.id,
    username: row.username,
    azureUserId: row.azure_user_id,
    status: row.status,
    createdAt: row.created_at,
    expiryDate: row.expiry_date,
    enableDailyUsage: row.enable_daily_usage === true,
    dailyLimitMinutes: Number(row.daily_limit_minutes || 0),
    usedTodayMinutes: Number(access.usedMinutes || 0),
    remainingMinutes: access.remainingMinutes,
    blockedUntil: row.blocked_until,
    hasActiveSession: Number(row.active_session_count || 0) > 0,
    lastLoginAt: row.last_login_at,
    resourceGroup: row.azure_resource_group_name || null,
    roles: row.roles || []
  };
};

const login = async ({ email, username, password }) => {
  const admin = await adminAuthService.verifyOrgAdminCredentials({ email, username, password });
  const session = await adminAuthService.createOrgAdminSession(admin.id);

  return {
    admin,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt
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
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule,
        r.enforce_in_azure,
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
        r.expiry_date,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule,
        COUNT(uus.id) FILTER (WHERE uus.logout_at IS NULL) AS active_session_count,
        MAX(uus.login_at) AS last_login_at,
        COALESCE(
          SUM(
            CASE
              WHEN uus.logout_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - uus.login_at)) / 60
              ELSE 0
            END
          ),
          0
        ) AS active_session_minutes,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'role', ura.azure_role,
              'scope', ura.scope
            )
          ) FILTER (WHERE ura.azure_role IS NOT NULL),
          '[]'::json
        ) AS roles
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      LEFT JOIN user_usage_sessions uus ON uus.request_id = au.request_id AND uus.user_id = au.id
      LEFT JOIN user_role_assignments ura ON ura.request_id = au.request_id AND ura.user_id = au.id
      WHERE au.request_id = $1
        AND COALESCE(au.is_deleted, false) = false
      GROUP BY
        au.id,
        au.username,
        au.azure_user_id,
        au.status,
        au.created_at,
        au.used_today_minutes,
        au.blocked_until,
        au.last_reset_date,
        au.azure_resource_group_name,
        r.expiry_date,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule
      ORDER BY au.created_at DESC
    `,
    [requestId]
  );

  const perUserResourceGroups = isPerUserCosting(request.costing_mode)
    ? await getStagingResourceGroups(requestId)
    : [];

  const mappedUsers = usersResult.rows.map(mapUserUsage);
  const { users, liveSummary } = await attachLiveUsageToUsers(
    requestId,
    mappedUsers,
    request.location
  );

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
      enableDailyUsage: request.enable_daily_usage === true,
      dailyLimitMinutes: Number(request.daily_limit_minutes || 0),
      usageSchedule: request.usage_schedule,
      enforceInAzure: request.enforce_in_azure === true,
      createdAt: request.created_at,
      liveSummary
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

const getUserAzureCost = async (requestId, userId) => {
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
  const costs = await getResourceGroupCosts({
    resourceGroupName: resourceGroup,
    requestCreatedAt: request.created_at
  });

  let monthToDateCost = costs.monthToDateCost;
  let lifetimeCost = costs.lifetimeCost;
  let attributionMethod = 'direct';
  let resourceGroupTotalCost = null;
  let sharePercent = null;

  if (!perUserCosting) {
    const minutesResult = await db.query(
      `
        SELECT
          uus.user_id,
          COALESCE(
            SUM(
              CASE
                WHEN uus.logout_at IS NULL
                  THEN EXTRACT(EPOCH FROM (NOW() - uus.login_at)) / 60
                ELSE COALESCE(
                  uus.minutes_used,
                  EXTRACT(EPOCH FROM (uus.logout_at - uus.login_at)) / 60
                )
              END
            ),
            0
          ) AS total_minutes
        FROM user_usage_sessions uus
        WHERE uus.request_id = $1
        GROUP BY uus.user_id
      `,
      [requestId]
    );

    const minutesByUser = new Map(
      minutesResult.rows.map((row) => [Number(row.user_id), Number(row.total_minutes || 0)])
    );
    const userMinutes = minutesByUser.get(Number(userId)) || 0;
    const totalMinutes = [...minutesByUser.values()].reduce((sum, value) => sum + value, 0);

    resourceGroupTotalCost = {
      monthToDateCost: costs.monthToDateCost,
      lifetimeCost: costs.lifetimeCost
    };

    if (totalMinutes > 0 && userMinutes > 0) {
      const ratio = userMinutes / totalMinutes;
      monthToDateCost = Number((costs.monthToDateCost * ratio).toFixed(4));
      lifetimeCost = Number((costs.lifetimeCost * ratio).toFixed(4));
      sharePercent = Number((ratio * 100).toFixed(2));
      attributionMethod = 'proportional';
    } else {
      monthToDateCost = 0;
      lifetimeCost = 0;
      sharePercent = 0;
      attributionMethod = 'proportional';
    }
  }

  return {
    userId: Number(userId),
    username: user.username,
    resourceGroup,
    costingMode: request.costing_mode,
    attributionMethod,
    monthToDateCost,
    lifetimeCost,
    currency: costs.currency,
    resourceGroupTotalCost,
    sharePercent,
    dataFreshnessNote:
      'Azure billing data is typically delayed by several hours and may not include the current session.',
    queriedAt: new Date().toISOString()
  };
};

const getDailyUsageForRequest = async (requestId) => {
  const requestResult = await db.query(
    `
      SELECT id
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  if (!requestResult.rows.length) {
    throw new AppError('Resource group request not found.', 404);
  }

  const { rows: windowRows } = await db.query(
    `
      SELECT timezone
      FROM request_usage_windows
      WHERE request_id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const tz = windowRows[0]?.timezone || 'Asia/Kolkata';
  const nowInTz = DateTime.now().setZone(tz);
  const todayDate = nowInTz.toISODate();
  const dayOfWeek = nowInTz.weekday % 7;

  const { rows: todayWindow } = await db.query(
    `
      SELECT daily_limit_hours, window_start_time, window_end_time
      FROM request_usage_windows
      WHERE request_id = $1
        AND day_of_week = $2
    `,
    [requestId, dayOfWeek]
  );

  const dailyLimitHours = todayWindow[0]?.daily_limit_hours ?? null;
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

  const dayStart = nowInTz.startOf('day').toUTC().toISO();
  const dayEnd = nowInTz.endOf('day').toUTC().toISO();

  const data = await Promise.all(
    users.map(async (user) => {
      const { rows: sessionRows } = await db.query(
        `
          SELECT
            COALESCE(SUM(
              EXTRACT(EPOCH FROM (COALESCE(logout_at, NOW()) - login_at)) / 60
            ), 0) AS total_minutes
          FROM user_usage_sessions
          WHERE user_id = $1
            AND login_at >= $2
            AND login_at < $3
        `,
        [user.id, dayStart, dayEnd]
      );

      const consumedMinutes = parseFloat(sessionRows[0]?.total_minutes ?? 0);
      const remainingMinutes = dailyLimitMinutes
        ? Math.max(0, dailyLimitMinutes - consumedMinutes)
        : null;
      const roundedConsumed = Math.round(consumedMinutes);
      const roundedRemaining = remainingMinutes !== null ? Math.round(remainingMinutes) : null;

      return {
        userId: user.id,
        username: user.username,
        email: user.username,
        accountEnabled: user.azure_account_enabled !== false,
        limitReached: user.limit_reached,
        dailyLimitHours: dailyLimitHours !== null ? Number(dailyLimitHours) : null,
        consumedMinutes: roundedConsumed,
        remainingMinutes: roundedRemaining,
        consumedFormatted: formatMinutes(roundedConsumed),
        remainingFormatted: roundedRemaining !== null ? formatMinutes(roundedRemaining) : null,
        todayWindow: todayWindow[0]
          ? {
              start: todayWindow[0].window_start_time,
              end: todayWindow[0].window_end_time
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

module.exports = {
  login,
  listResourceGroups,
  getResourceGroupDetail,
  getMonitoringLogs,
  deleteUser,
  updateUserRoles,
  forceLogoutUser,
  listAccessRequests,
  reviewAccessRequest,
  getUserAzureCost,
  getDailyUsageForRequest
};
