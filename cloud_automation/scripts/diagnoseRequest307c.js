#!/usr/bin/env node
require('dotenv').config();
const crypto = require('crypto');
const db = require('../src/db/postgres');

const PORTAL_TOKEN = '561e2481-68d5-40c5-b64b-a36904721740';

(async () => {
  const tokenHash = crypto.createHash('sha256').update(PORTAL_TOKEN).digest('hex');
  const token = await db.query(
    `SELECT request_id, customer_email, expires_at, used FROM access_portal_tokens WHERE token_hash = $1`,
    [tokenHash]
  );
  console.log('Portal token row:', token.rows[0] || null);

  const r308 = await db.query(`SELECT id, created_at, project_name FROM requests WHERE id = 308`);
  console.log('Request 308:', r308.rows[0]);

  const roles306 = await db.query(
    `SELECT azure_role, scope FROM request_service_roles WHERE request_id = 306 LIMIT 30`
  );
  console.log('306 roles:', roles306.rows.length, roles306.rows.slice(0, 5));

  await db.end();
})().catch(async (e) => {
  console.error(e);
  try { await db.end(); } catch {}
  process.exit(1);
});
