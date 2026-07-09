require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace(/:6543\//, ':5432/'),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    const migrationPath = path.join(
      __dirname,
      '../src/db/migrations/20260709_request_expires_at.sql'
    );
    await client.query(fs.readFileSync(migrationPath, 'utf8'));

    const request234 = await client.query(`
      SELECT id, expiry_date, expires_at, status
      FROM requests
      WHERE id = 234
    `);

    const users234 = await client.query(`
      SELECT azure_account_enabled, status
      FROM azure_users
      WHERE request_id = 234
    `);

    console.log('Migration applied.');
    console.log('Request 234:', request234.rows);
    console.log('Users 234:', users234.rows);
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
