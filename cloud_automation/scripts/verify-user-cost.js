#!/usr/bin/env node
/**
 * Diagnostic CLI: compare stored Azure MTD, fresh Cost Management API, and Live cost estimates.
 *
 * Usage: node scripts/verify-user-cost.js <requestId> <userId>
 *
 * Uses a single Postgres client so it can run while npm run dev is active.
 * Prefer DATABASE_DIRECT_URL (Supabase direct connection) when the session pooler is full.
 */

require('dotenv').config();

const { DateTime } = require('luxon');
const { Client } = require('pg');
const { isPerUserCosting } = require('../src/utils/costingMode');
const { sumMergedSessionMinutes } = require('../src/utils/sessionIntervalMerge');

let db;
let queryCostForResourceGroup;
let getConsumedMinutesToday;
let loadTodaySessionIntervals;
let attachLiveUsageToUsers;
let getResourceGroupNameForUser;

const resolveScriptConnectionString = () => {
  if (process.env.DATABASE_DIRECT_URL) {
    return process.env.DATABASE_DIRECT_URL;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL missing');
  }

  return url.replace(
    /\.pooler\.supabase\.com:6543\//,
    '.pooler.supabase.com:5432/'
  );
};

const bootstrapScriptDb = async () => {
  const client = new Client({
    connectionString: resolveScriptConnectionString(),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    family: 4,
    statement_timeout: 15000,
    query_timeout: 15000
  });

  try {
    await client.connect();
  } catch (error) {
    if (String(error.message || '').includes('EMAXCONNSESSION')) {
      throw new Error(
        'Postgres session pool is full (dev server may be running). ' +
          'Set DATABASE_DIRECT_URL to the Supabase direct connection string, or stop npm run dev briefly.'
      );
    }
    throw error;
  }

  const pool = require('../src/db/postgres');
  let queryChain = Promise.resolve();
  pool.query = (text, params) => {
    const run = queryChain.then(() => client.query(text, params));
    queryChain = run.then(
      () => {},
      () => {}
    );
    return run;
  };
  pool.connect = async () => ({
    query: (text, params) => pool.query(text, params),
    release: async () => {}
  });
  pool.end = async () => {
    if (!client._ending) {
      await client.end();
    }
  };

  db = pool;
  ({ queryCostForResourceGroup } = require('../src/services/azureCostManagementService'));
  ({
    getConsumedMinutesToday,
    loadTodaySessionIntervals
  } = require('../src/services/dailyUsageEnforcementService'));
  ({ attachLiveUsageToUsers } = require('../src/services/userLiveUsageService'));
  ({ getResourceGroupNameForUser } = require('../src/services/userResourceGroupService'));
};

const roundCurrency = (value) => Number(Number(value || 0).toFixed(4));
const COST_TOLERANCE = 0.02;

const parseArgs = () => {
  const [requestIdRaw, userIdRaw] = process.argv.slice(2);

  const requestId = Number(requestIdRaw);
  const userId = Number(userIdRaw);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new Error('Usage: node scripts/verify-user-cost.js <requestId> <userId>');
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Usage: node scripts/verify-user-cost.js <requestId> <userId>');
  }

  return { requestId, userId };
};

const getUsageTimezone = async (requestId) => {
  const { rows } = await db.query(
    `
      SELECT timezone
      FROM request_usage_windows
      WHERE request_id = $1
      LIMIT 1
    `,
    [requestId]
  );

  return rows[0]?.timezone || 'Asia/Kolkata';
};

const loadUserContext = async (requestId, userId) => {
  const { rows } = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.request_id,
        au.azure_resource_group_name,
        r.costing_mode,
        r.location,
        r.created_at,
        r.per_user_budget_usd
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE au.request_id = $1
        AND au.id = $2
        AND COALESCE(au.is_deleted, FALSE) = FALSE
      LIMIT 1
    `,
    [requestId, userId]
  );

  const user = rows[0];

  if (!user) {
    throw new Error(`User ${userId} not found on request ${requestId}.`);
  }

  return user;
};

const loadStoredAzureCost = async (userId) => {
  const { rows } = await db.query(
    `
      SELECT
        current_spend,
        currency,
        last_synced_at,
        sync_error,
        last_sync_attempted_at
      FROM user_budget_spend
      WHERE azure_user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
};

const computeSharedAttribution = async (requestId, userId, rgMonthToDateCost) => {
  const { rows } = await db.query(
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
    rows.map((row) => [Number(row.user_id), Number(row.total_minutes || 0)])
  );
  const userMinutes = minutesByUser.get(Number(userId)) || 0;
  const totalMinutes = [...minutesByUser.values()].reduce((sum, value) => sum + value, 0);

  if (totalMinutes <= 0 || userMinutes <= 0) {
    return {
      attributedMonthToDateCost: 0,
      sharePercent: 0,
      userLifetimeMinutes: userMinutes,
      totalLifetimeMinutes: totalMinutes
    };
  }

  const ratio = userMinutes / totalMinutes;

  return {
    attributedMonthToDateCost: Number((rgMonthToDateCost * ratio).toFixed(4)),
    sharePercent: Number((ratio * 100).toFixed(2)),
    userLifetimeMinutes: userMinutes,
    totalLifetimeMinutes: totalMinutes
  };
};

