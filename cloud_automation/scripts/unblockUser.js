require('dotenv').config();
const { DateTime } = require('luxon');
const db = require('../src/db/postgres');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');
 
const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    username: null,
    userId: null,
    resetUsage: true,
    removeDailyLimit: false,
    dryRun: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--username' && args[i + 1]) {
      options.username = args[++i];
    } else if (arg === '--user-id' && args[i + 1]) {
      options.userId = args[++i];
    } else if (arg === '--no-reset-usage') {
      options.resetUsage = false;
    } else if (arg === '--remove-daily-limit') {
      options.removeDailyLimit = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
};

const findUser = async ({ username, userId }) => {
  const conditions = ['COALESCE(au.is_deleted, FALSE) = FALSE'];
  const values = [];

  if (userId) {
    values.push(userId);
    conditions.push(`au.id = $${values.length}`);
  }

  if (username) {
    values.push(username);
    conditions.push(`au.username ILIKE $${values.length}`);
  }

  if (values.length === 0) {
    throw new Error('Provide --username or --user-id.');
  }

  const result = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.azure_user_id,
        au.request_id,
        au.azure_account_enabled,
        au.blocked_until,
        au.used_today_minutes,
        au.status
      FROM azure_users au
      WHERE ${conditions.join(' AND ')}
      ORDER BY au.id
      LIMIT 1
    `,
    values
  );

  return result.rows[0] || null;
};

const getTimezoneForRequest = async (requestId) => {
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

const removeDailyLimitForRequest = async (requestId) => {
  const before = await db.query(
    `
      SELECT day_of_week, daily_limit_hours, window_start_time, window_end_time
      FROM request_usage_windows
      WHERE request_id = $1
      ORDER BY day_of_week
    `,
    [requestId]
  );

  await db.query(
    `
      UPDATE request_usage_windows
      SET daily_limit_hours = NULL
      WHERE request_id = $1
        AND daily_limit_hours IS NOT NULL
    `,
    [requestId]
  );

  await db.query(
    `
      UPDATE requests
      SET
        enable_daily_usage = FALSE,
        daily_limit_minutes = NULL
      WHERE id = $1
    `,
    [requestId]
  );

  return before.rows;
};

const unblockUser = async ({ username, userId, resetUsage, removeDailyLimit, dryRun }) => {
  const user = await findUser({ username, userId });
  if (!user) {
    throw new Error('User not found.');
  }

  const timezone = await getTimezoneForRequest(user.request_id);
  const todayDate = DateTime.now().setZone(timezone).toISODate();

  const tracking = await db.query(
    `
      SELECT consumed_minutes, limit_reached, tracking_date
      FROM daily_usage_tracking
      WHERE azure_user_id = $1
        AND tracking_date = $2
    `,
    [user.id, todayDate]
  );

  console.log(`User: ${user.username} (id=${user.id}, request=${user.request_id})`);
  console.log(`Azure account enabled (DB): ${user.azure_account_enabled !== false}`);
  console.log(`Status: ${user.status || '(none)'}`);
  console.log(`Blocked until: ${user.blocked_until || '(none)'}`);
  console.log(`Used today minutes (legacy): ${user.used_today_minutes ?? 0}`);
  console.log(`Daily tracking (${todayDate}):`, tracking.rows[0] || '(none)');

  if (removeDailyLimit) {
    const windows = await db.query(
      `
        SELECT day_of_week, daily_limit_hours
        FROM request_usage_windows
        WHERE request_id = $1
          AND daily_limit_hours IS NOT NULL
        ORDER BY day_of_week
      `,
      [user.request_id]
    );
    console.log(
      `Daily limits on request ${user.request_id}:`,
      windows.rows.length ? windows.rows : '(none)'
    );
  }

  if (dryRun) {
    console.log('\nDry run — no changes made.');
    return;
  }

  const { graphClient } = createGraphClient();
  await graphClient.api(`/users/${user.azure_user_id}`).patch({ accountEnabled: true });
  console.log('Re-enabled Azure Entra account.');

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
    [user.id, resetUsage]
  );
  console.log('Updated azure_users record.');

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
      [user.request_id, user.id, todayDate]
    );
    console.log(`Reset daily usage tracking for ${todayDate}.`);
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
      [user.id, todayDate]
    );
    console.log(`Cleared limit_reached flag for ${todayDate}.`);
  }

  if (removeDailyLimit) {
    const previousWindows = await removeDailyLimitForRequest(user.request_id);
    console.log(
      `Removed daily hour limits from request ${user.request_id} (${previousWindows.length} window row(s) cleared).`
    );
  }

  console.log('\nUser unblocked successfully.');
};

const main = async () => {
  await unblockUser(parseArgs());
  await db.end();
};

main().catch(async (error) => {
  console.error('Failed:', error.message);
  try {
    await db.end();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
