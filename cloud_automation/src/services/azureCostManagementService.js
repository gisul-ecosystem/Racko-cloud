const axios = require('axios');
const { createAzureCredential, validateAzureEnv } = require('../config/azure');
const AppError = require('../utils/AppError');

const API_VERSION = '2023-11-01';
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;
const COST_CACHE_TTL_MS = 15 * 60 * 1000;

/** @type {Map<string, { data: object, fetchedAt: number }>} */
const costCache = new Map();

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

const buildCostQueryBody = ({ resourceGroupName, from, to, useScopeQuery = false }) => {
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
      }
    }
  };

  if (!useScopeQuery) {
    body.dataset.filter = {
      dimensions: {
        name: 'ResourceGroupName',
        operator: 'In',
        values: [normalizedResourceGroup]
      }
    };
  }

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
  const scope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;
  const scopeUrl = `https://management.azure.com${scope}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;
  const subscriptionUrl = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;
  const body = buildCostQueryBody({
    resourceGroupName: normalizedResourceGroup,
    from,
    to,
    useScopeQuery: true
  });
  const fallbackBody = buildCostQueryBody({
    resourceGroupName: normalizedResourceGroup,
    from,
    to,
    useScopeQuery: false
  });

  logCostManagementEvent('cost_query_started', {
    resourceGroup: normalizedResourceGroup,
    timeframe: body.timeframe,
    from,
    to,
    scope
  });

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    for (const [url, requestBody] of [
      [scopeUrl, body],
      [subscriptionUrl, fallbackBody]
    ]) {
      try {
        const response = await axios.post(url, requestBody, {
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
          currency: parsed.currency,
          endpoint: url.includes('/resourceGroups/') ? 'scope' : 'subscription'
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
          continue;
        }

        if (!RETRYABLE_STATUS_CODES.has(statusCode)) {
          break;
        }
      }
    }

    if (attempt < MAX_RETRY_ATTEMPTS) {
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

const buildCostCacheKey = (resourceGroupName, requestCreatedAt) => {
  const today = toIsoDateStart(new Date());
  const requestStart = toIsoDateStart(requestCreatedAt);
  return `${normalizeResourceGroupName(resourceGroupName)}:${today}:${requestStart || 'lifetime'}`;
};

const getResourceGroupCosts = async ({ resourceGroupName, requestCreatedAt, bypassCache = false }) => {
  const cacheKey = buildCostCacheKey(resourceGroupName, requestCreatedAt);

  if (!bypassCache) {
    const cached = costCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < COST_CACHE_TTL_MS) {
      const cacheAgeMinutes = Math.round((Date.now() - cached.fetchedAt) / 60000);
      logCostManagementEvent('cost_cache_hit', {
        resourceGroup: normalizeResourceGroupName(resourceGroupName),
        cacheAgeMinutes
      });
      return {
        ...cached.data,
        fromCache: true,
        cacheAge: cacheAgeMinutes
      };
    }
  }

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

  const costData = {
    monthToDateCost: monthToDate.cost,
    lifetimeCost: lifetime.cost,
    currency: monthToDate.currency || lifetime.currency || 'USD',
    fromCache: false,
    cacheAge: 0
  };

  costCache.set(cacheKey, {
    data: {
      monthToDateCost: costData.monthToDateCost,
      lifetimeCost: costData.lifetimeCost,
      currency: costData.currency
    },
    fetchedAt: Date.now()
  });

  return costData;
};

const getCachedResourceGroupCosts = (resourceGroupName, requestCreatedAt) => {
  const cacheKey = buildCostCacheKey(resourceGroupName, requestCreatedAt);
  const cached = costCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  return {
    ...cached.data,
    fromCache: true,
    cacheAge: Math.round((Date.now() - cached.fetchedAt) / 60000),
    cacheExpired: Date.now() - cached.fetchedAt >= COST_CACHE_TTL_MS
  };
};

const indexCostQueryColumns = (columns) => {
  const map = {};
  columns.forEach((column, index) => {
    map[String(column.name)] = index;
  });
  return map;
};

const parseAzureUsageDate = (rawValue) => {
  const rawDate = String(rawValue ?? '');
  if (rawDate.length >= 8) {
    return `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
  }
  return rawDate;
};

const queryDailyCostsForResourceGroups = async ({
  resourceGroupNames,
  from,
  to,
  groupByResourceGroup = true
}) => {
  const normalizedGroups = [...new Set(
    (resourceGroupNames || [])
      .map((name) => normalizeResourceGroupName(name))
      .filter(Boolean)
  )];

  if (!normalizedGroups.length) {
    return { currency: 'USD', rows: [] };
  }

  if (!from || !to) {
    throw new AppError('Both from and to dates are required for daily cost queries.', 400);
  }

  const { accessToken, subscriptionId } = await getManagementAccessToken();
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;

  const dataset = {
    granularity: 'Daily',
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
        values: normalizedGroups
      }
    }
  };

  if (groupByResourceGroup) {
    dataset.grouping = [{ type: 'Dimension', name: 'ResourceGroupName' }];
  }

  const body = {
    type: 'ActualCost',
    timeframe: 'Custom',
    timePeriod: {
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`
    },
    dataset
  };

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      const columns = response.data?.properties?.columns || [];
      const rawRows = response.data?.properties?.rows || [];
      const idx = indexCostQueryColumns(columns);

      const costIdx = idx.PreTaxCost ?? idx.Cost ?? idx.totalCost ?? 0;
      const dateIdx = idx.UsageDate ?? idx.BillingMonth ?? idx.Date ?? 1;
      const rgIdx = idx.ResourceGroupName ?? idx.ResourceGroup;
      const currencyIdx = idx.Currency;

      let currency = 'USD';
      const rows = [];

      for (const row of rawRows) {
        const date = parseAzureUsageDate(row[dateIdx]);
        const cost = Number(row[costIdx] || 0);
        if (currencyIdx != null && row[currencyIdx]) {
          currency = String(row[currencyIdx]);
        }

        rows.push({
          date,
          cost: Number(Number.isFinite(cost) ? cost.toFixed(4) : 0),
          resourceGroup:
            groupByResourceGroup && rgIdx != null
              ? String(row[rgIdx] || '').toUpperCase()
              : null
        });
      }

      logCostManagementEvent('daily_cost_query_completed', {
        resourceGroupCount: normalizedGroups.length,
        rowCount: rows.length,
        from,
        to,
        groupByResourceGroup
      });

      return { currency, rows };
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.response?.status);

      if (statusCode === 403) {
        throw new AppError(
          'Azure Cost Management access denied. Assign Cost Management Reader to the service principal on the subscription.',
          502
        );
      }

      if (!RETRYABLE_STATUS_CODES.has(statusCode)) {
        break;
      }

      if (attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }

  const message =
    lastError?.response?.data?.error?.message ||
    lastError?.message ||
    'Failed to query Azure daily cost data.';

  logCostManagementEvent('daily_cost_query_failed', {
    resourceGroupCount: normalizedGroups.length,
    from,
    to,
    message
  });

  throw new AppError(message, 502);
};

module.exports = {
  getResourceGroupCosts,
  getCachedResourceGroupCosts,
  queryCostForResourceGroup,
  queryDailyCostsForResourceGroups,
  normalizeResourceGroupName,
  COST_CACHE_TTL_MS
};
