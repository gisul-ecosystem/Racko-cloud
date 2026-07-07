const { ConsumptionManagementClient } = require('@azure/arm-consumption');
const { MonitorClient } = require('@azure/arm-monitor');
const { createAzureCredential, validateAzureEnv } = require('../../config/azure');

const createBudgetClients = () => {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);

  return {
    consumptionClient: new ConsumptionManagementClient(credential, azureConfig.subscriptionId),
    monitorClient: new MonitorClient(credential, azureConfig.subscriptionId),
    subscriptionId: azureConfig.subscriptionId
  };
};

const formatBudgetDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid budget date value.');
  }

  return date.toISOString().slice(0, 10);
};

const toBudgetPeriodStartDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid budget start date value.');
  }

  return formatBudgetDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
};

const toBudgetPeriodEndDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid budget end date value.');
  }

  return formatBudgetDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
};

const buildBudgetNotifications = (userEmail) => ({
  BudgetExceeded: {
    enabled: true,
    operator: 'GreaterThan',
    threshold: 100,
    contactEmails: [userEmail],
    thresholdType: 'Actual'
  },
  BudgetApproaching: {
    enabled: true,
    operator: 'GreaterThan',
    threshold: 80,
    contactEmails: [userEmail],
    thresholdType: 'Actual'
  }
});

/**
 * Creates an Azure Consumption budget for a single user's resource group.
 * Enforcement (account disable) is handled by the budget polling scheduler.
 */
const createUserBudget = async ({
  resourceGroupName,
  userId,
  userEmail,
  budgetAmountUsd,
  startDate,
  endDate
}) => {
  const { consumptionClient, subscriptionId } = createBudgetClients();
  const resourceGroupScope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;
  const budgetName = `racko-budget-${userId}`;

  const budgetResult = await consumptionClient.budgets.createOrUpdate(
    resourceGroupScope,
    budgetName,
    {
      amount: budgetAmountUsd,
      category: 'Cost',
      timeGrain: 'Monthly',
      timePeriod: {
        startDate: toBudgetPeriodStartDate(startDate),
        endDate: toBudgetPeriodEndDate(endDate)
      },
      notifications: buildBudgetNotifications(userEmail)
    }
  );

  return {
    budgetId: budgetResult.id,
    actionGroupId: null
  };
};

const updateUserBudgetAmount = async ({ resourceGroupName, userId, newBudgetAmount, endDate }) => {
  const { consumptionClient, subscriptionId } = createBudgetClients();
  const resourceGroupScope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;
  const budgetName = `racko-budget-${userId}`;

  let existingBudget;

  try {
    existingBudget = await consumptionClient.budgets.get(resourceGroupScope, budgetName);
  } catch (error) {
    const code = String(error?.code || error?.statusCode || '').toLowerCase();
    if (code.includes('notfound') || code === '404') {
      console.warn(
        JSON.stringify({
          service: 'azure-budget-provisioner',
          event: 'budget_not_found_for_update',
          userId,
          resourceGroupName
        })
      );
      return;
    }

    throw error;
  }

  await consumptionClient.budgets.createOrUpdate(resourceGroupScope, budgetName, {
    ...existingBudget,
    amount: newBudgetAmount,
    timePeriod: {
      ...existingBudget.timePeriod,
      endDate: toBudgetPeriodEndDate(endDate)
    }
  });

  console.log(
    JSON.stringify({
      service: 'azure-budget-provisioner',
      event: 'budget_amount_updated',
      userId,
      resourceGroupName,
      newBudgetAmount
    })
  );
};

const deleteUserBudget = async ({ resourceGroupName, userId }) => {
  const { consumptionClient, monitorClient, subscriptionId } = createBudgetClients();
  const resourceGroupScope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;
  const budgetName = `racko-budget-${userId}`;
  const actionGroupName = `racko-budget-ag-${userId}`;

  try {
    await consumptionClient.budgets.delete(resourceGroupScope, budgetName);
  } catch (error) {
    const code = String(error?.code || error?.statusCode || '').toLowerCase();
    if (!code.includes('notfound') && code !== '404') {
      throw error;
    }
  }

  try {
    await monitorClient.actionGroups.delete(resourceGroupName, actionGroupName);
  } catch (error) {
    const code = String(error?.code || error?.statusCode || '').toLowerCase();
    if (!code.includes('notfound') && code !== '404') {
      throw error;
    }
  }
};

module.exports = {
  createUserBudget,
  deleteUserBudget,
  updateUserBudgetAmount
};
