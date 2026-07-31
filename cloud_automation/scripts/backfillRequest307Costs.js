#!/usr/bin/env node
/** Backfill Azure costs for restored request #307 history. */
require('dotenv').config();

const { DateTime } = require('luxon');
const db = require('../src/db/postgres');
const { queryCostForResourceGroup } = require('../src/services/azureCostManagementService');

const REQUEST_ID = 307;
const FROM = '2026-07-23';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const users = await db.query(
    `
      SELECT id, username, azure_resource_group_name
      FROM azure_users
      WHERE request_id = $1 AND COALESCE(is_deleted, false) = false
      ORDER BY user_number
    `,
    [REQUEST_ID]
  );

  const budget = await db.query(`SELECT per_user_budget_usd FROM requests WHERE id = $1`, [REQUEST_ID]);
  const budgetAmount = Number(budget.rows[0]?.per_user_budget_usd || 10);
  const to = DateTime.utc().toISODate();

  for (const user of users.rows) {
    const existing = await db.query(
      `SELECT current_spend FROM user_budget_spend WHERE azure_user_id = $1`,
      [user.id]
    );
    if (Number(existing.rows[0]?.current_spend || 0) > 0) {
      console.log(`${user.username}: skip (already ${existing.rows[0].current_spend})`);
      continue;
    }

    try {
      const cost = await queryCostForResourceGroup({
        resourceGroupName: user.azure_resource_group_name,
        from: FROM,
        to
      });

      await db.query(
        `
          INSERT INTO user_budget_spend (azure_user_id, request_id, current_spend, budget_amount, currency, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (azure_user_id) DO UPDATE
          SET current_spend = EXCLUDED.current_spend, currency = EXCLUDED.currency, last_synced_at = NOW()
        `,
        [user.id, REQUEST_ID, Number(cost.cost || 0), budgetAmount, cost.currency || 'INR']
      );

      console.log(`${user.username}: ${cost.currency || 'INR'} ${Number(cost.cost || 0).toFixed(4)}`);
    } catch (error) {
      console.warn(`${user.username}: ${error.message}`);
    }
    await sleep(2500);
  }

  const summary = await db.query(
    `SELECT COUNT(*)::int AS rows, COALESCE(SUM(current_spend),0) AS total FROM user_budget_spend WHERE request_id = $1`,
    [REQUEST_ID]
  );
  console.log('Summary:', summary.rows[0]);
  await db.end();
})().catch(async (e) => {
  console.error(e.message || e);
  try { await db.end(); } catch {}
  process.exit(1);
});