const loadRawSessionMinutes = async (userId, timezone, trackingDate) => {
  const { rows } = await db.query(
    `
      SELECT
        COALESCE(
          SUM(
            EXTRACT(EPOCH FROM (COALESCE(logout_at, NOW()) - login_at)) / 60
          ),
          0
        ) AS raw_today_minutes,
        COALESCE(
          SUM(
            CASE
              WHEN logout_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - login_at)) / 60
              ELSE 0
            END
          ),
          0
        ) AS raw_active_minutes,
        COUNT(*) AS session_rows_today,
        COUNT(*) FILTER (WHERE logout_at IS NULL) AS open_sessions
      FROM user_usage_sessions
      WHERE user_id = $1
        AND DATE(login_at AT TIME ZONE $2) = $3::date
    `,
    [userId, timezone, trackingDate]
  );

  return rows[0] || {
    raw_today_minutes: 0,
    raw_active_minutes: 0,
    session_rows_today: 0,
    open_sessions: 0
  };
};

const formatMoney = (value, currency = 'USD') =>
  `${currency} ${Number(value || 0).toFixed(4)}`;

const printRow = (label, value) => {
  console.log(`${label.padEnd(42)} ${value}`);
};

const costsDiffer = (left, right, tolerance = COST_TOLERANCE) =>
  Math.abs(Number(left || 0) - Number(right || 0)) > tolerance;

