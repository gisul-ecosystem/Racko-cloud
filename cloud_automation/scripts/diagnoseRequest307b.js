#!/usr/bin/env node
require('dotenv').config();
const db = require('../src/db/postgres');
const { DefaultAzureCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');

(async () => {
  const r306 = await db.query('SELECT * FROM requests WHERE id = 306');
  console.log('Request 306:', JSON.stringify(r306.rows[0], null, 2));

  const users306 = await db.query(
    `SELECT username, azure_user_id, user_number, azure_resource_group_name FROM azure_users WHERE request_id = 306 ORDER BY user_number LIMIT 3`
  );
  console.log('306 users sample:', users306.rows);

  const services306 = await db.query(
    `SELECT rsi.*, s.name FROM request_service_instances rsi JOIN services s ON s.id = rsi.service_id WHERE rsi.request_id = 306`
  );
  console.log('306 services:', services306.rows);

  const roles306 = await db.query(`SELECT * FROM request_service_roles WHERE request_id = 306 LIMIT 20`);
  console.log('306 roles count query...');

  const windows306 = await db.query(`SELECT * FROM request_usage_windows WHERE request_id = 306`);

  // Search any orphaned references to 307
  const rg307staging = await db.query(
    `SELECT * FROM request_user_resource_groups WHERE request_id = 307 OR azure_resource_group_name ILIKE '%307%' LIMIT 20`
  );
  console.log('307 staging RGs:', rg307staging.rows);

  // Azure RG check
  const subId = process.env.AZURE_SUBSCRIPTION_ID;
  if (subId) {
    const client = new ResourceManagementClient(new DefaultAzureCredential(), subId);
    const groups = [];
    for await (const rg of client.resourceGroups.list()) {
      if (/307/i.test(rg.name)) {
        groups.push({ name: rg.name, location: rg.location, provisioningState: rg.properties?.provisioningState });
      }
    }
    console.log('Azure RGs matching 307:', groups);
  }

  const notif307 = await db.query(
    `
      SELECT id, title, message, request_id, created_at
      FROM notifications
      WHERE message ILIKE '%#307%' OR title ILIKE '%307%'
      ORDER BY created_at DESC
      LIMIT 10
    `
  );
  console.log('\nNotifications for 307:', notif307.rows);

  const similar = await db.query(
    `
      SELECT id, project_name, customer_email, account_count, location, status, created_at
      FROM requests
      WHERE customer_email = 'sumukhsumukh01@gmail.com'
        AND costing_mode = 'per_user'
        AND location = 'southcentralus'
      ORDER BY id
    `
  );
  console.log('\nSimilar requests:', similar.rows);

  // Try to find deleted user rows if soft-delete existed (unlikely after purge)
  const any307users = await db.query(
    `SELECT COUNT(*)::int AS c FROM azure_users WHERE username ILIKE 'cust-307-%'`
  );
  console.log('\nRemaining cust-307 users in DB:', any307users.rows[0]);

  await db.end();
})().catch(async (e) => {
  console.error(e);
  try { await db.end(); } catch {}
  process.exit(1);
});
