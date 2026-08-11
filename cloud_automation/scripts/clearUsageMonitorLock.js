require('dotenv').config();
const db = require('../src/db/postgres');
const { jobLockKey } = require('../src/utils/schedulerCoordinator');

const JOBS = [
  'usage-monitor',
  'window-enforcement',
  'scheduled-cleanup',
  'budget-poll',
  'budget-spend-sync-initial'
];

(async () => {
  console.log('=== Scheduler advisory lock keys ===');
  for (const job of JOBS) {
    console.log(`${job}: ${jobLockKey(job)}`);
  }

  const locks = await db.query(`
    SELECT
      l.pid,
      l.classid,
      l.objid,
      l.granted,
      a.application_name,
      a.client_addr,
      a.backend_start,
      a.state,
      a.state_change,
      NOW() - a.state_change AS idle_for,
      LEFT(a.query, 100) AS query
    FROM pg_locks l
    JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE l.locktype = 'advisory'
    ORDER BY a.backend_start
  `);

  console.log('\n=== All advisory locks ===');
  console.log(JSON.stringify(locks.rows, null, 2));

  const usageKey = jobLockKey('usage-monitor');
  const holders = locks.rows.filter(
    (row) => Number(row.classid) === 0 && Number(row.objid) === Number(usageKey)
  );

  if (holders.length === 0) {
    console.log('\nNo usage-monitor lock is held right now.');
    process.exit(0);
  }

  console.log('\n=== Terminating backends holding usage-monitor lock ===');
  for (const row of holders) {
    console.log(`Terminating pid ${row.pid} (state=${row.state}, idle_for=${row.idle_for})`);
    await db.query('SELECT pg_terminate_backend($1)', [row.pid]);
  }

  console.log('Done.');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
