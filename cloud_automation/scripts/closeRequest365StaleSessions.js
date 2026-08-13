#!/usr/bin/env node
/**
 * Close stale open sessions for a request (default 365).
 *
 * Usage:
 *   DATABASE_URL=... node scripts/closeRequest365StaleSessions.js
 *   DATABASE_URL=... node scripts/closeRequest365StaleSessions.js --request-id 365
 */
require('dotenv').config();

const db = require('../src/db/postgres');

const STALE_MINUTES = Number(process.env.SIGNIN_STALE_SESSION_MINUTES || 90);

const parseArgs = () => {
  const args = process.argv.slice(2);
  let requestId = 365;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--request-id' && args[i + 1]) {
      requestId = Number(args[++i]);
    }
  }
  return { requestId };
};

async function main() {
  const { requestId } = parseArgs();
  const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

  const open = await db.query(
    `
      SELECT
        uus.id,
        uus.request_id,
        uus.user_id,
        uus.login_at,
        COALESCE(uus.last_seen_at, uus.login_at) AS effective_last_seen,
        au.username
      FROM user_usage_sessions uus
      JOIN azure_users au
        ON au.id = uus.user_id
       AND au.request_id = uus.request_id
      WHERE uus.request_id = $1
        AND uus.logout_at IS NULL
      ORDER BY au.username ASC
    `,
    [requestId]
  );

  console.log(
    `Request #${requestId}: ${open.rows.length} open session(s). Stale threshold: ${STALE_MINUTES} min.\n`
  );

  let closed = 0;
  let skippedFresh = 0;

  for (const session of open.rows) {
    const loginAt = new Date(session.login_at);
    const lastSeen = new Date(session.effective_last_seen);

    if (lastSeen.getTime() >= staleThreshold.getTime()) {
      console.log(
        `skip ${session.username} — last seen ${Math.round((Date.now() - lastSeen.getTime()) / 60000)}m ago (still fresh)`
      );
      skippedFresh += 1;
      continue;
    }

    // Force-close keeps wall-clock open time in history (login → now).
    // Normal monitor closes at last_seen; these zombies had no heartbeat and
    // would otherwise land as 1m sessions and wipe the UI "time used".
    const closeAt = new Date();
    const durationMins = Math.max(
      1,
      Math.floor((closeAt.getTime() - loginAt.getTime()) / 60000)
    );
    const endedReason = 'stale_signin';

    const update = await db.query(
      `
        UPDATE user_usage_sessions
        SET logout_at = $1,
            minutes_used = $2,
            ended_reason = $3,
            last_seen_at = COALESCE(last_seen_at, $1)
        WHERE id = $4
          AND logout_at IS NULL
        RETURNING id
      `,
      [closeAt, durationMins, endedReason, session.id]
    );

    if (!update.rows.length) {
      console.log(`skip ${session.username} — already closed`);
      continue;
    }

    await db.query(
      `
        UPDATE azure_users
        SET status = CASE
          WHEN lower(COALESCE(status, '')) = 'blocked' THEN status
          ELSE 'Created'
        END
        WHERE id = $1
          AND request_id = $2
      `,
      [session.user_id, requestId]
    );

    console.log(
      `closed ${session.username} | ${durationMins}m | ${endedReason} | logout=${closeAt.toISOString()}`
    );
    closed += 1;
  }

  const left = await db.query(
    `
      SELECT COUNT(*)::int AS n
      FROM user_usage_sessions
      WHERE request_id = $1
        AND logout_at IS NULL
    `,
    [requestId]
  );

  console.log('\nSummary:', {
    requestId,
    closed,
    skippedFresh,
    remainingOpen: left.rows[0].n
  });
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
