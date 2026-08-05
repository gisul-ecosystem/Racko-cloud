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
      '../src/db/migrations/20260805_add_portal_base_url.sql'
    );
    await client.query(fs.readFileSync(migrationPath, 'utf8'));

    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'requests'
        AND column_name = 'portal_base_url'
    `);

    console.log('Migration applied.');
    console.log(
      columnCheck.rows.length > 0
        ? 'portal_base_url column OK'
        : 'portal_base_url column MISSING'
    );
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
