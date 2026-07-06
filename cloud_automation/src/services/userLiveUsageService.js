const db = require('../db/postgres');
const { DateTime } = require('luxon');
const { getHourlyRateForProvisionedResources } = require('./estimatePricingService');
const { getProvisionedResourcesForRequest } = require('./serviceResourceProvisionService');

const ACTIVE_RESOURCE_STATUSES = new Set(['policy_configured', 'provisioned']);

const roundCurrency = (value) => Number(Number(value || 0).toFixed(4));

const getSessionStatsByUser = async (requestId) => {
  const todayStart = DateTime.now().setZone('Asia/Kolkata').startOf('day').toUTC().toISO();

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
              WHEN uus.login_at >= $2
                THEN EXTRACT(EPOCH FROM (COALESCE(uus.logout_at, NOW()) - uus.login_at)) / 60
              ELSE 0
            END
          ),
          0
        ) AS today_minutes,
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
    [requestId, todayStart]
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.user_id),
      {
        totalMinutesSpent: Number(row.lifetime_minutes || 0),
        todayMinutes: Number(row.today_minutes || 0),
        activeSessionMinutes: Number(row.active_session_minutes || 0),
        activeSessionCount: Number(row.active_session_count || 0),
        activeLoginAt: row.active_login_at,
        activeLastSeenAt: row.active_last_seen_at
      }
    ])
  );
};

const getLiveUsageForRequest = async (requestId, location) => {
  const [provisionedResources, sessionStatsByUser] = await Promise.all([
    getProvisionedResourcesForRequest(requestId),
    getSessionStatsByUser(requestId)
  ]);

  const pricing = await getHourlyRateForProvisionedResources(provisionedResources, location);
  const resourceCount = provisionedResources.filter((row) =>
    ACTIVE_RESOURCE_STATUSES.has(String(row.status || ''))
  ).length;

  return {
    hourlyResourceRate: pricing.hourlyRate,
    resourceCount,
    resources: pricing.resources,
    sessionStatsByUser
  };
};

const attachLiveUsageToUsers = async (requestId, users, location, options = {}) => {
  const { liveResourceCountByUser = null } = options;
  const liveUsage = await getLiveUsageForRequest(requestId, location);

  const enrichedUsers = users.map((user) => {
    const userId = Number(user.id);
    const sessionStats = liveUsage.sessionStatsByUser.get(userId) || {
      totalMinutesSpent: 0,
      todayMinutes: 0,
      activeSessionMinutes: 0,
      activeSessionCount: 0,
      activeLoginAt: null,
      activeLastSeenAt: null
    };

    const storedTodayMinutes = Number(user.usedTodayMinutes || 0);
    const sessionTodayMinutes = Number(sessionStats.todayMinutes || 0);
    const todayMinutes = Math.max(storedTodayMinutes, sessionTodayMinutes);
    const lifetimeMinutes = Number(sessionStats.totalMinutesSpent || 0);
    const activeSessionMinutes = Number(sessionStats.activeSessionMinutes || 0);
    const hasActiveSession = sessionStats.activeSessionCount > 0;
    const liveCost =
      liveUsage.hourlyResourceRate > 0 && activeSessionMinutes > 0
        ? roundCurrency((activeSessionMinutes / 60) * liveUsage.hourlyResourceRate)
        : 0;

    const liveResourceCount =
      liveResourceCountByUser?.get(userId) ??
      liveResourceCountByUser?.get(user.id) ??
      user.liveResourceCount ??
      liveUsage.resourceCount;

    return {
      ...user,
      liveResourceCount,
      resourceCount: liveResourceCount,
      totalMinutesSpent: Number(lifetimeMinutes.toFixed(2)),
      todayMinutes: Number(todayMinutes.toFixed(2)),
      usedTodayMinutes: Number(Math.max(storedTodayMinutes, todayMinutes).toFixed(2)),
      activeSessionMinutes: Number(activeSessionMinutes.toFixed(2)),
      hourlyResourceRate: liveUsage.hourlyResourceRate,
      liveCost,
      hasActiveSession,
      sessionActive: hasActiveSession,
      sessionStartedAt: sessionStats.activeLoginAt || null,
      lastSeenAt: sessionStats.activeLastSeenAt || null,
      isOnline: hasActiveSession
    };
  });

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
