#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../src/db/migrations/20260722_add_purchase_intent_fields.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Applying migration:', sqlPath);
  await pool.query(sql);
  console.log('Migration applied successfully.');
  await pool.end();
}

main().catch(async (error) => {
  console.error('Migration failed:', error.message || error);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
