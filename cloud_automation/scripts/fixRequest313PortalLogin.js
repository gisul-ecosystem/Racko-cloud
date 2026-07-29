#!/usr/bin/env node
/**
 * Final fix for request #313 QA portal login — reset token, set admin password, verify QA API.
 */
require('dotenv').config();

const crypto = require('crypto');
const db = require('../src/db/postgres');
const { issueAccessPortalTokenForRequest } = require('../src/services/managePortalService');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');

const REQUEST_ID = 313;
const PORTAL_TOKEN = 'bb5e1005-5119-406c-9d74-8c407c9a12a3';
const PORTAL_URL = `https://qa.racko.ai/manage-users?token=${encodeURIComponent(PORTAL_TOKEN)}`;
const sha256Hex = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

async function testQaLogin(username, password) {
  const res = await fetch('https://api-qa.racko.ai/api/manage/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: PORTAL_TOKEN, username, password }),
  });
  return res.ok;
}

(async () => {
  const request = await db.query(
    `SELECT customer_email FROM requests WHERE id = $1`,
    [REQUEST_ID]
  );
  const customerEmail = request.rows[0].customer_email;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
    [sha256Hex(PORTAL_TOKEN), REQUEST_ID, customerEmail, expiresAt]
  );

  const portal = await issueAccessPortalTokenForRequest(REQUEST_ID);
  const adminUser = portal.adminCredentials?.username;
  const adminPass = portal.adminCredentials?.temporaryPassword;

  const users = await db.query(
    `
      SELECT username, temporary_password, azure_user_id
      FROM azure_users
      WHERE request_id = $1 AND COALESCE(is_deleted, false) = false
      ORDER BY user_number ASC NULLS LAST, username ASC
    `,
    [REQUEST_ID]
  );

  const { graphClient } = createGraphClient();
  for (const user of users.rows) {
    if (!user.azure_user_id || !user.temporary_password) continue;
    await graphClient.api(`/users/${user.azure_user_id}`).patch({
      accountEnabled: true,
      passwordProfile: {
        forceChangePasswordNextSignIn: false,
        password: String(user.temporary_password),
      },
    });
  }

  const learnerOk = await testQaLogin('cust-313-user-1', users.rows[0].temporary_password);
  const adminOk = await testQaLogin(adminUser, adminPass);

  console.log('='.repeat(72));
  console.log('Request #313 — QA portal login verified');
  console.log('='.repeat(72));
  console.log(`Portal URL:\n${PORTAL_URL}`);
  console.log(`QA learner login test (cust-313-user-1): ${learnerOk ? 'PASS' : 'FAIL'}`);
  console.log(`QA admin login test: ${adminOk ? 'PASS' : 'FAIL'}`);
  console.log('');
  console.log('ADMIN LOGIN');
  console.log(`  Username: ${adminUser}`);
  console.log(`  Password: ${adminPass}`);
  console.log('');
  console.log('LEARNER LOGINS (copy exactly — special characters matter)');
  for (const u of users.rows) {
    console.log(`  ${u.username}  →  ${u.temporary_password}`);
  }

  await db.end();
})().catch(async (e) => {
  console.error(e.message || e);
  try { await db.end(); } catch {}
  process.exit(1);
});
