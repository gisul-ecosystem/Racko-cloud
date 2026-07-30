#!/usr/bin/env node
require('dotenv').config();
const db = require('../src/db/postgres');

const REQUEST_ID = Number(process.argv[2] || 307);
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

(async () => {
  const request = await db.query(
    `
      SELECT id, project_name, customer_email, enable_daily_usage, daily_limit_minutes, usage_schedule
      FROM requests WHERE id = $1
    `,
    [REQUEST_ID]
  );

  if (!request.rows.length) {
    throw new Error(`Request #${REQUEST_ID} not found`);
  }

  const windows = await db.query(
    `
      SELECT day_of_week, window_start_time, window_end_time, daily_limit_hours, timezone
      FROM request_usage_windows
      WHERE request_id = $1
      ORDER BY day_of_week ASC
    `,
    [REQUEST_ID]
  );

  const r = request.rows[0];
  console.log(`Request #${r.id} — ${r.project_name || '—'}`);
  console.log(`Customer: ${r.customer_email}`);
  console.log(`Daily usage enabled: ${r.enable_daily_usage}`);
  console.log(`Daily limit minutes: ${r.daily_limit_minutes ?? '—'}`);
  console.log('');

  if (windows.rows.length === 0) {
    console.log('No usage windows configured.');
    if (r.usage_schedule) {
      console.log('usage_schedule JSON:', JSON.stringify(r.usage_schedule, null, 2));
    }
    await db.end();
    return;
  }

  console.log('Usage windows:');
  for (const w of windows.rows) {
    const day = DAY_NAMES[w.day_of_week] ?? `day ${w.day_of_week}`;
    const start = String(w.window_start_time || '').slice(0, 5);
    const end = String(w.window_end_time || '').slice(0, 5);
    console.log(
      `  ${day.padEnd(10)} ${start} – ${end}  (${w.timezone || 'Asia/Kolkata'})` +
        (w.daily_limit_hours != null ? `  limit: ${w.daily_limit_hours}h` : '')
    );
  }

  const friday = windows.rows.find((w) => Number(w.day_of_week) === 5);
  console.log('');
  if (friday) {
    const end = String(friday.window_end_time || '').slice(0, 8);
    const tz = friday.timezone || 'Asia/Kolkata';
    console.log(`Friday session ends at: ${end} ${tz}`);
    if (friday.window_start_time) {
      console.log(`Friday session starts at: ${String(friday.window_start_time).slice(0, 8)} ${tz}`);
    }
  } else {
    console.log('No Friday-specific window found.');
  }

  await db.end();
})().catch(async (e) => {
  console.error(e.message || e);
  try { await db.end(); } catch {}
  process.exit(1);
});
