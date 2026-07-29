#!/usr/bin/env node
require('dotenv').config();
const crypto = require('crypto');
const db = require('../src/db/postgres');

const USERNAME = process.argv[2] || 'cust-314-user-1';
const TOKEN = process.argv[3] || null;

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

(async () => {
  const user = await db.query(
    `
      SELECT
        au.id,
        au.request_id,
        au.username,
        au.azure_user_id,
        au.status,
        au.blocked_until,
        au.temporary_password IS NOT NULL AND au.temporary_password <> '' AS has_password,
        LENGTH(au.temporary_password) AS password_length,
        COALESCE(au.is_deleted, false) AS is_deleted,
        r.project_name,
        r.customer_email,
        r.status AS request_status
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE lower(au.username) = lower($1)
         OR lower(au.azure_user_id) = lower($1)
      LIMIT 1
    `,
    [USERNAME]
  );

  if (!user.rows.length) {
    console.log(`User "${USERNAME}" NOT FOUND in database.`);
    await db.end();
    return;
  }

  const u = user.rows[0];
  console.log('User found:');
  console.log(`  Username: ${u.username}`);
  console.log(`  Request: #${u.request_id} (${u.project_name || '—'})`);
  console.log(`  Customer email: ${u.customer_email}`);
  console.log(`  Azure user ID: ${u.azure_user_id || '—'}`);
  console.log(`  Status: ${u.status}`);
  console.log(`  Request status: ${u.request_status}`);
  console.log(`  Has temp password in DB: ${u.has_password} (length ${u.password_length || 0})`);
  console.log(`  Blocked until: ${u.blocked_until || '—'}`);
  console.log(`  Deleted: ${u.is_deleted}`);

  const adminCreds = await db.query(
    `
      SELECT admin_username, admin_temporary_password IS NOT NULL AS has_admin_password
      FROM credential_delivery
      WHERE request_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [u.request_id]
  );

  if (adminCreds.rows.length) {
    console.log('\nAdmin portal credentials (from credential email):');
    console.log(`  Admin username: ${adminCreds.rows[0].admin_username || '—'}`);
    console.log(`  Has admin password: ${adminCreds.rows[0].has_admin_password}`);
  }

  if (TOKEN) {
    const tokenHash = sha256Hex(TOKEN);
    const tokenRow = await db.query(
      `
        SELECT request_id, customer_email, expires_at, used, used_at
        FROM access_portal_tokens
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );

    console.log('\nPortal link token:');
    if (!tokenRow.rows.length) {
      console.log('  INVALID — token not found in database');
    } else {
      const t = tokenRow.rows[0];
      const expired = new Date(t.expires_at).getTime() <= Date.now();
      console.log(`  Request: #${t.request_id}`);
      console.log(`  Customer email: ${t.customer_email}`);
      console.log(`  Expires: ${t.expires_at}${expired ? ' (EXPIRED)' : ''}`);
      console.log(`  Used: ${t.used}${t.used_at ? ` at ${t.used_at}` : ''}`);
      if (Number(t.request_id) !== Number(u.request_id)) {
        console.log(`  WARNING: token is for request #${t.request_id}, user is on request #${u.request_id}`);
      }
    }
  }

  console.log('\nLikely causes of "Invalid username or password":');
  console.log('  1. Wrong temporary password (copy exactly from provisioning email / Excel)');
  console.log('  2. Using learner username but admin password (or vice versa)');
  console.log('  3. Extra spaces when pasting username or password');
  console.log('  4. Password was rotated after provisioning — use latest email');
  console.log('  5. User does not exist on the request tied to this portal link');

  await db.end();
})().catch(async (e) => {
  console.error(e.message || e);
  try { await db.end(); } catch {}
  process.exit(1);
});
