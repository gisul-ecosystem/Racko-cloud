const { DateTime } = require('luxon');
const db = require('../db/postgres');
const { sumMergedSessionMinutes } = require('../utils/sessionIntervalMerge');
const { loadUsageWindowsByRequest, getTodayWindowConfig } = require('./usageWindowAccessService');

const round4 = (value) => Number(Number(value || 0).toFixed(4));

const getSessionMergeGapMs = () =>
  Number(process.env.SESSION_MERGE_GAP_MINUTES || 2) * 60 * 1000;

async function getRequestHourlyRate(requestId) {
  const { rows } = await db.query(
    `
      SELECT COALESCE(SUM(s.price_per_user), 0) AS hourly_rate
      FROM request_services rs
      INNER JOIN services s ON s.id = rs.service_id
      WHERE rs.request_id = $1
    `,
    [requestId]
  );

  return parseFloat(rows[0]?.hourly_rate || 0);
}

async function getUserUsageTimezone(requestId) {
  const windowsByRequest = await loadUsageWindowsByRequest([Number(requestId)]);
  const windows = windowsByRequest.get(Number(requestId)) || [];
  return getTodayWindowConfig(windows)?.timezone || 'Asia/Kolkata';
}

async function computeLifetimeMinutes(userId, requestId) {
  const { rows } = await db.query(
    `
      SELECT login_at, COALESCE(logout_at, NOW()) AS end_at
      FROM user_usage_sessions
      WHERE user_id = $1 AND request_id = $2
      ORDER BY login_at ASC
    `,
    [userId, requestId]
  );

  const intervals = rows.map((row) => ({
    start: new Date(row.login_at),
    end: new Date(row.end_at)
  }));

  return sumMergedSessionMinutes(intervals, getSessionMergeGapMs());
}

async function computeTodayMinutes(userId, requestId, timezone) {
  const tz = timezone || 'Asia/Kolkata';
  const todayDate = DateTime.now().setZone(tz).toISODate();

  const { rows } = await db.query(
    `
      SELECT login_at, COALESCE(logout_at, NOW()) AS end_at
      FROM user_usage_sessions
      WHERE user_id = $1
        AND request_id = $2
        AND DATE(login_at AT TIME ZONE $3) = $4::date
      ORDER BY login_at ASC
    `,
    [userId, requestId, tz, todayDate]
  );

  const intervals = rows.map((row) => ({
    start: new Date(row.login_at),
    end: new Date(row.end_at)
  }));

  return sumMergedSessionMinutes(intervals, getSessionMergeGapMs());
}

