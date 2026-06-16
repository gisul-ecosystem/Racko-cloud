const axios = require('axios');
const { createAzureCredential, validateAzureEnv } = require('../config/azure');
const AppError = require('../utils/AppError');

const API_VERSION = '2023-11-01';
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logCostManagementEvent = (event, details = {}) => {
  console.log(
    JSON.stringify({
      event,
      service: 'azure-cost-management',
      timestamp: new Date().toISOString(),
      ...details
    })
  );
};

const getManagementAccessToken = async () => {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  const token = await credential.getToken('https://management.azure.com/.default');

  return {
    accessToken: token.token,
    subscriptionId: azureConfig.subscriptionId
  };
};

const normalizeResourceGroupName = (resourceGroupName) =>
  String(resourceGroupName || '')
    .trim()
    .toLowerCase();

const toIsoDateStart = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const parseCostQueryResponse = (data) => {
  const columns = data?.properties?.columns || [];
  const rows = data?.properties?.rows || [];

  if (rows.length === 0) {
    return { cost: 0, currency: 'USD' };
  }

  const costColumnIndex = columns.findIndex((column) =>
    ['PreTaxCost', 'Cost', 'totalCost'].includes(String(column.name || ''))
  );
  const currencyColumnIndex = columns.findIndex(
    (column) => String(column.name || '') === 'Currency'
  );

  const row = rows[0];
  const cost = costColumnIndex >= 0 ? Number(row[costColumnIndex] || 0) : 0;
  const currency =
    currencyColumnIndex >= 0 ? String(row[currencyColumnIndex] || 'USD') : 'USD';

  return {
    cost: Number(Number.isFinite(cost) ? cost.toFixed(4) : 0),
    currency: currency || 'USD'
  };
};

const buildCostQueryBody = ({ resourceGroupName, from, to }) => {
  const normalizedResourceGroup = normalizeResourceGroupName(resourceGroupName);

  const body = {
    type: 'ActualCost',
    timeframe: from && to ? 'Custom' : 'MonthToDate',
    dataset: {
      granularity: 'None',
      aggregation: {
        totalCost: {
          name: 'PreTaxCost',
          function: 'Sum'
        }
      },
      filter: {
        dimensions: {
          name: 'ResourceGroupName',
          operator: 'In',
          values: [normalizedResourceGroup]
        }
      }
    }
  };

  if (from && to) {
    body.timePeriod = {
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`
    };
  }

  return body;
};

const queryCostForResourceGroup = async ({ resourceGroupName, from = null, to = null }) => {
  const normalizedResourceGroup = normalizeResourceGroupName(resourceGroupName);

  if (!normalizedResourceGroup) {
    throw new AppError('Resource group name is required to query Azure cost.', 400);
  }

  const { accessToken, subscriptionId } = await getManagementAccessToken();
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;
  const body = buildCostQueryBody({
    resourceGroupName: normalizedResourceGroup,
    from,
    to
  });

  logCostManagementEvent('cost_query_started', {
    resourceGroup: normalizedResourceGroup,
    timeframe: body.timeframe,
    from,
    to
  });

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const parsed = parseCostQueryResponse(response.data);

      logCostManagementEvent('cost_query_completed', {
        resourceGroup: normalizedResourceGroup,
        cost: parsed.cost,
        currency: parsed.currency
      });

      return parsed;
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.response?.status);

      if (statusCode === 403) {
        throw new AppError(
          'Azure Cost Management access denied. Assign Cost Management Reader to the service principal on the subscription.',
          502
        );
      }

      if (statusCode === 404) {
        throw new AppError(
          `Azure cost data is unavailable for resource group '${normalizedResourceGroup}'.`,
          404
        );
      }

      if (!RETRYABLE_STATUS_CODES.has(statusCode) || attempt === MAX_RETRY_ATTEMPTS) {
        break;
      }

      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  const message =
    lastError?.response?.data?.error?.message ||
    lastError?.message ||
    'Failed to query Azure cost data.';

  logCostManagementEvent('cost_query_failed', {
    resourceGroup: normalizedResourceGroup,
    message
  });

  throw new AppError(message, 502);
};

const getResourceGroupCosts = async ({ resourceGroupName, requestCreatedAt }) => {
  const today = toIsoDateStart(new Date());
  const requestStart = toIsoDateStart(requestCreatedAt);

  const [monthToDate, lifetime] = await Promise.all([
    queryCostForResourceGroup({ resourceGroupName }),
    requestStart
      ? queryCostForResourceGroup({
          resourceGroupName,
          from: requestStart,
          to: today
        })
      : queryCostForResourceGroup({ resourceGroupName })
  ]);

  return {
    monthToDateCost: monthToDate.cost,
    lifetimeCost: lifetime.cost,
    currency: monthToDate.currency || lifetime.currency || 'USD'
  };
};

module.exports = {
  getResourceGroupCosts,
  queryCostForResourceGroup,
  normalizeResourceGroupName
};
