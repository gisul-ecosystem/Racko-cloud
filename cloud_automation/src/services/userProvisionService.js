const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const {
  buildUserPayload,
  createGraphClient,
  createOrAdoptGraphUser,
  getVerifiedDomain,
  logAzureUserEvent,
  toGraphProvisionError
} = require('../provisioners/azure/userProvisioner');
const { runWithConcurrency } = require('../utils/concurrency');
const { evaluateUsageAccess } = require('./usageAccessEvaluator');
const { isPerUserCosting } = require('../utils/costingMode');
const { getStagingResourceGroupForUserNumber } = require('./userResourceGroupService');
const { provisionBudgetsForRequest } = require('./budgetProvisionService');

const STATUS_CREATED = 'Created';
const DEFAULT_CONCURRENCY = Math.max(1, Number(process.env.BULK_PROVISION_CONCURRENCY || 20));
const STATUS_BLOCKED = 'Blocked';

const getRequestByIdForUserProvisioning = async (client, requestId) => {
  const query = `
    SELECT
      id,
      account_count,
      status,
      expiry_date,
      enable_daily_usage,
      daily_limit_minutes,
      usage_schedule,
      enforce_in_azure,
      costing_mode
    FROM requests
    WHERE id = $1
    FOR UPDATE
  `;

  const result = await client.query(query, [requestId]);
  return result.rows[0] || null;
};

const getExistingUsersForRequest = async (requestId) => {
  const query = `
    SELECT request_id, azure_user_id, username, status
    FROM azure_users
    WHERE request_id = $1
    ORDER BY username ASC
  `;

  const result = await db.query(query, [requestId]);
  return result.rows;
};

const getInitialScheduleAccess = (request) => {
  if (!request?.enable_daily_usage) {
    return {
      allowed: true,
      status: STATUS_CREATED,
      blockedUntil: null,
      disableAzureAccount: false,
      reason: null,
      message: null
    };
  }

  const access = evaluateUsageAccess({
    request,
    user: {
      used_today_minutes: 0,
      blocked_until: null,
      last_reset_date: null
    },
    currentSessionMinutes: 0
  });

  if (access.allowed) {
    return {
      allowed: true,
      status: STATUS_CREATED,
      blockedUntil: null,
      disableAzureAccount: false,
      reason: access.reason,
      message: access.message
    };
  }

  return {
    allowed: false,
    status: STATUS_BLOCKED,
    blockedUntil: access.blockedUntil || null,
    disableAzureAccount: request.enforce_in_azure === true,
    reason: access.reason,
    message: access.message
  };
};

