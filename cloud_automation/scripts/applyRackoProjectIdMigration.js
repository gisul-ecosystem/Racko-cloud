#!/usr/bin/env node
/**
 * Apply Racko project_id column on Azure requests.
 *
 * Usage:
 *   node scripts/applyRackoProjectIdMigration.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../src/db/migrations/20260805_add_racko_project_id_to_requests.sql'
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
