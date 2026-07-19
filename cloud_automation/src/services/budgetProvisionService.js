const db = require('../db/postgres');
const { createUserBudget } = require('../provisioners/azure/azureBudgetProvisioner');
const { createGraphClient, getVerifiedDomain } = require('../provisioners/azure/userProvisioner');
const { runWithConcurrency } = require('../utils/concurrency');
const { getBulkProvisionConcurrency } = require('../utils/provisionConcurrency');

const logBudgetEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'budget-provision-service',
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

const getRequestBudgetContext = async (requestId) => {
  const result = await db.query(
    `
      SELECT
        id,
        per_user_budget_usd,
        expiry_date,
        created_at
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );

  return result.rows[0] || null;
};

const getUsersForBudgetProvisioning = async (requestId) => {
  const result = await db.query(
    `
      SELECT
        id,
        username,
        azure_resource_group_name,
        budget_id
      FROM azure_users
      WHERE request_id = $1
        AND azure_resource_group_name IS NOT NULL
    `,
    [requestId]
  );

  return result.rows;
};

const provisionBudgetsForRequest = async (requestId) => {
  const request = await getRequestBudgetContext(requestId);
  const budgetAmountUsd = Number(request?.per_user_budget_usd);

  if (!request || !Number.isFinite(budgetAmountUsd) || budgetAmountUsd <= 0) {
    return { budgetsCreated: 0 };
  }

  const users = await getUsersForBudgetProvisioning(requestId);

  if (!users.length) {
    return { budgetsCreated: 0 };
  }

  const { graphClient } = createGraphClient();
  const verifiedDomain = await getVerifiedDomain(graphClient);
  const startDate = request.created_at ? new Date(request.created_at) : new Date();
  const endDate = request.expiry_date ? new Date(request.expiry_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const usersNeedingBudgets = users.filter((user) => !user.budget_id);
  let budgetsCreated = 0;

  await runWithConcurrency(
    usersNeedingBudgets,
    getBulkProvisionConcurrency(),
    async (user) => {
      const userEmail = `${user.username}@${verifiedDomain}`;

      try {
        const { budgetId } = await createUserBudget({
          resourceGroupName: user.azure_resource_group_name,
          userId: user.id,
          userEmail,
          budgetAmountUsd,
          startDate,
          endDate
        });

        await db.query(
          `
            UPDATE azure_users
            SET budget_id = $1
            WHERE id = $2
          `,
          [budgetId, user.id]
        );

        budgetsCreated += 1;

        logBudgetEvent('info', 'user_budget_created', {
          requestId,
          userId: user.id,
          budgetId
        });
      } catch (error) {
        logBudgetEvent('error', 'user_budget_create_failed', {
          requestId,
          userId: user.id,
          message: error?.message
        });
      }
    }
  );

  return { budgetsCreated };
};

module.exports = {
  provisionBudgetsForRequest
};
