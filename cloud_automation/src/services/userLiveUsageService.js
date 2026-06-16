const db = require('../db/postgres');
const { getHourlyRateForProvisionedResources } = require('./estimatePricingService');
const { getProvisionedResourcesForRequest } = require('./serviceResourceProvisionService');

const ACTIVE_RESOURCE_STATUSES = new Set(['policy_configured', 'provisioned']);

const roundCurrency = (value) => Number(Number(value || 0).toFixed(4));

const getSessionStatsByUser = async (requestId) => {
  const result = await db.query(
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
        ) AS total_minutes,
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
        MAX(uus.login_at) FILTER (WHERE uus.logout_at IS NULL) AS active_login_at
      FROM user_usage_sessions uus
      WHERE uus.request_id = $1
      GROUP BY uus.user_id
    `,
    [requestId]
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.user_id),
      {
        totalMinutesSpent: Number(row.total_minutes || 0),
        activeSessionMinutes: Number(row.active_session_minutes || 0),
        activeSessionCount: Number(row.active_session_count || 0),
        activeLoginAt: row.active_login_at
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

const attachLiveUsageToUsers = async (requestId, users, location) => {
  const liveUsage = await getLiveUsageForRequest(requestId, location);

  const enrichedUsers = users.map((user) => {
    const sessionStats = liveUsage.sessionStatsByUser.get(user.id) || {
      totalMinutesSpent: 0,
      activeSessionMinutes: 0,
      activeSessionCount: 0,
      activeLoginAt: null
    };

    const totalHours = sessionStats.totalMinutesSpent / 60;
    const liveCost =
      liveUsage.hourlyResourceRate > 0 && totalHours > 0
        ? roundCurrency(liveUsage.hourlyResourceRate * totalHours)
        : 0;

    return {
      ...user,
      resourceCount: liveUsage.resourceCount,
      totalMinutesSpent: Number(sessionStats.totalMinutesSpent.toFixed(2)),
      activeSessionMinutes: Number(sessionStats.activeSessionMinutes.toFixed(2)),
      hourlyResourceRate: liveUsage.hourlyResourceRate,
      liveCost,
      hasActiveSession: sessionStats.activeSessionCount > 0 || user.hasActiveSession
    };
  });

  const totalLiveCost = roundCurrency(
    enrichedUsers.reduce((sum, user) => sum + Number(user.liveCost || 0), 0)
  );
  const totalMinutesSpent = enrichedUsers.reduce(
    (sum, user) => sum + Number(user.totalMinutesSpent || 0),
    0
  );

  return {
    users: enrichedUsers,
    liveSummary: {
      hourlyResourceRate: liveUsage.hourlyResourceRate,
      resourceCount: liveUsage.resourceCount,
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
