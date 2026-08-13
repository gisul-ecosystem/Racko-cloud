#!/usr/bin/env node
/**
 * Repair request-365 sessions that were force-closed with logout_at ~= login_at
 * (minutes_used = 1). Restore logout_at / minutes_used to the wall-clock open
 * duration that Lab Management was showing before the close.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/repairRequest365StaleSessionDurations.js
 */
require('dotenv').config();

const db = require('../src/db/postgres');

// Open durations captured just before close (minutes since login).
const OPEN_MINUTES_BY_USERNAME = {
  'cust-365-user-7': 3509,
  'cust-365-user-11': 1139,
  'cust-365-user-9': 1138,
  'cust-365-user-8': 383,
  'cust-365-user-32': 366,
  'cust-365-user-36': 365,
  'cust-365-user-31': 363,
  'cust-365-user-4': 361,
  'cust-365-user-25': 355,
  'cust-365-user-22': 343,
  'cust-365-user-28': 340
};

async function main() {
  const result = await db.query(
    `
      SELECT
        uus.id,
        au.username,
        uus.login_at,
        uus.logout_at,
        uus.minutes_used,
        uus.ended_reason
      FROM user_usage_sessions uus
      JOIN azure_users au
        ON au.id = uus.user_id
       AND au.request_id = uus.request_id
      WHERE uus.request_id = 365
        AND uus.ended_reason = 'stale_signin'
        AND uus.logout_at IS NOT NULL
        AND uus.login_at >= TIMESTAMP '2026-08-09 00:00:00+00'
      ORDER BY au.username ASC
    `
  );

  let updated = 0;
  let skipped = 0;

  for (const row of result.rows) {
    const openMins = OPEN_MINUTES_BY_USERNAME[row.username];
    if (!openMins) {
      skipped += 1;
      continue;
    }

    const loginAt = new Date(row.login_at);
    const logoutAt = new Date(loginAt.getTime() + openMins * 60 * 1000);
    const currentMins = Number(row.minutes_used || 0);

    // Only repair the bad 1-minute closes (or logout ~= login).
    const logoutMs = row.logout_at ? new Date(row.logout_at).getTime() : 0;
    const nearlyZeroDuration = Math.abs(logoutMs - loginAt.getTime()) < 2 * 60 * 1000;
    if (!nearlyZeroDuration && currentMins >= openMins * 0.9) {
      console.log(`skip ${row.username} — already has ${currentMins}m`);
      skipped += 1;
      continue;
    }

    await db.query(
      `
        UPDATE user_usage_sessions
        SET logout_at = $1,
            minutes_used = $2,
            last_seen_at = COALESCE(last_seen_at, $1),
            ended_reason = 'stale_signin'
        WHERE id = $3
      `,
      [logoutAt, openMins, row.id]
    );

    console.log(
      `repaired ${row.username}: ${currentMins}m → ${openMins}m (logout ${logoutAt.toISOString()})`
    );
    updated += 1;
  }

  console.log('\nSummary:', { updated, skipped, total: result.rows.length });
}

main()
  .catch(async (error) => {
    console.error('Failed:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch {
      // ignore
    }
  });
