#!/usr/bin/env node
/**
 * Unblock all users on a request for Manage Portal + Azure login.
 * Keeps existing DB temporary passwords (same id/pass for learners).
 *
 * Usage:
 *   node scripts/unblockRequestPortalAccess.js 313 bb5e1005-5119-406c-9d74-8c407c9a12a3
 */
require('dotenv').config();

const crypto = require('crypto');
const db = require('../src/db/postgres');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');
const { issueAccessPortalTokenForRequest } = require('../src/services/managePortalService');

const REQUEST_ID = Number(process.argv[2] || 313);
const PORTAL_TOKEN = String(process.argv[3] || '').trim();
const PORTAL_BASE = process.env.FRONTEND_URL?.includes('localhost')
  ? 'https://qa.racko.ai'
  : process.env.FRONTEND_URL || 'https://qa.racko.ai';

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

async function ensurePortalToken(requestId, customerEmail, rawToken) {
  if (!rawToken) {
    return null;
  }

  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const portalUrl = `${PORTAL_BASE}/manage-users?token=${encodeURIComponent(rawToken)}`;

  const existing = await db.query(
    `SELECT id FROM access_portal_tokens WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );

  if (existing.rows.length) {
    await db.query(
      `
        UPDATE access_portal_tokens
        SET request_id = $2,
            customer_email = $3,
            expires_at = $4,
            used = false,
            used_at = NULL
        WHERE token_hash = $1
      `,
      [tokenHash, requestId, customerEmail, expiresAt]
    );
  } else {
    await db.query(
      `
        INSERT INTO access_portal_tokens (id, request_id, customer_email, token_hash, expires_at, used)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, false)
      `,
      [requestId, customerEmail, tokenHash, expiresAt]
    );
  }

  return { portalUrl, expiresAt };
}

async function syncAzureAccount(user) {
  const { graphClient } = createGraphClient();
  const password = user.temporary_password;

  if (!password) {
    throw new Error('missing temporary_password in DB');
  }

  try {
    await graphClient.api(`/users/${user.azure_user_id}/revokeSignInSessions`).post({});
  } catch {
    // optional
  }

  await graphClient.api(`/users/${user.azure_user_id}`).patch({
    accountEnabled: true,
    passwordProfile: {
      forceChangePasswordNextSignIn: false,
      password: String(password),
    },
  });

  const verified = await graphClient
    .api(`/users/${user.azure_user_id}`)
    .select('accountEnabled')
    .get();

  if (verified.accountEnabled === false) {
    throw new Error('Azure account still disabled after patch');
  }
}

(async () => {
  const requestResult = await db.query(
    `
      SELECT id, project_name, customer_email, status, expires_at
      FROM requests
      WHERE id = $1
    `,
    [REQUEST_ID]
  );

  if (!requestResult.rows.length) {
    throw new Error(`Request #${REQUEST_ID} not found`);
  }

  const request = requestResult.rows[0];
  const pauseUntil = request.expires_at
    ? new Date(request.expires_at)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  console.log(`Unblocking request #${REQUEST_ID} — ${request.project_name || '—'}`);
  console.log(`Customer: ${request.customer_email}`);
  console.log(`Current status: ${request.status}`);
  console.log('');

  await db.query(
    `
      UPDATE requests
      SET status = 'Completed'
      WHERE id = $1
        AND status IN ('Resource Cleanup In Progress', 'Cleanup In Progress', 'Cleanup Failed')
    `,
    [REQUEST_ID]
  );

  const usersResult = await db.query(
    `
      SELECT id, username, azure_user_id, temporary_password, status, azure_account_enabled
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
      ORDER BY user_number ASC NULLS LAST, username ASC
    `,
    [REQUEST_ID]
  );

  if (!usersResult.rows.length) {
    throw new Error(`No users found for request #${REQUEST_ID}`);
  }

  let dbUpdated = 0;
  let azureSynced = 0;
  let azureFailed = 0;

  for (const user of usersResult.rows) {
    await db.query(
      `
        UPDATE azure_users
        SET
          azure_account_enabled = TRUE,
          blocked_until = NULL,
          blocked_reason = NULL,
          blocked_at = NULL,
          window_enforcement_paused_until = $2,
          used_today_minutes = 0,
          status = CASE
            WHEN lower(COALESCE(status, '')) IN ('blocked', 'disabled') THEN 'Created'
            ELSE status
          END
        WHERE id = $1
      `,
      [user.id, pauseUntil]
    );
    dbUpdated += 1;

    if (!user.azure_user_id) {
      console.log(`  ✗ ${user.username}: missing azure_user_id`);
      azureFailed += 1;
      continue;
    }

    try {
      await syncAzureAccount(user);
      console.log(`  ✓ ${user.username} — unblocked + Azure AD synced`);
      azureSynced += 1;
    } catch (error) {
      console.log(`  ✗ ${user.username}: ${error.message || error}`);
      azureFailed += 1;
    }
  }

  await db.query(
    `
      UPDATE daily_usage_tracking dut
      SET consumed_minutes = 0,
          limit_reached = FALSE,
          limit_reached_at = NULL,
          updated_at = NOW()
      FROM azure_users au
      WHERE dut.azure_user_id = au.id
        AND au.request_id = $1
    `,
    [REQUEST_ID]
  );

  const tokenInfo = PORTAL_TOKEN
    ? await ensurePortalToken(REQUEST_ID, request.customer_email, PORTAL_TOKEN)
    : null;

  const adminPortal = await issueAccessPortalTokenForRequest(REQUEST_ID);

  if (tokenInfo) {
    try {
      await db.query(
        `
          UPDATE credential_delivery
          SET
            recipient_email = $2,
            delivery_status = 'sent',
            sent_at = NOW(),
            portal_link = $3,
            admin_username = $4,
            admin_temporary_password = $5,
            portal_expires_at = $6
          WHERE request_id = $1
        `,
        [
          REQUEST_ID,
          request.customer_email,
          tokenInfo.portalUrl,
          adminPortal.adminCredentials?.username,
          adminPortal.adminCredentials?.temporaryPassword,
          tokenInfo.expiresAt,
        ]
      );
    } catch {
      // optional columns
    }
  }

  console.log('');
  console.log('='.repeat(72));
  console.log(`Done — DB updated ${dbUpdated} user(s), Azure synced ${azureSynced}, failed ${azureFailed}`);
  console.log('='.repeat(72));
  console.log(`Request status set to: Completed (if it was stuck in cleanup)`);
  console.log(`Window enforcement paused for all users until: ${pauseUntil.toISOString()}`);
  console.log('');
  console.log('SHARED PORTAL LINK (all learners use this URL + their username/password):');
  console.log(
    tokenInfo?.portalUrl ||
      `${PORTAL_BASE}/manage-users?token=${encodeURIComponent(PORTAL_TOKEN)}`
  );
  if (tokenInfo) {
    console.log(`Token expires: ${tokenInfo.expiresAt}`);
  }
  console.log('');
  console.log('Admin login (manage portal):');
  console.log(`  Username: ${adminPortal.adminCredentials?.username}`);
  console.log(`  Password: ${adminPortal.adminCredentials?.temporaryPassword}`);
  console.log('');
  console.log(`All ${usersResult.rows.length} learners keep their existing temporary passwords from provisioning.`);

  await db.end();
})().catch(async (error) => {
  console.error('Unblock failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
