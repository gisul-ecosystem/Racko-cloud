#!/usr/bin/env node
/**
 * Restore org-admin History for deleted request #307 (DB only — no Azure re-provision).
 *
 * Recreates the request + user rows and rebuilds history from:
 * - Azure Cost Management (per RG spend)
 * - Microsoft Graph sign-in logs (sessions timeline)
 *
 * Usage:
 *   node scripts/restoreRequest307History.js
 *   node scripts/restoreRequest307History.js --apply
 */
require('dotenv').config();

const { DateTime } = require('luxon');
const db = require('../src/db/postgres');
const AppError = require('../src/utils/AppError');
const { createGraphClient, getVerifiedDomain } = require('../src/provisioners/azure/userProvisioner');
const { queryCostForResourceGroup } = require('../src/services/azureCostManagementService');

const REQUEST_ID = 307;
const TEMPLATE_REQUEST_ID = 306;
const APPLY = process.argv.includes('--apply');
const USER_COUNT = 11;

const LAB_META = {
  projectName: 'Labs Azure',
  customerEmail: 'sumukhsumukh01@gmail.com',
  location: 'southcentralus',
  createdAt: '2026-07-23T06:53:42.000Z',
  originalExpiresAt: '2026-07-28T12:30:00.000Z'
};

const USER_PASSWORDS = Object.fromEntries(
  Array.from({ length: USER_COUNT }, (_, index) => [
    `cust-307-user-${index + 1}`,
    'Restored-History-Only-1!'
  ])
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cloneRequestSkeleton(client) {
  const template = await client.query(`SELECT * FROM requests WHERE id = $1`, [TEMPLATE_REQUEST_ID]);
  if (!template.rows.length) {
    throw new AppError(`Template request #${TEMPLATE_REQUEST_ID} not found.`, 404);
  }

  const source = template.rows[0];
  const expiresAt = DateTime.fromISO(LAB_META.originalExpiresAt).plus({ days: 90 }).toUTC().toISO();

  await client.query(
    `
      INSERT INTO requests (
        id, customer_email, account_count, location, expiry_date, starts_at, expires_at,
        estimated_price, status, enable_daily_usage, daily_limit_minutes, usage_schedule,
        costing_mode, racko_user_id, cleanup_enabled, cleanup_interval_hours,
        per_user_budget_usd, resource_cleanup_enabled, resource_cleanup_interval_hours,
        resource_cleanup_next_run_at, resource_cleanup_action, resource_cleanup_time,
        resource_cleanup_timezone, project_name, id_mode, microsoft_license_sku_id,
        microsoft_license_sku_part_number, enforce_in_azure, expired, cleanup_completed,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29,$30,$31
      )
    `,
    [
      REQUEST_ID,
      LAB_META.customerEmail,
      USER_COUNT,
      LAB_META.location,
      expiresAt.slice(0, 10),
      LAB_META.createdAt,
      expiresAt,
      source.estimated_price,
      'Completed',
      source.enable_daily_usage,
      source.daily_limit_minutes,
      source.usage_schedule,
      source.costing_mode,
      source.racko_user_id,
      source.cleanup_enabled,
      source.cleanup_interval_hours,
      source.per_user_budget_usd,
      source.resource_cleanup_enabled,
      source.resource_cleanup_interval_hours,
      null,
      source.resource_cleanup_action,
      source.resource_cleanup_time,
      source.resource_cleanup_timezone,
      LAB_META.projectName,
      source.id_mode,
      source.microsoft_license_sku_id,
      source.microsoft_license_sku_part_number,
      source.enforce_in_azure,
      false,
      false,
      LAB_META.createdAt
    ]
  );

  await client.query(
    `
      INSERT INTO request_services (request_id, service_id)
      SELECT $1, service_id FROM request_services WHERE request_id = $2
      ON CONFLICT DO NOTHING
    `,
    [REQUEST_ID, TEMPLATE_REQUEST_ID]
  );

  await client.query(
    `
      INSERT INTO request_service_instances (request_id, service_id, instance_option)
      SELECT $1, service_id, instance_option FROM request_service_instances WHERE request_id = $2
    `,
    [REQUEST_ID, TEMPLATE_REQUEST_ID]
  );

  await client.query(
    `
      INSERT INTO request_service_roles (request_id, service_id, azure_role)
      SELECT $1, service_id, azure_role FROM request_service_roles WHERE request_id = $2
      ON CONFLICT (request_id, service_id, azure_role) DO NOTHING
    `,
    [REQUEST_ID, TEMPLATE_REQUEST_ID]
  );

  await client.query(
    `SELECT setval(pg_get_serial_sequence('requests', 'id'), (SELECT MAX(id) FROM requests))`
  );
}

async function insertUsers(client, domain) {
  const users = [];

  for (let userNumber = 1; userNumber <= USER_COUNT; userNumber += 1) {
    const username = `cust-307-user-${userNumber}`;
    const resourceGroupName = `RG-CUST-307-U${userNumber}`;
    const password = USER_PASSWORDS[username] || 'Restored-Temp-Password1!';

    const inserted = await client.query(
      `
        INSERT INTO azure_users (
          request_id, azure_user_id, username, temporary_password, status,
          user_number, azure_resource_group_name, azure_account_enabled, is_deleted,
          peak_resource_count, last_resource_count, created_at
        )
        VALUES ($1, $2, $3, $4, 'Created', $5, $6, FALSE, FALSE, 0, 0, $7)
        RETURNING id, username, user_number, azure_resource_group_name
      `,
      [
        REQUEST_ID,
        `restored-${REQUEST_ID}-u${userNumber}`,
        username,
        password,
        userNumber,
        resourceGroupName,
        LAB_META.createdAt
      ]
    );

    await client.query(
      `
        INSERT INTO request_user_resource_groups (request_id, user_number, azure_resource_group_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (request_id, user_number) DO UPDATE
        SET azure_resource_group_name = EXCLUDED.azure_resource_group_name
      `,
      [REQUEST_ID, userNumber, resourceGroupName]
    );

    users.push({
      ...inserted.rows[0],
      upn: `${username}@${domain}`
    });
  }

  return users;
}

async function restoreCosts(users) {
  const from = LAB_META.createdAt.slice(0, 10);
  const to = DateTime.utc().toISODate();
  const budgetResult = await db.query(
    `SELECT per_user_budget_usd FROM requests WHERE id = $1`,
    [REQUEST_ID]
  );
  const budgetAmount = Number(budgetResult.rows[0]?.per_user_budget_usd || 10);
  let restored = 0;

  for (const user of users) {
    try {
      const cost = await queryCostForResourceGroup({
        resourceGroupName: user.azure_resource_group_name,
        from,
        to
      });

      await db.query(
        `
          INSERT INTO user_budget_spend (
            azure_user_id, request_id, current_spend, budget_amount, currency, last_synced_at
          )
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (azure_user_id) DO UPDATE
          SET current_spend = EXCLUDED.current_spend,
              currency = EXCLUDED.currency,
              last_synced_at = NOW()
        `,
        [user.id, REQUEST_ID, Number(cost.cost || 0), budgetAmount, cost.currency || 'INR']
      );

      if (Number(cost.cost || 0) > 0) {
        restored += 1;
      }
      console.log(`  cost ${user.username}: ${cost.currency || 'INR'} ${Number(cost.cost || 0).toFixed(4)}`);
      await sleep(2000);
    } catch (error) {
      console.warn(`  cost ${user.username}: ${error.message}`);
      await sleep(3000);
    }
  }

  return restored;
}

async function fetchSignIns(graphClient, upn, sinceIso) {
  const rows = [];
  let url = `/auditLogs/signIns?$filter=userPrincipalName eq '${upn}' and createdDateTime ge ${sinceIso}&$top=100&$orderby=createdDateTime asc`;

  while (url) {
    const response = await graphClient.api(url).get();
    rows.push(...(response.value || []));
    url = response['@odata.nextLink'] ? response['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
    if (url) await sleep(200);
  }

  return rows.filter((entry) => entry.status?.errorCode === 0 || entry.status?.errorCode === 50140);
}

function buildSessionsFromSignIns(signIns) {
  if (!signIns.length) return [];

  const sessions = [];
  let current = null;

  for (const signIn of signIns) {
    const loginAt = new Date(signIn.createdDateTime);
    if (!current) {
      current = { loginAt, lastSeen: loginAt };
      continue;
    }

    const gapMinutes = (loginAt.getTime() - current.lastSeen.getTime()) / 60000;
    if (gapMinutes <= 90) {
      current.lastSeen = loginAt;
      continue;
    }

    sessions.push(current);
    current = { loginAt, lastSeen: loginAt };
  }

  if (current) sessions.push(current);

  return sessions.map((session) => {
    const logoutAt = new Date(session.lastSeen.getTime() + 15 * 60 * 1000);
    const minutes = Math.max(1, Math.round((logoutAt.getTime() - session.loginAt.getTime()) / 60000));
    return { loginAt: session.loginAt, logoutAt, minutes };
  });
}

async function restoreSessions(users) {
  const { graphClient } = createGraphClient();
  const sinceIso = LAB_META.createdAt;
  let sessionCount = 0;

  for (const user of users) {
    let signIns = [];
    try {
      signIns = await fetchSignIns(graphClient, user.upn, sinceIso);
    } catch (error) {
      console.warn(`  sign-ins ${user.username}: ${error.message}`);
      continue;
    }

    const sessions = buildSessionsFromSignIns(signIns);
    if (!sessions.length) {
      continue;
    }

    for (const session of sessions) {
      await db.query(
        `
          INSERT INTO user_usage_sessions (
            request_id, user_id, login_at, logout_at, minutes_used, ended_reason, created_at
          )
          VALUES ($1, $2, $3, $4, $5, 'restored_from_signin', NOW())
        `,
        [REQUEST_ID, user.id, session.loginAt, session.logoutAt, session.minutes]
      );
      sessionCount += 1;
    }

    await db.query(
      `UPDATE azure_users SET last_signin_at = $2 WHERE id = $1`,
      [user.id, sessions[sessions.length - 1].logoutAt]
    );

    console.log(`  sessions ${user.username}: ${sessions.length} (from ${signIns.length} sign-in(s))`);
    await sleep(250);
  }

  return sessionCount;
}

(async () => {
  console.log(`Restore org-admin history for request #${REQUEST_ID}${APPLY ? '' : ' (dry run)'}`);

  const existing = await db.query(`SELECT id FROM requests WHERE id = $1`, [REQUEST_ID]);
  if (existing.rows.length) {
    throw new AppError(`Request #${REQUEST_ID} already exists. Delete it first or use history-only backfill.`, 409);
  }

  const { graphClient } = createGraphClient();
  const domain = await getVerifiedDomain(graphClient);
  console.log(`Verified domain: ${domain}`);

  if (!APPLY) {
    console.log('Dry run — pass --apply to write DB rows and rebuild history.');
    await db.end();
    return;
  }

  const client = await db.connect();
  let users;

  try {
    await client.query('BEGIN');
    await cloneRequestSkeleton(client);
    users = await insertUsers(client, domain);
    await client.query('COMMIT');
    console.log(`Created request #${REQUEST_ID} with ${users.length} user row(s).`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  console.log('\nRecovering Azure costs...');
  const costRows = await restoreCosts(users);

  console.log('\nRecovering sessions from sign-in logs...');
  const sessionRows = await restoreSessions(users);

  const summary = await db.query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM azure_users WHERE request_id = $1) AS users,
        (SELECT COUNT(*)::int FROM user_usage_sessions WHERE request_id = $1) AS sessions,
        (SELECT COUNT(*)::int FROM user_budget_spend WHERE request_id = $1) AS cost_rows,
        (SELECT COALESCE(SUM(current_spend), 0) FROM user_budget_spend WHERE request_id = $1) AS total_spend
    `,
    [REQUEST_ID]
  );

  console.log('\nDone. Open org-admin → request #307 → History tab.');
  console.log({
    ...summary.rows[0],
    costUsersRestored: costRows,
    sessionsRestored: sessionRows
  });

  await db.end();
})().catch(async (error) => {
  console.error('Restore failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
