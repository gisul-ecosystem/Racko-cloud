require('dotenv').config();
const { Client } = require('pg');

const TABLES = [
  'requests',
  'azure_users',
  'user_usage_sessions',
  'processed_azure_signins',
  'request_services',
  'request_service_roles',
  'request_usage_windows',
  'usage_enforcement_logs',
  'admin_access_requests'
];

async function countRows(client, table) {
  try {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    return result.rows[0].count;
  } catch (error) {
    if (error.message.includes('does not exist')) {
      return null;
    }
    throw error;
  }
}

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace(/:6543\//, ':5432/'),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    const before = {};
    for (const table of TABLES) {
      before[table] = await countRows(client, table);
    }

    console.log('Before delete:', before);

    await client.query('BEGIN');

    // Tables with NO ACTION FK to requests must be cleared first.
    await client.query('DELETE FROM processed_azure_signins');
    await client.query('DELETE FROM usage_enforcement_logs');
    await client.query('DELETE FROM request_service_roles');
    await client.query('DELETE FROM user_usage_sessions');
    await client.query('DELETE FROM requests');

    await client.query('COMMIT');

    const after = {};
    for (const table of TABLES) {
      after[table] = await countRows(client, table);
    }

    console.log('After delete:', after);
    console.log('Done. All lab requests and azure_users removed (CASCADE). Admins and service catalog untouched.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
