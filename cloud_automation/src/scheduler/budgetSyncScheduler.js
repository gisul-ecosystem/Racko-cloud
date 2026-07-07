const cron = require('node-cron');
const axios = require('axios');
const db = require('../db/postgres');
const { ensureAzureManagementAccess } = require('../config/azure');

const API_VERSION = '2023-11-01';

let scheduledTask = null;

const logEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'budget-sync-scheduler',
    level,
    event,
    ...details
  };

  const message = JSON.stringify(entry);

  if (level === 'error') {
    console.error(message);
    return;
  }

  console.log(message);
};

/**
 * ONE Azure API call scoped to the subscription, grouped by ResourceGroupName.
 * Returns a map: { 'rg-name-lowercase': { cost, currency } }
 */
async function getAllRGSpendMap() {
  const { subscriptionId, token } = await ensureAzureManagementAccess();
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const body = {
    type: 'ActualCost',
    timeframe: 'Custom',
    timePeriod: {
      from: `${firstOfMonth.toISOString().slice(0, 10)}T00:00:00Z`,
      to: `${now.toISOString().slice(0, 10)}T23:59:59Z`
    },
    dataset: {
      granularity: 'None',
      aggregation: {
        totalCost: { name: 'PreTaxCost', function: 'Sum' }
      },
      grouping: [{ type: 'Dimension', name: 'ResourceGroupName' }]
    }
  };

  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });

  const result = response.data?.properties || response.data;
  const columns = (result.columns || []).map((column) =>
    String(column.name || '').toLowerCase()
  );
  const costIdx = columns.findIndex(
    (name) => name === 'cost' || name === 'pretaxcost'
  );
  const rgIdx = columns.findIndex((name) => name === 'resourcegroupname');
  const currencyIdx = columns.findIndex((name) => name === 'currency');

  if (costIdx === -1 || rgIdx === -1) {
    throw new Error(
      `Unexpected Cost Management response columns: ${JSON.stringify(result.columns)}`
    );
  }

  const spendMap = {};
  for (const row of result.rows || []) {
    const rgName = String(row[rgIdx] || '').toLowerCase();
    const cost = parseFloat(row[costIdx] || 0);
    const currency =
      currencyIdx >= 0 ? String(row[currencyIdx] || 'USD') : 'USD';

    spendMap[rgName] = { cost, currency };
  }

  return spendMap;
}

/**
 * Wraps getAllRGSpendMap with exponential backoff retry.
 * Retries up to 3 times on 429 throttle errors only.
 * Waits 10s → 20s → 40s between attempts.
 */
async function getAllRGSpendMapWithRetry(maxRetries = 3) {
  let lastErr;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getAllRGSpendMap();
    } catch (err) {
      lastErr = err;

      const statusCode = err.statusCode || err.response?.status;
      const isThrottle =
        statusCode === 429 ||
        String(err.message || '')
          .toLowerCase()
          .includes('too many requests');

      if (!isThrottle || attempt === maxRetries) {
        throw err;
      }

      const waitMs = 10_000 * Math.pow(2, attempt - 1);
      logEvent('warn', 'cost_query_throttled_retrying', {
        attempt,
        waitMs,
        error: err.message
      });

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastErr;
}

/**
 * Makes ONE Azure Cost Management call for all users combined,
 * then distributes results to each user via DB upsert.
 */
async function syncAllUserBudgetSpend() {
  const { rows: users } = await db.query(
    `
      SELECT
        au.id,
        au.request_id,
        au.azure_resource_group_name,
        r.per_user_budget_usd AS base_budget,
        COALESCE(au.budget_top_up_usd, 0) AS top_up
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE r.status = 'Completed'
        AND COALESCE(r.expired, FALSE) = FALSE
        AND r.per_user_budget_usd IS NOT NULL
        AND au.azure_resource_group_name IS NOT NULL
        AND COALESCE(au.is_deleted, FALSE) = FALSE
    `
  );

  if (!users.length) {
    logEvent('info', 'sync_skipped_no_users');
    return;
  }

  let spendMap = {};
  let bulkSyncError = null;

  try {
    spendMap = await getAllRGSpendMapWithRetry();
  } catch (err) {
    bulkSyncError = err.message;
    logEvent('error', 'subscription_cost_query_failed', {
      error: err.message
    });
  }

  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      if (bulkSyncError) {
        await db.query(
          `
            INSERT INTO user_budget_spend (azure_user_id, request_id, last_sync_attempted_at, sync_error)
            VALUES ($1, $2, NOW(), $3)
            ON CONFLICT (azure_user_id)
            DO UPDATE SET
              sync_error = EXCLUDED.sync_error,
              last_sync_attempted_at = NOW()
          `,
          [user.id, user.request_id, bulkSyncError]
        );
        errorCount++;
        continue;
      }

      const rgKey = String(user.azure_resource_group_name || '').toLowerCase();
      const entry = spendMap[rgKey] || { cost: 0, currency: 'USD' };
      const spend = entry.cost;
      const currency = entry.currency || 'USD';
      const totalBudget =
        parseFloat(user.base_budget || 0) + parseFloat(user.top_up || 0);

      await db.query(
        `
          INSERT INTO user_budget_spend
            (azure_user_id, request_id, current_spend, budget_amount, currency, last_synced_at, sync_error, last_sync_attempted_at)
          VALUES ($1, $2, $3, $4, $5, NOW(), NULL, NOW())
          ON CONFLICT (azure_user_id)
          DO UPDATE SET
            current_spend = EXCLUDED.current_spend,
            budget_amount = EXCLUDED.budget_amount,
            currency = EXCLUDED.currency,
            last_synced_at = NOW(),
            sync_error = NULL,
            last_sync_attempted_at = NOW()
        `,
        [user.id, user.request_id, spend, totalBudget, currency]
      );

      successCount++;
    } catch (err) {
      errorCount++;
      logEvent('error', 'user_db_update_failed', {
        userId: user.id,
        error: err.message
      });

      try {
        await db.query(
          `
            UPDATE user_budget_spend
            SET sync_error = $1, last_sync_attempted_at = NOW()
            WHERE azure_user_id = $2
          `,
          [err.message, user.id]
        );
      } catch {
        // Non-fatal if cache row does not exist yet.
      }
    }
  }

  if (bulkSyncError) {
    logEvent('error', 'sync_completed_with_errors', {
      totalUsers: users.length,
      errorCount: users.length,
      error: bulkSyncError
    });
    return;
  }

  logEvent('info', 'sync_completed', {
    totalUsers: users.length,
    successCount,
    errorCount,
    rgsInMap: Object.keys(spendMap).length
  });
}

const startBudgetSpendSyncScheduler = () => {
  if (scheduledTask) {
    return scheduledTask;
  }

  scheduledTask = cron.schedule('*/15 * * * *', () => {
    syncAllUserBudgetSpend().catch((err) => {
      logEvent('error', 'sync_error', { error: err.message });
    });
  });

  syncAllUserBudgetSpend().catch((err) => {
    logEvent('error', 'initial_sync_error', { error: err.message });
  });

  logEvent('info', 'started', { intervalMinutes: 15 });
  return scheduledTask;
};

module.exports = {
  startBudgetSpendSyncScheduler,
  syncAllUserBudgetSpend
};
