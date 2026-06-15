const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { provisionResourceGroup } = require('../provisioners/azure/resourceGroupProvisioner');
const {
  buildPerUserResourceGroupName,
  isPerUserCosting
} = require('../utils/costingMode');
const { runWithConcurrency } = require('../utils/concurrency');

const DEFAULT_CONCURRENCY = Math.max(1, Number(process.env.BULK_PROVISION_CONCURRENCY || 20));

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

const insertStagingResourceGroup = async (client, requestId, userNumber, resourceGroup) => {
  await client.query(
    `
      INSERT INTO request_user_resource_groups (
        request_id,
        user_number,
        azure_resource_group_name,
        azure_resource_group_id
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (request_id, user_number)
      DO UPDATE SET
        azure_resource_group_name = EXCLUDED.azure_resource_group_name,
        azure_resource_group_id = EXCLUDED.azure_resource_group_id
    `,
    [
      requestId,
      userNumber,
      resourceGroup.resourceGroupName,
      resourceGroup.resourceGroupId
    ]
  );
};

const provisionPerUserResourceGroups = async ({ requestId, accountCount, location, client }) => {
  const resolvedAccountCount = Number(accountCount);

  if (!Number.isInteger(resolvedAccountCount) || resolvedAccountCount <= 0) {
    throw new AppError('Request account count is invalid.', 400);
  }

  const existing = await getStagingResourceGroups(requestId, client);

  if (existing.length >= resolvedAccountCount) {
    return existing;
  }

  const existingNumbers = new Set(existing.map((row) => Number(row.user_number)));
  const userNumbers = Array.from({ length: resolvedAccountCount }, (_, index) => index + 1).filter(
    (userNumber) => !existingNumbers.has(userNumber)
  );

  await runWithConcurrency(userNumbers, DEFAULT_CONCURRENCY, async (userNumber) => {
    const resourceGroupName = buildPerUserResourceGroupName(requestId, userNumber);
    const provisioned = await provisionResourceGroup({
      requestId,
      resourceGroupName,
      location
    });

    await insertStagingResourceGroup(client, requestId, userNumber, provisioned);
  });

  return getStagingResourceGroups(requestId, client);
};

const summarizePerUserResourceGroups = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows.map((row) => row.azure_resource_group_name).join(', ');
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
  provisionPerUserResourceGroups,
  summarizePerUserResourceGroups,
  getResourceGroupNamesForCleanup,
  getResourceGroupNameForUser
};
