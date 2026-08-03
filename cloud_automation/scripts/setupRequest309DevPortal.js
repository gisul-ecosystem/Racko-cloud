#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const db = require('../src/db/postgres');
const { issueAccessPortalTokenForRequest } = require('../src/services/managePortalService');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');

const REQUEST_ID = 309;
const USERNAME = 'cust-309-user-1';
const PASSWORD = 'VnynxCg@_2j*c*#N';
const PORTAL_TOKEN = '561e2481-68d5-40c5-b64b-a36904721740';
const PORTAL_URL = `https://dev.racko.ai/manage-users?token=${encodeURIComponent(PORTAL_TOKEN)}`;

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

async function ensurePortalToken(requestId, customerEmail, rawToken) {
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const existing = await db.query(
    `SELECT id, request_id, expires_at, used FROM access_portal_tokens WHERE token_hash = $1 LIMIT 1`,
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
    return { reused: true, expiresAt };
  }

  await db.query(
    `
      INSERT INTO access_portal_tokens (id, request_id, customer_email, token_hash, expires_at, used)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, false)
    `,
    [requestId, customerEmail, tokenHash, expiresAt]
  );

  return { reused: false, expiresAt };
}

async function syncAzurePassword(azureUserId, password) {
  const { graphClient } = createGraphClient();
  await graphClient.api(`/users/${azureUserId}`).patch({
    accountEnabled: true,
    passwordProfile: {
      forceChangePasswordNextSignIn: false,
      password: String(password),
    },
  });
}

(async () => {
  const request = await db.query(
    `SELECT id, project_name, customer_email FROM requests WHERE id = $1`,
    [REQUEST_ID]
  );

  if (!request.rows.length) {
    throw new Error(`Request #${REQUEST_ID} not found`);
  }

  const { customer_email: customerEmail, project_name: projectName } = request.rows[0];

  const updated = await db.query(
    `
      UPDATE azure_users
      SET temporary_password = $1
      WHERE request_id = $2
        AND lower(username) = lower($3)
        AND COALESCE(is_deleted, false) = false
      RETURNING id, username, azure_user_id
    `,
    [PASSWORD, REQUEST_ID, USERNAME]
  );

  if (!updated.rows.length) {
    throw new Error(`${USERNAME} not found on request #${REQUEST_ID}`);
  }

  const user = updated.rows[0];
  await syncAzurePassword(user.azure_user_id, PASSWORD);

  await db.query(
    `
      UPDATE azure_users
      SET azure_account_enabled = TRUE
      WHERE id = $1
    `,
    [user.id]
  );

  const adminPortal = await issueAccessPortalTokenForRequest(REQUEST_ID);
  const tokenInfo = await ensurePortalToken(REQUEST_ID, customerEmail, PORTAL_TOKEN);

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
        customerEmail,
        PORTAL_URL,
        adminPortal.adminCredentials?.username,
        adminPortal.adminCredentials?.temporaryPassword,
        tokenInfo.expiresAt,
      ]
    );
  } catch {
    // optional columns may be missing on older schema
  }

  console.log(`Request #${REQUEST_ID} — ${projectName || '—'}`);
  console.log(`Customer: ${customerEmail}`);
  console.log('');
  console.log('Learner account seeded + Azure AD synced:');
  console.log(`  Username: ${USERNAME}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  Resource Group: RG-CUST-309-U1`);
  console.log(`  Azure User ID: ${user.azure_user_id}`);
  console.log('');
  console.log('PORTAL LINK (dev):');
  console.log(PORTAL_URL);
  console.log(`Token expires: ${tokenInfo.expiresAt}`);
  console.log(`Token record: ${tokenInfo.reused ? 'updated existing' : 'created new'}`);
  console.log('');
  console.log('Admin login (manage portal):');
  console.log(`  Username: ${adminPortal.adminCredentials?.username}`);
  console.log(`  Password: ${adminPortal.adminCredentials?.temporaryPassword}`);

  await db.end();
})().catch(async (error) => {
  console.error('Setup failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