const insertAzureUsers = async (client, requestId, createdUsers) => {
  const insertQuery = `
    INSERT INTO azure_users (
      request_id,
      azure_user_id,
      username,
      temporary_password,
      status,
      blocked_until,
      user_number,
      azure_resource_group_name,
      azure_resource_group_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;

  for (const user of createdUsers) {
    await client.query(insertQuery, [
      requestId,
      user.azureUserId,
      user.username,
      user.temporaryPassword,
      user.status,
      user.blockedUntil,
      user.userNumber,
      user.resourceGroupName || null,
      user.resourceGroupId || null
    ]);
  }
};

const provisionUsersForRequest = async (requestId) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const request = await getRequestByIdForUserProvisioning(client, requestId);

    if (!request) {
      throw new AppError('Request not found.', 404);
    }

    const accountCount = Number(request.account_count);

    if (!Number.isInteger(accountCount) || accountCount <= 0) {
      throw new AppError('Request account count is invalid.', 400);
    }

    const existingUsers = await getExistingUsersForRequest(requestId);

    if (existingUsers.length === accountCount) {
      await client.query('COMMIT');

      logAzureUserEvent('info', 'azure_user_provision_reused_existing', {
        requestId,
        usersCreated: existingUsers.length
      });

      return {
        usersCreated: existingUsers.length
      };
    }

    if (existingUsers.length > 0 && existingUsers.length !== accountCount) {
      throw new AppError(
        'Partial Azure user provisioning exists for this request. Manual review is required.',
        409
      );
    }

    const { graphClient, subscriptionId } = createGraphClient();
    const verifiedDomain = await getVerifiedDomain(graphClient);

    const initialAccess = getInitialScheduleAccess(request);

    logAzureUserEvent('info', 'azure_user_provision_started', {
      requestId,
      subscriptionId,
      accountCount,
      verifiedDomain,
      scheduleAccessAllowed: initialAccess.allowed,
      scheduleAccessReason: initialAccess.reason,
      azureAccountDisabledAtCreation: initialAccess.disableAzureAccount
    });

    const createdUsers = [];
    let adoptedCount = 0;

    const userNumbers = Array.from({ length: accountCount }, (_, index) => index + 1);
    await runWithConcurrency(userNumbers, DEFAULT_CONCURRENCY, async (userNumber) => {
      const { username, temporaryPassword, payload } = buildUserPayload({
        requestId,
        userNumber,
        domain: verifiedDomain,
        accountEnabled: !initialAccess.disableAzureAccount
      });

      const { user: createdUser, adopted } = await createOrAdoptGraphUser(
        graphClient,
        { payload, temporaryPassword },
        requestId
      );

      if (adopted) {
        adoptedCount += 1;
      }

      let resourceGroupName = null;
      let resourceGroupId = null;

      if (isPerUserCosting(request.costing_mode)) {
        const stagedResourceGroup = await getStagingResourceGroupForUserNumber(
          requestId,
          userNumber,
          client
        );

        if (!stagedResourceGroup) {
          throw new AppError(
            `Per-user resource group is missing for user slot ${userNumber}. Create resource groups first.`,
            400
          );
        }

        resourceGroupName = stagedResourceGroup.azure_resource_group_name;
        resourceGroupId = stagedResourceGroup.azure_resource_group_id;
      }

      createdUsers.push({
        azureUserId: createdUser.id,
        username,
        temporaryPassword,
        status: initialAccess.status,
        blockedUntil: initialAccess.blockedUntil,
        userNumber,
        resourceGroupName,
        resourceGroupId
      });
    });

    await insertAzureUsers(client, requestId, createdUsers);

    await client.query('COMMIT');

    logAzureUserEvent('info', 'azure_user_provision_success', {
      requestId,
      subscriptionId,
      usersCreated: createdUsers.length,
      usersAdopted: adoptedCount
    });

    try {
      await provisionBudgetsForRequest(requestId);
    } catch (budgetError) {
      logAzureUserEvent('error', 'azure_user_budget_provision_failed', {
        requestId,
        message: budgetError?.message
      });
    }

    return {
      usersCreated: createdUsers.length
    };
  } catch (error) {
    await client.query('ROLLBACK');

    logAzureUserEvent('error', 'azure_user_provision_failed', {
      requestId,
      errorName: error?.name,
      errorCode: error?.code || error?.cause?.code,
      statusCode: error?.statusCode || error?.status,
      message: error?.message,
      cause: error?.cause?.message || null
    });

    throw toGraphProvisionError(error);
  } finally {
    client.release();
  }
};

const getUsersForRequest = async (requestId) => {
  const query = `
    SELECT
      u.id,
      u.azure_user_id,
      u.username,
      u.status,
      u.created_at,
      u.user_number,
      u.azure_resource_group_name,
      u.azure_resource_group_id,
      r.expiry_date,
      r.costing_mode
    FROM azure_users u
    LEFT JOIN requests r
      ON r.id = u.request_id
    WHERE u.request_id = $1
    ORDER BY u.created_at DESC
  `;

  const result = await db.query(query, [requestId]);

  return result.rows.map((row) => ({
    id: row.id,
    azureUserId: row.azure_user_id,
    username: row.username,
    status: row.status,
    createdAt: row.created_at,
    expiryDate: row.expiry_date,
    userNumber: row.user_number,
    resourceGroup: row.azure_resource_group_name,
    resourceGroupId: row.azure_resource_group_id,
    costingMode: row.costing_mode
  }));
};

module.exports = {
  getUsersForRequest,
  provisionUsersForRequest
};
