#!/usr/bin/env node
require('dotenv').config();

const db = require('../src/db/postgres');
const { isRequestWithinServicePeriod, evaluateServicePeriodAccess } = require('../src/utils/servicePeriodAccess');
const { isWithinUsageWindowTime } = require('../src/utils/usageWindowTime');

const requestId = process.argv[2] ? Number(process.argv[2]) : null;

(async () => {
  const requests = requestId
    ? (
        await db.query(
          `SELECT id, project_name, starts_at, expires_at, created_at, status, location
           FROM requests WHERE id = $1`,
          [requestId]
        )
      ).rows
    : (
        await db.query(
          `SELECT id, project_name, starts_at, expires_at, created_at, status, location
           FROM requests
           WHERE project_name ILIKE '%test case%'
           ORDER BY id DESC LIMIT 3`
        )
      ).rows;

  for (const request of requests) {
    const windows = (
      await db.query(`SELECT * FROM request_usage_windows WHERE request_id = $1`, [request.id])
    ).rows;
    const users = (
      await db.query(
        `SELECT username, azure_account_enabled, status, window_enforcement_paused_until
         FROM azure_users WHERE request_id = $1 AND COALESCE(is_deleted, false) = false LIMIT 5`,
        [request.id]
      )
    ).rows;

    const now = new Date();
    const service = evaluateServicePeriodAccess(request, now);
    const inWindow = isWithinUsageWindowTime(windows, now);
    const shouldUnblock = isRequestWithinServicePeriod(request, now) && inWindow;

    console.log('\n=== Request #' + request.id + ' — ' + request.project_name + ' ===');
    console.log({
      location: request.location,
      status: request.status,
      starts_at: request.starts_at,
      expires_at: request.expires_at,
      created_at: request.created_at,
      now: now.toISOString()
    });
    console.log('Usage windows:', windows);
    console.log('Service period:', service);
    console.log('In daily window:', inWindow);
    console.log('Should be unblocked:', shouldUnblock);
    console.log('Sample users:', users);
  }

  await db.end();
})().catch(async (error) => {
  console.error(error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
