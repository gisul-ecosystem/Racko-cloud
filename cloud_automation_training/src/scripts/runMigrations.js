import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../db/migrations');

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  for (const filename of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    try {
      await pool.query(sql);
      console.log(`Applied: ${filename}`);
    } catch (err) {
      console.error(`Failed: ${filename}`);
      throw err;
    }
  }
}

runMigrations()
  .then(async () => {
    await pool.end();
    console.log('Migrations complete.');
  })
  .catch(async (err) => {
    console.error(err);
    try {
      await pool.end();
    } catch {
      // ignore
    }
    process.exit(1);
  });
