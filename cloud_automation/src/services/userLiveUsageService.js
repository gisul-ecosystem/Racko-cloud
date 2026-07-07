const db = require('../db/postgres');
const { DateTime } = require('luxon');
const { getHourlyRateForProvisionedResources } = require('./estimatePricingService');
const { getProvisionedResourcesForRequest } = require('./serviceResourceProvisionService');
const { getClosedSessionMinutesToday } = require('./dailyUsageEnforcementService');

const ACTIVE_RESOURCE_STATUSES = new Set(['policy_configured', 'provisioned']);

const roundCurrency = (value) => Number(Number(value || 0).toFixed(4));

const getRequestServiceHourlyRate = async (requestId) => {
  const result = await db.query(
    `
      SELECT COALESCE(SUM(s.price_per_user), 0) AS hourly_rate
      FROM request_services rs
      INNER JOIN services s ON s.id = rs.service_id
      WHERE rs.request_id = $1
    `,
    [requestId]
  );

  return parseFloat(result.rows[0]?.hourly_rate || 0);
};

const getTodayTrackingDate = () =>
  DateTime.now().setZone('Asia/Kolkata').toISODate();

const getSessionStatsByUser = async (requestId) => {
  const todayStart = DateTime.now().setZone('Asia/Kolkata').startOf('day').toUTC().toISO();
  const trackingDate = getTodayTrackingDate();

  const result = await db.query(
    `
      SELECT
        uus.user_id,
        COALESCE(
          SUM(
            EXTRACT(EPOCH FROM (COALESCE(uus.logout_at, NOW()) - uus.login_at)) / 60
          ),
          0
        ) AS lifetime_minutes,
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
        COUNT(*) FILTER (WHERE uus.logout_at IS NULL) AS active_session_count,
        MAX(uus.login_at) FILTER (WHERE uus.logout_at IS NULL) AS active_login_at,
        MAX(COALESCE(uus.last_seen_at, uus.login_at)) FILTER (WHERE uus.logout_at IS NULL) AS active_last_seen_at
      FROM user_usage_sessions uus
      WHERE uus.request_id = $1
      GROUP BY uus.user_id
    `,
    [requestId]
  );

  const closedMinutesByUser = await Promise.all(
    result.rows.map(async (row) => {
      const closedMinutes = await getClosedSessionMinutesToday(
        Number(row.user_id),
        trackingDate,
        'Asia/Kolkata'
      );
      return [Number(row.user_id), closedMinutes];
    })
  );
  const closedMinutesMap = new Map(closedMinutesByUser);

  return new Map(
    result.rows.map((row) => {
      const userId = Number(row.user_id);
      const closedTodayMinutes = closedMinutesMap.get(userId) ?? 0;
      const activeSessionMinutes = Number(row.active_session_minutes || 0);

      return [
        userId,
        {
          totalMinutesSpent: Number(row.lifetime_minutes || 0),
          closedTodayMinutes,
          todayMinutes: closedTodayMinutes + activeSessionMinutes,
          activeSessionMinutes,
          activeSessionCount: Number(row.active_session_count || 0),
          activeLoginAt: row.active_login_at,
          activeLastSeenAt: row.active_last_seen_at
        }
      ];
    })
  );
};

const getLiveUsageForRequest = async (requestId, location) => {
  const [provisionedResources, sessionStatsByUser, serviceHourlyRate] = await Promise.all([
    getProvisionedResourcesForRequest(requestId),
    getSessionStatsByUser(requestId),
    getRequestServiceHourlyRate(requestId)
  ]);

  const pricing = await getHourlyRateForProvisionedResources(provisionedResources, location);
  const resourceCount = provisionedResources.filter((row) =>
    ACTIVE_RESOURCE_STATUSES.has(String(row.status || ''))
  ).length;
  const hourlyRate =
    pricing.hourlyRate > 0 ? pricing.hourlyRate : parseFloat(serviceHourlyRate || 0);

  return {
    hourlyResourceRate: hourlyRate,
    serviceHourlyRate: parseFloat(serviceHourlyRate || 0),
    resourceCount,
    resources: pricing.resources,
    sessionStatsByUser
  };
};