const run = async () => {
  const { requestId, userId } = parseArgs();

  console.log('='.repeat(72));
  console.log(`Cost verification — request ${requestId}, user ${userId}`);
  console.log('='.repeat(72));

  const user = await loadUserContext(requestId, userId);
  const timezone = await getUsageTimezone(requestId);
  const trackingDate = DateTime.now().setZone(timezone).toISODate();
  const resourceGroup = await getResourceGroupNameForUser(requestId, userId);
  const perUserCosting = isPerUserCosting(user.costing_mode);

  if (!resourceGroup) {
    throw new Error('No Azure resource group is linked to this user/request.');
  }

  console.log(`Username:        ${user.username}`);
  console.log(`Costing mode:    ${user.costing_mode}${perUserCosting ? ' (direct RG cost)' : ' (proportional split)'}`);
  console.log(`Resource group:  ${resourceGroup}`);
  console.log(`Tracking date:   ${trackingDate} (${timezone})`);
  console.log('');

  // Sequential DB/API work — avoids EMAXCONNSESSION when dev server is running.
  const storedCost = await loadStoredAzureCost(userId);
  const freshApi = await queryCostForResourceGroup({ resourceGroupName: resourceGroup });
  const mergedMinutesToday = await getConsumedMinutesToday(userId, trackingDate, timezone);
  const sessionIntervals = await loadTodaySessionIntervals(userId, trackingDate, timezone);
  const rawSessions = await loadRawSessionMinutes(userId, timezone, trackingDate);

  const gapMs =
    Number(process.env.SESSION_MERGE_GAP_MINUTES || 2) * 60 * 1000;
  const mergedFromIntervals = sumMergedSessionMinutes(sessionIntervals, gapMs);

  const { users: enrichedUsers } = await attachLiveUsageToUsers(
    requestId,
    [{ id: userId }],
    user.location
  );
  const enriched = enrichedUsers[0] || {};

  const hourlyRate = parseFloat(enriched.hourlyRate || enriched.hourlyResourceRate || 0.1);
  const roundedMergedToday = Math.round(Number(mergedMinutesToday || 0));
  const rawTodayMinutes = Number(rawSessions.raw_today_minutes || 0);
  const rawActiveMinutes = Math.floor(Number(rawSessions.raw_active_minutes || 0));

  const manualMergedLiveCost =
    hourlyRate > 0 && roundedMergedToday > 0
      ? roundCurrency((roundedMergedToday / 60) * hourlyRate)
      : 0;
  const manualRawLiveCost =
    hourlyRate > 0 && rawTodayMinutes > 0
      ? roundCurrency((Math.round(rawTodayMinutes) / 60) * hourlyRate)
      : 0;
  const manualRawActiveLiveCost =
    hourlyRate > 0 && rawActiveMinutes > 0
      ? roundCurrency((rawActiveMinutes / 60) * hourlyRate)
      : 0;

  const sharedAttribution = perUserCosting
    ? null
    : await computeSharedAttribution(requestId, userId, freshApi.cost);

  const expectedStoredMtd = perUserCosting
    ? freshApi.cost
    : sharedAttribution?.attributedMonthToDateCost ?? 0;

  const flags = [];

  console.log('--- Azure Cost MTD ---');
  printRow('Stored (user_budget_spend)', formatMoney(storedCost?.current_spend, storedCost?.currency));
  printRow('Stored last_synced_at', storedCost?.last_synced_at || '(never synced)');
  if (storedCost?.sync_error) {
    printRow('Stored sync_error', storedCost.sync_error);
  }
  printRow('Fresh API (queryCostForResourceGroup)', formatMoney(freshApi.cost, freshApi.currency));
  if (!perUserCosting && sharedAttribution) {
    printRow(
      'Fresh API after proportional split',
      formatMoney(sharedAttribution.attributedMonthToDateCost, freshApi.currency)
    );
    printRow(
      'Split basis (lifetime minutes)',
      `${sharedAttribution.userLifetimeMinutes.toFixed(2)} / ${sharedAttribution.totalLifetimeMinutes.toFixed(2)} (${sharedAttribution.sharePercent}%)`
    );
  }
  printRow('Expected stored MTD (for mode)', formatMoney(expectedStoredMtd, freshApi.currency));
  console.log('');

  if (!storedCost) {
    flags.push('MISSING: no user_budget_spend row — dashboard shows $0.00 until Refresh or scheduler sync');
  } else if (costsDiffer(storedCost.current_spend, expectedStoredMtd)) {
    flags.push(
      `MISMATCH: stored Azure MTD (${Number(storedCost.current_spend).toFixed(4)}) != expected (${Number(expectedStoredMtd).toFixed(4)})`
    );
  }

  if (perUserCosting && costsDiffer(storedCost?.current_spend, freshApi.cost) && storedCost) {
    flags.push(
      `MISMATCH: stored Azure MTD differs from fresh per-user RG API by > ${COST_TOLERANCE}`
    );
  }

  console.log('--- Live cost (Racko estimate) ---');
  printRow('Hourly rate used', `$${hourlyRate.toFixed(4)}/hr`);
  printRow('Merged minutes today (app path)', `${mergedMinutesToday.toFixed(2)} min`);
  printRow('Merged minutes (interval recompute)', `${mergedFromIntervals.toFixed(2)} min`);
  printRow('Raw SUM minutes today (session rows)', `${rawTodayMinutes.toFixed(2)} min (${rawSessions.session_rows_today} rows, ${rawSessions.open_sessions} open)`);
  printRow('Raw active session minutes', `${rawActiveMinutes} min`);
  console.log('');
  printRow('App totalCostToday', formatMoney(enriched.totalCostToday));
  printRow('App liveCost (active session only)', formatMoney(enriched.liveCost));
  printRow('App closedSessionCost', formatMoney(enriched.closedSessionCost));
  printRow('Manual live cost (merged minutes)', formatMoney(manualMergedLiveCost));
  printRow('Manual live cost (raw SUM today)', formatMoney(manualRawLiveCost));
  printRow('Manual live cost (raw active only)', formatMoney(manualRawActiveLiveCost));
  console.log('');

  if (costsDiffer(enriched.totalCostToday, manualMergedLiveCost)) {
    flags.push(
      `MISMATCH: app totalCostToday (${Number(enriched.totalCostToday).toFixed(4)}) != manual merged recomputation (${manualMergedLiveCost.toFixed(4)})`
    );
  }

  if (costsDiffer(enriched.liveCost, manualRawActiveLiveCost)) {
    flags.push(
      `MISMATCH: app liveCost (${Number(enriched.liveCost).toFixed(4)}) != manual raw active recomputation (${manualRawActiveLiveCost.toFixed(4)})`
    );
  }

  if (Math.abs(mergedMinutesToday - mergedFromIntervals) > 0.01) {
    flags.push(
      `MISMATCH: getConsumedMinutesToday (${mergedMinutesToday.toFixed(2)}) != interval recompute (${mergedFromIntervals.toFixed(2)})`
    );
  }

  if (Math.abs(rawTodayMinutes - mergedMinutesToday) > 0.5) {
    flags.push(
      `INFO: raw today minutes (${rawTodayMinutes.toFixed(2)}) exceed merged (${mergedMinutesToday.toFixed(2)}) — possible overlapping sessions affecting raw-based estimates`
    );
  }

  const openSessionCount = Number(rawSessions.open_sessions || 0);
  if (openSessionCount > 1) {
    flags.push(
      `WARN: ${openSessionCount} open sessions for this user — live/active minutes may be inflated`
    );
  }

  console.log('--- Session rows today ---');
  if (sessionIntervals.length === 0) {
    console.log('(none)');
  } else {
    for (const [index, interval] of sessionIntervals.entries()) {
      const mins = (interval.end - interval.start) / 60000;
      console.log(
        `  ${index + 1}. ${interval.start.toISOString()} → ${interval.end.toISOString()} (${mins.toFixed(2)} min)`
      );
    }
  }
  console.log('');

  console.log('--- Flags ---');
  if (flags.length === 0) {
    console.log('OK — no mismatches detected within tolerance.');
  } else {
    for (const flag of flags) {
      console.log(`• ${flag}`);
    }
  }
  console.log('');
  console.log('Note: Azure billing data is typically delayed several hours; $0 fresh API is often expected for new labs.');
};

const main = async () => {
  await bootstrapScriptDb();
  await run();
  await db.end();
};

main().catch(async (error) => {
  console.error('Failed:', error.message);
  if (error.stack && process.env.DEBUG) {
    console.error(error.stack);
  }
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
