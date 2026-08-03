#!/usr/bin/env node
require('dotenv').config();
const db = require('../src/db/postgres');
(async () => {
  const cols = await db.query(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'azure_users' ORDER BY ordinal_position`
  );
  console.log(cols.rows);
  await db.end();
})();
