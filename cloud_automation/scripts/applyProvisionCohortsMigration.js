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
      '../src/db/migrations/20260807_create_provision_cohorts.sql'
    );
    await client.query(fs.readFileSync(migrationPath, 'utf8'));
    const check = await client.query(`
      SELECT COUNT(*)::int AS c FROM information_schema.tables
      WHERE table_name = 'provision_cohorts'
    `);
    console.log('Migration applied. provision_cohorts present:', check.rows[0].c > 0);
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
