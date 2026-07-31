#!/usr/bin/env node
require('dotenv').config();

const pool = require('../src/config/database');

async function main() {
  const result = await pool.query(`
    SELECT
      id,
      project_name,
      customer_email,
      location,
      account_count,
      expiry_date,
      expires_at,
      created_at,
      status
    FROM requests
    WHERE customer_email ILIKE $1
      AND project_name ILIKE $2
      AND location ILIKE $3
      AND account_count = $4
    ORDER BY created_at DESC
    LIMIT 1
  `, ['%sumukhsumukh01@gmail.com%', 'Labs Azure', 'southcentralus', 11]);

  if (result.rows.length === 0) {
    console.log('No exact match — trying broader search...');
    const fallback = await pool.query(`
      SELECT id, project_name, created_at, expires_at, expiry_date, account_count, location
      FROM requests
      WHERE customer_email ILIKE $1 AND project_name ILIKE $2
      ORDER BY created_at DESC
      LIMIT 1
    `, ['%sumukhsumukh01%', '%Labs Azure%']);
    if (!fallback.rows.length) {
      console.log('No matching request found.');
      await pool.end();
      return;
    }
    const row = fallback.rows[0];
    console.log(`Request #${row.id} | ${row.project_name}`);
    console.log(`Start time (created_at): ${row.created_at}`);
    console.log(`Expires: ${row.expires_at ?? row.expiry_date ?? '—'}`);
    await pool.end();
    return;
  }

  const row = result.rows[0];
  console.log(`Request #${row.id} | ${row.project_name}`);
  console.log(`Start time (created_at): ${row.created_at}`);
  console.log(`Expires: ${row.expires_at ?? row.expiry_date ?? '—'}`);

  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message || error);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
