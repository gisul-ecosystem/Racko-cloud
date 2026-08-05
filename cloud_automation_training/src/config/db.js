import 'dotenv/config';
import { Pool } from 'pg';

// Match cloud_automation: allow disabling SSL for local Postgres;
// Supabase / remote typically need rejectUnauthorized: false.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'false'
      ? false
      : { rejectUnauthorized: false },
});

export { pool };

export default async function connectDB() {
  try {
    const result = await pool.query('SELECT NOW()');
    const timestamp = result.rows[0]?.now;
    console.log(`PostgreSQL connected — ${timestamp}`);
  } catch (err) {
    console.error('PostgreSQL connection failed:', err.message);
    process.exit(1);
  }
}