const attachLiveUsageToUsers = async (requestId, users, location, options = {}) => {
  const { liveResourceCountByUser = null } = options;
  const liveUsage = await getLiveUsageForRequest(requestId, location);

  const enrichedUsers = await Promise.all(
    users.map(async (user) => {
      const userId = Number(user.id);
      const sessionStats = liveUsage.sessionStatsByUser.get(userId) || {
        totalMinutesSpent: 0,
        closedTodayMinutes: 0,
        todayMinutes: 0,
        activeSessionMinutes: 0,
        activeSessionCount: 0,
        activeLoginAt: null,
        activeLastSeenAt: null
      };

      const closedTodayMinutes = Number(sessionStats.closedTodayMinutes || 0);
      const liveSessionMins = Math.floor(Number(sessionStats.activeSessionMinutes || 0));
      const hasActiveSession = sessionStats.activeSessionCount > 0;
      const totalUsedMins = Math.round(closedTodayMinutes + liveSessionMins);
      const lifetimeMinutes = Number(sessionStats.totalMinutesSpent || 0);

      const hourlyRate = parseFloat(
        user.price_per_user ||
          user.hourly_rate ||
          liveUsage.hourlyResourceRate ||
          liveUsage.serviceHourlyRate ||
          0.1
      );

      const liveCost =
        hourlyRate > 0 && liveSessionMins > 0
          ? roundCurrency((liveSessionMins / 60) * hourlyRate)
          : 0;

      const closedSessionCost =
        hourlyRate > 0 && closedTodayMinutes > 0
          ? roundCurrency((closedTodayMinutes / 60) * hourlyRate)
          : 0;

      const totalCostToday =
        hourlyRate > 0 && totalUsedMins > 0
          ? roundCurrency((totalUsedMins / 60) * hourlyRate)
          : 0;

      const liveResourceCount =
        liveResourceCountByUser?.get(userId) ??
        liveResourceCountByUser?.get(user.id) ??
        user.liveResourceCount ??
        liveUsage.resourceCount;

      const azureCostResult = await db.query(
        `
          SELECT current_spend, currency, last_synced_at, sync_error, last_sync_attempted_at
          FROM user_budget_spend
          WHERE azure_user_id = $1
          LIMIT 1
        `,
        [userId]
      );
      const azureCost = azureCostResult.rows[0] || null;

      return {
        ...user,
        liveResourceCount,
        resourceCount: liveResourceCount,
        totalMinutesSpent: Number(lifetimeMinutes.toFixed(2)),
        todayMinutes: Number(totalUsedMins.toFixed(2)),
        usedTodayMinutes: totalUsedMins,
        storedMinsToday: Math.round(closedTodayMinutes),
        activeSessionMinutes: Number(sessionStats.activeSessionMinutes || 0),
        liveSessionMins,
        hourlyResourceRate: hourlyRate,
        hourlyRate,
        liveCost,
        closedSessionCost,
        totalCostToday,
        liveCostRate: `$${hourlyRate.toFixed(2)}/hr`,
        hasActiveSession,
        sessionActive: hasActiveSession,
        sessionStartedAt: sessionStats.activeLoginAt || null,
        lastSeenAt: sessionStats.activeLastSeenAt || null,
        isOnline: hasActiveSession,
        azureCostMtd: parseFloat(azureCost?.current_spend || user.azureCostMtd || 0),
        azureCostLifetime: parseFloat(azureCost?.current_spend || user.azureCostLifetime || 0),
        lastCostSyncedAt: azureCost?.last_synced_at || user.lastCostSyncedAt || null,
        costCurrency: azureCost?.currency || user.costCurrency || 'USD',
        syncError: azureCost?.sync_error || user.syncError || null,
        lastSyncAttemptedAt: azureCost?.last_sync_attempted_at || user.lastSyncAttemptedAt || null
      };
    })
  );

  const totalLiveCost = roundCurrency(
    enrichedUsers.reduce((sum, user) => sum + Number(user.liveCost || 0), 0)
  );
  const totalMinutesSpent = enrichedUsers.reduce(
    (sum, user) => sum + Number(user.totalMinutesSpent || 0),
    0
  );
  const azureResourceCount = liveResourceCountByUser
    ? [...liveResourceCountByUser.values()].reduce((sum, count) => sum + Number(count || 0), 0)
    : liveUsage.resourceCount;

  return {
    users: enrichedUsers,
    liveSummary: {
      hourlyResourceRate: liveUsage.hourlyResourceRate,
      resourceCount: azureResourceCount,
      resources: liveUsage.resources,
      totalLiveCost,
      totalMinutesSpent: Number(totalMinutesSpent.toFixed(2))
    }
  };
};

module.exports = {
  getLiveUsageForRequest,
  attachLiveUsageToUsers
};
