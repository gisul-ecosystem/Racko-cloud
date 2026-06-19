const db = require('../db/postgres');
const { queryCostForResourceGroup } = require('./azureCostManagementService');
const {
  enforceBudgetExceededForUser,
  logBudgetEnforcementEvent
} = require('./budgetEnforcementService');

const getUsersForBudgetPolling = async () => {
  const result = await db.query(
    `
      SELECT
        au.id,
        au.azure_user_id,
        au.request_id,
        au.azure_resource_group_name,
        au.username,
        r.per_user_budget_usd,
        COALESCE(au.budget_top_up_usd, 0) AS budget_top_up_usd
      FROM azure_users au
      INNER JOIN requests r ON r.id = au.request_id
      WHERE au.budget_id IS NOT NULL
        AND au.azure_resource_group_name IS NOT NULL
        AND COALESCE(au.budget_exceeded, false) = FALSE
        AND COALESCE(au.is_deleted, false) = FALSE
        AND r.per_user_budget_usd IS NOT NULL
        AND r.per_user_budget_usd > 0
        AND COALESCE(r.expired, false) = FALSE
        AND r.status NOT IN ('Expired', 'Cleanup In Progress', 'Cleanup Failed')
      ORDER BY au.id ASC
    `
  );

  return result.rows;
};

const resolveContactEmail = (username) =>
  String(username || '').includes('@') ? String(username).trim() : null;

const checkUserBudget = async (user) => {
  const budgetLimitUsd =
    Number(user.per_user_budget_usd) + Number(user.budget_top_up_usd || 0);

  if (!Number.isFinite(budgetLimitUsd) || budgetLimitUsd <= 0) {
    return { exceeded: false, skipped: true };
  }

  const { cost, currency } = await queryCostForResourceGroup({
    resourceGroupName: user.azure_resource_group_name
  });

  if (cost < budgetLimitUsd) {
    return {
      exceeded: false,
      cost,
      currency,
      budgetLimitUsd
    };
  }

  await enforceBudgetExceededForUser({
    ...user,
    contact_email: resolveContactEmail(user.username)
  });

  logBudgetEnforcementEvent('info', 'budget_exceeded_enforced', {
    requestId: user.request_id,
    userId: user.id,
    resourceGroupName: user.azure_resource_group_name,
    cost,
    currency,
    budgetLimitUsd
  });

  return {
    exceeded: true,
    cost,
    currency,
    budgetLimitUsd
  };
};

const runBudgetPoll = async () => {
  logBudgetEnforcementEvent('info', 'budget_poll_started');

  const users = await getUsersForBudgetPolling();
  let checkedCount = 0;
  let exceededCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      const result = await checkUserBudget(user);
      checkedCount += 1;

      if (result.exceeded) {
        exceededCount += 1;
      }
    } catch (error) {
      errorCount += 1;
      logBudgetEnforcementEvent('error', 'budget_poll_user_failed', {
        requestId: user.request_id,
        userId: user.id,
        resourceGroupName: user.azure_resource_group_name,
        message: error?.message
      });
    }
  }

  logBudgetEnforcementEvent('info', 'budget_poll_completed', {
    trackedUsers: users.length,
    checkedCount,
    exceededCount,
    errorCount
  });

  return {
    trackedUsers: users.length,
    checkedCount,
    exceededCount,
    errorCount
  };
};

module.exports = {
  getUsersForBudgetPolling,
  checkUserBudget,
  runBudgetPoll
};
