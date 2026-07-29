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
      '../src/db/migrations/20260727_add_request_starts_at.sql'
    );
    await client.query(fs.readFileSync(migrationPath, 'utf8'));

    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'requests'
        AND column_name = 'starts_at'
    `);

    const sample = await client.query(`
      SELECT id, starts_at, created_at, expires_at
      FROM requests
      ORDER BY id DESC
      LIMIT 5
    `);

    console.log('Migration applied.');
    console.log('starts_at column present:', columnCheck.rows.length > 0);
    console.log('Recent requests:', sample.rows);
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
