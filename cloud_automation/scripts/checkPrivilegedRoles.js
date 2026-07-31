#!/usr/bin/env node
require('dotenv').config();

const db = require('../src/db/postgres');
const requestId = Number(process.argv[2] || 313);

(async () => {
  const queries = [
    ['privileged_role_requests', 'SELECT * FROM privileged_role_requests WHERE request_id = $1'],
    [
      'role_assignments',
      `SELECT * FROM role_assignments WHERE request_id = $1 LIMIT 20`
    ]
  ];

  for (const [label, sql] of queries) {
    try {
      const result = await db.query(sql, [requestId]);
      console.log(`\n=== ${label} (${result.rows.length}) ===`);
      console.log(JSON.stringify(result.rows, null, 2));
    } catch (error) {
      console.log(`\n=== ${label}: ${error.message.split('\n')[0]} ===`);
    }
  }

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
