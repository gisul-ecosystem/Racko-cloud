#!/usr/bin/env node
require('dotenv').config();
const db = require('../src/db/postgres');

const USERNAME = process.argv[2] || 'cust-314-user-1';

(async () => {
  const userResult = await db.query(
    `
      SELECT
        au.id,
        au.request_id,
        au.username,
        au.azure_user_id,
        au.temporary_password,
        au.status,
        r.project_name,
        r.customer_email
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE lower(au.username) = lower($1)
      LIMIT 1
    `,
    [USERNAME]
  );

  if (!userResult.rows.length) {
    throw new Error(`User ${USERNAME} not found`);
  }

  const user = userResult.rows[0];

  let delivery = null;
  try {
    const deliveryResult = await db.query(
      `
        SELECT admin_username, admin_temporary_password, portal_expires_at
        FROM credential_delivery
        WHERE request_id = $1
        LIMIT 1
      `,
      [user.request_id]
    );
    delivery = deliveryResult.rows[0] || null;
  } catch {
    delivery = null;
  }

  let adminUsername = delivery?.admin_username || null;
  if (!adminUsername) {
    const adminRow = await db.query(
      `
        SELECT username
        FROM admins
        WHERE lower(email) = lower($1)
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
      [user.customer_email]
    );
    adminUsername = adminRow.rows[0]?.username || null;
  }

  console.log('=== Manage Portal credentials ===');
  console.log(`Request: #${user.request_id} (${user.project_name || '—'})`);
  console.log(`Customer: ${user.customer_email}`);
  console.log('');

  console.log('--- Learner login ---');
  console.log(`Username: ${user.username}`);
  console.log(`Password: ${user.temporary_password || '(missing in DB)'}`);
  console.log(`Azure User ID (alternate username): ${user.azure_user_id || '—'}`);
  console.log(`Status: ${user.status}`);
  console.log('');

  if (delivery?.admin_temporary_password) {
    console.log('--- Admin login (same portal link) ---');
    console.log(`Username: ${adminUsername || '(unknown)'}`);
    console.log(`Password: ${delivery.admin_temporary_password}`);
    if (delivery.portal_expires_at) {
      console.log(`Portal expires: ${delivery.portal_expires_at}`);
    }
  } else if (adminUsername) {
    console.log('--- Admin login ---');
    console.log(`Username: ${adminUsername}`);
    console.log('Password: stored hashed in admins table — resend credentials from org-admin if needed.');
  } else {
    console.log('No admin credentials cached in credential_delivery for this request.');
  }

  await db.end();
})().catch(async (error) => {
  console.error('Failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
