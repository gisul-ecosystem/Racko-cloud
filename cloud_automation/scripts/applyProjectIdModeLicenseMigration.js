#!/usr/bin/env node
/**
 * Apply project_name / id_mode / microsoft license columns on requests.
 *
 * Usage:
 *   node scripts/applyProjectIdModeLicenseMigration.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../src/db/migrations/20260722_add_project_id_mode_and_license_fields.sql'
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
