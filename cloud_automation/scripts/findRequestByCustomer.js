#!/usr/bin/env node
require('dotenv').config();

const db = require('../src/db/postgres');
const term = process.argv[2] || 'sumukhsumukh01';

(async () => {
  const result = await db.query(
    `
      SELECT id, project_name, customer_email, status, account_count,
        (SELECT COUNT(*)::int FROM azure_users au WHERE au.request_id = requests.id AND COALESCE(au.is_deleted,false)=false) AS user_count
      FROM requests
      WHERE customer_email ILIKE $1 OR project_name ILIKE $1
      ORDER BY id DESC
      LIMIT 20
    `,
    [`%${term}%`]
  );
  console.log(JSON.stringify(result.rows, null, 2));
  await db.end();
})().catch(async (error) => {
  console.error(error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
