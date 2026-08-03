#!/usr/bin/env node
require('dotenv').config();
const db = require('../src/db/postgres');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');

const REQUEST_ID = 307;

(async () => {
  const exists = await db.query('SELECT id FROM requests WHERE id = $1', [REQUEST_ID]);
  console.log('request 307 exists:', exists.rows.length > 0);

  const near = await db.query(
    `
      SELECT id, project_name, customer_email, account_count, costing_mode,
             azure_resource_group_name, location, status
      FROM requests
      WHERE id BETWEEN 300 AND 315
      ORDER BY id
    `
  );
  console.log('\nNearby requests:', JSON.stringify(near.rows, null, 2));

  const audit = await db.query(
    `
      SELECT id, request_id, action, details, created_at
      FROM access_portal_audit_logs
      WHERE details::text ILIKE '%307%'
      ORDER BY created_at DESC
      LIMIT 5
    `
  );
  console.log('\nAudit logs mentioning 307:', JSON.stringify(audit.rows, null, 2));

  const notif = await db.query(
    `
      SELECT id, title, message, request_id, created_at
      FROM notifications
      WHERE request_id = $1 OR message ILIKE '%307%'
      ORDER BY created_at DESC
      LIMIT 5
    `,
    [REQUEST_ID]
  );
  console.log('\nNotifications:', JSON.stringify(notif.rows, null, 2));

  const req309 = await db.query(
    `
      SELECT id, project_name, customer_email, account_count, costing_mode,
             azure_resource_group_name, location, status, expiry_date, expires_at,
             starts_at, enable_daily_usage, daily_limit_minutes, id_mode
      FROM requests WHERE id = 309
    `
  );
  console.log('\nRequest 309 (reference):', JSON.stringify(req309.rows[0], null, 2));

  const users309 = await db.query(
    `
      SELECT id, username, azure_user_id, user_number, azure_resource_group_name, status
      FROM azure_users
      WHERE request_id = 309 AND COALESCE(is_deleted, false) = false
      ORDER BY user_number
    `
  );
  console.log('\nRequest 309 users:', JSON.stringify(users309.rows, null, 2));

  // Check Azure for cust-307 users and resource groups
  try {
    const { graphClient } = createGraphClient();
    const filter = "startswith(userPrincipalName,'cust-307-user-')";
    const graphUsers = await graphClient
      .api('/users')
      .filter(filter)
      .select('id,userPrincipalName,accountEnabled')
      .top(20)
      .get();

    console.log('\nAzure Graph users cust-307-*:', JSON.stringify(graphUsers.value || [], null, 2));
  } catch (error) {
    console.log('\nAzure Graph lookup failed:', error.message);
  }

  await db.end();
})().catch(async (error) => {
  console.error(error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
