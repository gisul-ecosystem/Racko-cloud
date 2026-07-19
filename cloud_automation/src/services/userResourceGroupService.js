const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { provisionResourceGroup } = require('../provisioners/azure/resourceGroupProvisioner');
const {
  buildPerUserResourceGroupName,
  isPerUserCosting
} = require('../utils/costingMode');
const { runWithConcurrency } = require('../utils/concurrency');
const {
  getBulkProvisionConcurrency,
  getResourceGroupBatchSize
} = require('../utils/provisionConcurrency');

const DEFAULT_CONCURRENCY = getBulkProvisionConcurrency();

const getStagingResourceGroups = async (requestId, client = db) => {
  const result = await client.query(
    `
      SELECT
        id,
        request_id,
        user_number,
        azure_resource_group_name,
        azure_resource_group_id,
        created_at
      FROM request_user_resource_groups
      WHERE request_id = $1
      ORDER BY user_number ASC
    `,
    [requestId]
  );

  return result.rows;
};

const getStagingResourceGroupForUserNumber = async (requestId, userNumber, client = db) => {
  const result = await client.query(
    `
      SELECT
        user_number,
        azure_resource_group_name,
        azure_resource_group_id
      FROM request_user_resource_groups
      WHERE request_id = $1
        AND user_number = $2
      LIMIT 1
    `,
    [requestId, userNumber]
  );

  return result.rows[0] || null;
};

const bulkInsertStagingResourceGroups = async (requestId, entries) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  const values = [];
  const params = [requestId];
  let paramIndex = 2;

  for (const entry of entries) {
    values.push(`($1, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
    params.push(
      entry.userNumber,
      entry.provisioned.resourceGroupName,
      entry.provisioned.resourceGroupId
    );
  }

  await db.query(
    `
      INSERT INTO request_user_resource_groups (
        request_id,
        user_number,
        azure_resource_group_name,
        azure_resource_group_id
      )
      VALUES ${values.join(', ')}
      ON CONFLICT (request_id, user_number)
      DO UPDATE SET
        azure_resource_group_name = EXCLUDED.azure_resource_group_name,
        azure_resource_group_id = EXCLUDED.azure_resource_group_id
    `,
    params
  );
};

const provisionPerUserResourceGroups = async ({
  requestId,
  accountCount,
  location,
  batchSize = getResourceGroupBatchSize()
}) => {
  const resolvedAccountCount = Number(accountCount);

  if (!Number.isInteger(resolvedAccountCount) || resolvedAccountCount <= 0) {
    throw new AppError('Request account count is invalid.', 400);
  }

  const existing = await getStagingResourceGroups(requestId);

  if (existing.length >= resolvedAccountCount) {
    return {
      rows: existing,
      completed: existing.length,
      remaining: 0,
      done: true,
      batchCreated: 0,
      failures: []
    };
  }

  const existingNumbers = new Set(existing.map((row) => Number(row.user_number)));
  const pendingUserNumbers = Array.from({ length: resolvedAccountCount }, (_, index) => index + 1).filter(
    (userNumber) => !existingNumbers.has(userNumber)
  );
  const batchUserNumbers = pendingUserNumbers.slice(0, batchSize);
  const provisionedEntries = [];
  const failures = [];

  await runWithConcurrency(
    batchUserNumbers,
    DEFAULT_CONCURRENCY,
    async (userNumber) => {
      const resourceGroupName = buildPerUserResourceGroupName(requestId, userNumber);

      try {
        const provisioned = await provisionResourceGroup({
          requestId,
          resourceGroupName,
          location
        });

        provisionedEntries.push({ userNumber, provisioned });
      } catch (error) {
        failures.push({
          userNumber,
          message: error?.message || 'Unable to create Azure resource group.'
        });
      }
    },
    { continueOnError: true }
  );

  if (provisionedEntries.length > 0) {
    await bulkInsertStagingResourceGroups(requestId, provisionedEntries);
  }

  const updated = await getStagingResourceGroups(requestId);
  const completed = updated.length;
  const remaining = Math.max(0, resolvedAccountCount - completed);

  if (batchUserNumbers.length > 0 && provisionedEntries.length === 0 && failures.length > 0) {
    throw new AppError(
      `Failed to create resource groups for users ${failures
        .slice(0, 3)
        .map((entry) => entry.userNumber)
        .join(', ')}${failures.length > 3 ? '...' : ''}: ${failures[0].message}`,
      502
    );
  }

  return {
    rows: updated,
    completed,
    remaining,
    done: remaining === 0,
    batchCreated: provisionedEntries.length,
    failures
  };
};

const getPerUserResourceGroupProgress = async (requestId, client = db) => {
  const result = await client.query(
    `
      SELECT account_count, costing_mode
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const request = result.rows[0];

  if (!request || !isPerUserCosting(request.costing_mode)) {
    return {
      required: false,
      ready: true,
      accountCount: 0,
      completed: 0,
      remaining: 0
    };
  }

  const accountCount = Number(request.account_count);

  if (!Number.isInteger(accountCount) || accountCount <= 0) {
    return {
      required: true,
      ready: false,
      accountCount: 0,
      completed: 0,
      remaining: 0
    };
  }

  const stagingRows = await getStagingResourceGroups(requestId, client);

  return {
    required: true,
    ready: stagingRows.length >= accountCount,
    accountCount,
    completed: stagingRows.length,
    remaining: Math.max(0, accountCount - stagingRows.length)
  };
};

const summarizePerUserResourceGroups = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  if (rows.length <= 3) {
    return rows.map((row) => row.azure_resource_group_name).join(', ');
  }

  return `${rows.length} per-user resource groups`;
};

const getResourceGroupNamesForCleanup = async (requestId, costingMode, sharedResourceGroupName) => {
  if (!isPerUserCosting(costingMode)) {
    return sharedResourceGroupName ? [sharedResourceGroupName] : [];
  }

  const result = await db.query(
    `
      SELECT azure_resource_group_name AS name
      FROM request_user_resource_groups
      WHERE request_id = $1
      UNION
      SELECT azure_resource_group_name AS name
      FROM azure_users
      WHERE request_id = $1
        AND azure_resource_group_name IS NOT NULL
    `,
    [requestId]
  );

  return [
    ...new Set(
      result.rows
        .map((row) => String(row.name || '').trim())
        .filter((name) => name.length > 0)
    )
  ];
};

const getResourceGroupNameForUser = async (requestId, userId) => {
  const result = await db.query(
    `
      SELECT
        r.costing_mode,
        r.azure_resource_group_name AS shared_resource_group_name,
        au.azure_resource_group_name AS user_resource_group_name
      FROM requests r
      LEFT JOIN azure_users au
        ON au.request_id = r.id
       AND au.id = $2
      WHERE r.id = $1
      LIMIT 1
    `,
    [requestId, userId]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  if (isPerUserCosting(row.costing_mode)) {
    return row.user_resource_group_name || null;
  }

  return row.shared_resource_group_name || null;
};

module.exports = {
  getStagingResourceGroups,
  getStagingResourceGroupForUserNumber,
  getPerUserResourceGroupProgress,
  provisionPerUserResourceGroups,
  summarizePerUserResourceGroups,
  getResourceGroupNamesForCleanup,
  getResourceGroupNameForUser
};
