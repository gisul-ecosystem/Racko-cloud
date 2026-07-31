#!/usr/bin/env node
require('dotenv').config();

const db = require('../src/db/postgres');

const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['Azure.User18', 'Azure.User21', 'Azure.User3'];

(async () => {
  const result = await db.query(
    `
      SELECT au.username, au.request_id, r.project_name, au.azure_user_id, au.azure_resource_group_name
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE au.username = ANY($1::text[])
         OR au.username ILIKE 'azure.user%'
      ORDER BY au.username
    `,
    [names]
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