async function captureUserLabMetrics(requestId, userId) {
  const { rows: userRows } = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.last_resource_count,
        au.peak_resource_count,
        COALESCE(ubs.current_spend, 0) AS azure_cost_mtd
      FROM azure_users au
      LEFT JOIN user_budget_spend ubs ON ubs.azure_user_id = au.id
      WHERE au.id = $1
        AND au.request_id = $2
        AND COALESCE(au.is_deleted, FALSE) = FALSE
      LIMIT 1
    `,
    [userId, requestId]
  );

  if (!userRows.length) {
    return null;
  }

  const user = userRows[0];
  const timezone = await getUserUsageTimezone(requestId);
  const hourlyRate = await getRequestHourlyRate(requestId);
  const lifetimeMinutes = await computeLifetimeMinutes(userId, requestId);
  const todayMinutes = await computeTodayMinutes(userId, requestId, timezone);
  const liveCostUsd = round4((lifetimeMinutes / 60) * hourlyRate);

  return {
    userId: user.id,
    username: user.username,
    resourceCount: Number(user.last_resource_count || 0),
    peakResourceCount: Number(user.peak_resource_count || 0),
    totalMinutesLifetime: round4(lifetimeMinutes),
    totalMinutesToday: round4(todayMinutes),
    liveCostUsd,
    azureCostMtdUsd: round4(parseFloat(user.azure_cost_mtd || 0)),
    hourlyRateUsd: hourlyRate
  };
}

async function recordCleanupSnapshot({
  requestId,
  userId,
  triggeredBy,
  cleanupAction,
  resourcesDeleted,
  metrics: precomputedMetrics
}) {
  const metrics = precomputedMetrics || (await captureUserLabMetrics(requestId, userId));
  if (!metrics) {
    return null;
  }

  const deletedList = Array.isArray(resourcesDeleted) ? resourcesDeleted : [];

  const { rows } = await db.query(
    `
      INSERT INTO lab_history_snapshots (
        request_id,
        user_id,
        event_type,
        event_at,
        resource_count,
        peak_resource_count,
        total_minutes_lifetime,
        total_minutes_today,
        live_cost_usd,
        azure_cost_mtd_usd,
        resources_deleted,
        cleanup_triggered_by,
        cleanup_action,
        metadata
      )
      VALUES ($1, $2, 'cleanup', NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `,
    [
      requestId,
      userId,
      metrics.resourceCount,
      metrics.peakResourceCount,
      metrics.totalMinutesLifetime,
      metrics.totalMinutesToday,
      metrics.liveCostUsd,
      metrics.azureCostMtdUsd,
      JSON.stringify(deletedList),
      triggeredBy || 'scheduler',
      cleanupAction || 'delete',
      JSON.stringify({
        username: metrics.username,
        resourcesDeletedCount: deletedList.length,
        hourlyRateUsd: metrics.hourlyRateUsd
      })
    ]
  );

  return rows[0];
}

function mapSnapshotRow(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    userId: row.user_id,
    eventType: row.event_type,
    eventAt: row.event_at,
    resourceCount: row.resource_count != null ? Number(row.resource_count) : null,
    peakResourceCount:
      row.peak_resource_count != null ? Number(row.peak_resource_count) : null,
    totalMinutesLifetime:
      row.total_minutes_lifetime != null ? Number(row.total_minutes_lifetime) : null,
    totalMinutesToday:
      row.total_minutes_today != null ? Number(row.total_minutes_today) : null,
    liveCostUsd: row.live_cost_usd != null ? Number(row.live_cost_usd) : null,
    azureCostMtdUsd: row.azure_cost_mtd_usd != null ? Number(row.azure_cost_mtd_usd) : null,
    resourcesDeleted: row.resources_deleted,
    cleanupTriggeredBy: row.cleanup_triggered_by,
    cleanupAction: row.cleanup_action,
    metadata: row.metadata
  };
}

async function getLabHistoryForRequest(requestId, { userId = null, limit = 200 } = {}) {
  const resolvedLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const resolvedUserId = userId ? Number(userId) : null;

  const requestResult = await db.query(
    `
      SELECT id, expiry_date, created_at, per_user_budget_usd
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  if (!requestResult.rows.length) {
    return null;
  }

  const request = requestResult.rows[0];
  const hourlyRate = await getRequestHourlyRate(requestId);

  const usersResult = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.last_resource_count,
        au.peak_resource_count,
        COALESCE(ubs.current_spend, 0) AS azure_cost_mtd,
        COALESCE(ubs.budget_amount, r.per_user_budget_usd) AS budget_amount
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      LEFT JOIN user_budget_spend ubs ON ubs.azure_user_id = au.id
      WHERE au.request_id = $1
        AND COALESCE(au.is_deleted, FALSE) = FALSE
        ${resolvedUserId ? 'AND au.id = $2' : ''}
      ORDER BY au.username ASC
    `,
    resolvedUserId ? [requestId, resolvedUserId] : [requestId]
  );

  const userSummaries = [];

  for (const user of usersResult.rows) {
    const lifetimeMinutes = await computeLifetimeMinutes(user.id, requestId);
    const timezone = await getUserUsageTimezone(requestId);
    const todayMinutes = await computeTodayMinutes(user.id, requestId, timezone);

    const sessionStats = await db.query(
      `
        SELECT
          COUNT(*) AS session_count,
          COUNT(*) FILTER (WHERE logout_at IS NULL) AS open_sessions
        FROM user_usage_sessions
        WHERE request_id = $1 AND user_id = $2
      `,
      [requestId, user.id]
    );

    const cleanupStats = await db.query(
      `
        SELECT COUNT(*) AS cleanup_count
        FROM lab_history_snapshots
        WHERE request_id = $1 AND user_id = $2 AND event_type = 'cleanup'
      `,
      [requestId, user.id]
    );

    userSummaries.push({
      userId: user.id,
      username: user.username,
      totalMinutesLifetime: round4(lifetimeMinutes),
      totalMinutesToday: round4(todayMinutes),
      liveCostUsd: round4((lifetimeMinutes / 60) * hourlyRate),
      azureCostMtdUsd: round4(parseFloat(user.azure_cost_mtd || 0)),
      budgetAmountUsd: user.budget_amount != null ? Number(user.budget_amount) : null,
      currentResourceCount: Number(user.last_resource_count || 0),
      peakResourceCount: Number(user.peak_resource_count || 0),
      sessionCount: Number(sessionStats.rows[0]?.session_count || 0),
      openSessions: Number(sessionStats.rows[0]?.open_sessions || 0),
      cleanupRunCount: Number(cleanupStats.rows[0]?.cleanup_count || 0)
    });
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
        uus.user_id,
        au.username,
        uus.login_at,
        uus.logout_at,
        uus.minutes_used,
        uus.ended_reason,
        uus.last_seen_at,
        CASE
          WHEN uus.logout_at IS NULL
            THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - uus.login_at)) / 60)
          ELSE COALESCE(
            uus.minutes_used,
            FLOOR(EXTRACT(EPOCH FROM (uus.logout_at - uus.login_at)) / 60)
          )
        END AS duration_minutes
      FROM user_usage_sessions uus
      JOIN azure_users au ON au.id = uus.user_id AND au.request_id = uus.request_id
      WHERE uus.request_id = $1
        ${sessionFilter}
      ORDER BY uus.login_at DESC
      LIMIT $2
    `,
    sessionParams
  );

  const snapshotParams = [requestId, resolvedLimit];
  let snapshotFilter = '';
  if (resolvedUserId) {
    snapshotParams.push(resolvedUserId);
    snapshotFilter = 'AND lhs.user_id = $3';
  }

  let snapshots = [];
  try {
    const snapshotsResult = await db.query(
      `
        SELECT lhs.*, au.username
        FROM lab_history_snapshots lhs
        LEFT JOIN azure_users au ON au.id = lhs.user_id
        WHERE lhs.request_id = $1
          ${snapshotFilter}
        ORDER BY lhs.event_at DESC
        LIMIT $2
      `,
      snapshotParams
    );
    snapshots = snapshotsResult.rows.map((row) => ({
      ...mapSnapshotRow(row),
      username: row.username
    }));
  } catch {
    snapshots = [];
  }

  const dailyParams = [requestId];
  let dailyFilter = '';
  if (resolvedUserId) {
    dailyParams.push(resolvedUserId);
    dailyFilter = 'AND dut.azure_user_id = $2';
  }

  const dailyUsageResult = await db.query(
    `
      SELECT
        dut.azure_user_id AS user_id,
        au.username,
        dut.tracking_date,
        dut.consumed_minutes,
        dut.limit_reached,
        dut.limit_reached_at
      FROM daily_usage_tracking dut
      JOIN azure_users au ON au.id = dut.azure_user_id
      WHERE dut.request_id = $1
        ${dailyFilter}
      ORDER BY dut.tracking_date DESC, au.username ASC
    `,
    dailyParams
  );

  const cleanupLogsResult = await db.query(
    `
      SELECT id, ran_at, triggered_by, total_deleted, resources_deleted, user_count, status, error
      FROM resource_cleanup_logs
      WHERE request_id = $1
      ORDER BY ran_at DESC
      LIMIT $2
    `,
    [requestId, resolvedLimit]
  );

  const timeline = [];

  for (const row of sessionsResult.rows) {
    const duration = Number(row.duration_minutes || 0);
    timeline.push({
      id: `session-${row.id}`,
      type: 'session',
      at: row.login_at,
      userId: row.user_id,
      username: row.username,
      title: row.logout_at ? 'Session ended' : 'Session active',
      subtitle: row.ended_reason || (row.logout_at ? 'closed' : 'online'),
      minutes: duration,
      liveCostUsd: round4((duration / 60) * hourlyRate),
      logoutAt: row.logout_at,
      isActive: !row.logout_at
    });
  }

  for (const snap of snapshots) {
    const deletedCount = Array.isArray(snap.resourcesDeleted)
      ? snap.resourcesDeleted.length
      : 0;
    timeline.push({
      id: `cleanup-snap-${snap.id}`,
      type: 'cleanup_snapshot',
      at: snap.eventAt,
      userId: snap.userId,
      username: snap.username,
      title: 'Cleanup snapshot',
      subtitle: `${snap.cleanupAction || 'delete'} · ${deletedCount} resource(s) removed`,
      resourceCount: snap.resourceCount,
      peakResourceCount: snap.peakResourceCount,
      minutesLifetime: snap.totalMinutesLifetime,
      minutesToday: snap.totalMinutesToday,
      liveCostUsd: snap.liveCostUsd,
      azureCostMtdUsd: snap.azureCostMtdUsd,
      triggeredBy: snap.cleanupTriggeredBy
    });
  }

  for (const row of cleanupLogsResult.rows) {
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

    timeline.push({
      id: `cleanup-log-${row.id}`,
      type: 'cleanup_log',
      at: row.ran_at,
      userId: null,
      username: row.user_count === 1 ? 'Per user' : 'All users',
      title: 'Cleanup run',
      subtitle: row.triggered_by || 'scheduler',
      resourcesDeleted: deletedCount,
      status: row.status,
      error: row.error
    });
  }

  for (const row of dailyUsageResult.rows) {
    timeline.push({
      id: `daily-${row.user_id}-${row.tracking_date}`,
      type: 'daily_usage',
      at: row.limit_reached_at || row.tracking_date,
      userId: row.user_id,
      username: row.username,
      title: row.limit_reached ? 'Daily limit reached' : 'Daily usage recorded',
      subtitle: `${Number(row.consumed_minutes || 0).toFixed(0)} min used`,
      minutes: Number(row.consumed_minutes || 0),
      limitReached: row.limit_reached === true
    });
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const trimmedTimeline = timeline.slice(0, resolvedLimit);

  return {
    requestId: Number(requestId),
    expiryDate: request.expiry_date,
    labCreatedAt: request.created_at,
    hourlyRateUsd: hourlyRate,
    userSummaries,
    timeline: trimmedTimeline,
    sessions: sessionsResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      loginAt: row.login_at,
      logoutAt: row.logout_at,
      minutesUsed: Number(row.duration_minutes || 0),
      endedReason: row.ended_reason,
      liveCostUsd: round4((Number(row.duration_minutes || 0) / 60) * hourlyRate),
      isActive: !row.logout_at
    })),
    cleanupSnapshots: snapshots,
    dailyUsage: dailyUsageResult.rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      trackingDate: row.tracking_date,
      consumedMinutes: Number(row.consumed_minutes || 0),
      limitReached: row.limit_reached === true,
      limitReachedAt: row.limit_reached_at
    }))
  };
}

module.exports = {
  captureUserLabMetrics,
  recordCleanupSnapshot,
  getLabHistoryForRequest
};
