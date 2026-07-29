#!/usr/bin/env node
/**
 * Fix Manage Portal access for a request:
 * - Sync learner temporary passwords in azure_users
 * - Issue fresh portal token + admin credentials
 * - Print QA portal link and login details
 *
 * Usage:
 *   FRONTEND_URL=https://qa.racko.ai node scripts/fixManagePortalAccess.js 307
 */
require('dotenv').config();

process.env.FRONTEND_URL =
  process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
    ? process.env.FRONTEND_URL
    : 'https://qa.racko.ai';

const db = require('../src/db/postgres');
const { issueAccessPortalTokenForRequest } = require('../src/services/managePortalService');

const REQUEST_ID = Number(process.argv[2] || 307);

// Passwords from provisioning email (request #307)
const EMAIL_PASSWORDS = {
  'cust-307-user-1': '5-Ai2F$=d8_9HSFe',
  'cust-307-user-10': '*q=dre5Fi@ZGk6AC',
  'cust-307-user-11': '@34BMbf$o6SpXG5W',
};

async function upsertCredentialDelivery({ requestId, customerEmail, portalLink, adminUsername, adminPassword, expiresAt }) {
  try {
    const updated = await db.query(
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
        RETURNING request_id
      `,
      [requestId, customerEmail, portalLink, adminUsername, adminPassword, expiresAt]
    );

    if (updated.rows.length) {
      return true;
    }

    await db.query(
      `
        INSERT INTO credential_delivery (
          request_id,
          recipient_email,
          delivery_status,
          sent_at,
          portal_link,
          admin_username,
          admin_temporary_password,
          portal_expires_at
        )
        VALUES ($1, $2, 'sent', NOW(), $3, $4, $5, $6)
      `,
      [requestId, customerEmail, portalLink, adminUsername, adminPassword, expiresAt]
    );
    return true;
  } catch (error) {
    if (/column .* does not exist/i.test(error.message || '')) {
      return false;
    }
    throw error;
  }
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

  console.log(`Fixing Manage Portal access for request #${REQUEST_ID} (${projectName || '—'})`);
  console.log(`Portal base URL: ${process.env.FRONTEND_URL}\n`);

  let updated = 0;
  for (const [username, password] of Object.entries(EMAIL_PASSWORDS)) {
    const result = await db.query(
      `
        UPDATE azure_users
        SET temporary_password = $1
        WHERE request_id = $2
          AND lower(username) = lower($3)
          AND COALESCE(is_deleted, false) = false
        RETURNING id, username
      `,
      [password, REQUEST_ID, username]
    );

    if (result.rows.length) {
      updated += 1;
      console.log(`Updated password in DB: ${result.rows[0].username}`);
    } else {
      console.log(`WARNING: user not found: ${username}`);
    }
  }

  console.log(`\nPasswords synced for ${updated} user(s) from email.\n`);

  const portal = await issueAccessPortalTokenForRequest(REQUEST_ID);
  const adminUsername = portal.adminCredentials?.username;
  const adminPassword = portal.adminCredentials?.temporaryPassword;

  await upsertCredentialDelivery({
    requestId: REQUEST_ID,
    customerEmail,
    portalLink: portal.manageUrl,
    adminUsername,
    adminPassword,
    expiresAt: portal.expiresAt,
  });

  const users = await db.query(
    `
      SELECT username, temporary_password, azure_user_id, status
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
      ORDER BY user_number ASC NULLS LAST, username ASC
    `,
    [REQUEST_ID]
  );

  console.log('='.repeat(72));
  console.log('NEW PORTAL LINK (valid 7 days)');
  console.log('='.repeat(72));
  console.log(portal.manageUrl);
  console.log(`Expires: ${portal.expiresAt}`);
  console.log('');

  console.log('ADMIN LOGIN');
  console.log(`  Username: ${adminUsername}`);
  console.log(`  Password: ${adminPassword}`);
  console.log('');

  console.log('LEARNER LOGINS (from DB after sync)');
  for (const row of users.rows) {
    const synced = EMAIL_PASSWORDS[row.username] ? ' [synced from email]' : '';
    console.log(`  ${row.username}`);
    console.log(`    Password: ${row.temporary_password}${synced}`);
  }

  console.log('\nDone. Use the new link above — old email links may be expired or consumed.');
  await db.end();
})().catch(async (error) => {
  console.error('Fix failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
