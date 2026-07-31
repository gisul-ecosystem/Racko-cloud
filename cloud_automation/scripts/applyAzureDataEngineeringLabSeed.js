#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../src/db/migrations/20260724_seed_azure_data_engineering_lab_catalog.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Applying migration:', sqlPath);
  await pool.query(sql);

  const roles = await pool.query(
    "SELECT name FROM custom_role_definitions WHERE name LIKE 'Lab - %' ORDER BY name"
  );
  const services = await pool.query(
    "SELECT name FROM custom_services WHERE name IN ('Azure Data Factory', 'Azure Databricks', 'Azure Synapse Analytics') ORDER BY name"
  );

  console.log('Roles seeded:', roles.rows.map((row) => row.name).join(', '));
  console.log('Services seeded:', services.rows.map((row) => row.name).join(', '));
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
