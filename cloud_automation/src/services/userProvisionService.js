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
const {
  getBulkProvisionConcurrency,
  getUserProvisionBatchSize,
  getProvisionStepTimeBudgetMs
} = require('../utils/provisionConcurrency');
const { evaluateUsageAccess } = require('./usageAccessEvaluator');
const { isPerUserCosting } = require('../utils/costingMode');
const { getStagingResourceGroups, getPerUserResourceGroupProgress } = require('./userResourceGroupService');
const { provisionBudgetsForRequest } = require('./budgetProvisionService');

const STATUS_CREATED = 'Created';
const DEFAULT_CONCURRENCY = getBulkProvisionConcurrency();
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
    SELECT request_id, azure_user_id, username, status, user_number
    FROM azure_users
    WHERE request_id = $1
    ORDER BY user_number ASC NULLS LAST, username ASC
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
  if (!createdUsers.length) {
    return;
  }

  const values = [];
  const params = [requestId];
  let paramIndex = 2;

  for (const user of createdUsers) {
    values.push(
      `($1, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    params.push(
      user.azureUserId,
      user.username,
      user.temporaryPassword,
      user.status,
      user.blockedUntil,
      user.userNumber,
      user.resourceGroupName || null,
      user.resourceGroupId || null
    );
  }

  await client.query(
    `
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
      VALUES ${values.join(', ')}
    `,
    params
  );
};

const provisionUsersForRequest = async (requestId) => {
  const requestResult = await db.query(
    `
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
    `,
    [requestId]
  );

  const request = requestResult.rows[0];

  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  const perUserProgress = await getPerUserResourceGroupProgress(requestId);

  if (isPerUserCosting(request.costing_mode)) {
    const existingUsers = await getExistingUsersForRequest(requestId);

    if (!perUserProgress.ready) {
      return {
        usersCreated: existingUsers.length,
        accountCount: perUserProgress.accountCount,
        complete: false,
        remaining: perUserProgress.remaining
      };
    }
  }

  const accountCount = Number(request.account_count);

  if (!Number.isInteger(accountCount) || accountCount <= 0) {
    throw new AppError('Request account count is invalid.', 400);
  }

  const existingUsers = await getExistingUsersForRequest(requestId);

  if (existingUsers.length >= accountCount) {
    logAzureUserEvent('info', 'azure_user_provision_reused_existing', {
      requestId,
      usersCreated: existingUsers.length
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
      usersCreated: existingUsers.length,
      accountCount,
      complete: true,
      remaining: 0
    };
  }

  const existingUserNumbers = new Set(
    existingUsers
      .map((user) => Number(user.user_number))
      .filter((userNumber) => Number.isInteger(userNumber) && userNumber > 0)
  );
  const pendingUserNumbers = Array.from({ length: accountCount }, (_, index) => index + 1).filter(
    (userNumber) => !existingUserNumbers.has(userNumber)
  );

  const { graphClient, subscriptionId } = createGraphClient();
  const verifiedDomain = await getVerifiedDomain(graphClient);
  const initialAccess = getInitialScheduleAccess(request);

  const stagingResourceGroupByUserNumber = new Map();
  if (isPerUserCosting(request.costing_mode)) {
    const stagingRows = await getStagingResourceGroups(requestId);
    for (const row of stagingRows) {
      stagingResourceGroupByUserNumber.set(Number(row.user_number), row);
    }
  }

  logAzureUserEvent('info', 'azure_user_provision_started', {
    requestId,
    subscriptionId,
    accountCount,
    existingUsers: existingUsers.length,
    pendingUsers: pendingUserNumbers.length,
    verifiedDomain,
    scheduleAccessAllowed: initialAccess.allowed,
    scheduleAccessReason: initialAccess.reason,
    azureAccountDisabledAtCreation: initialAccess.disableAzureAccount
  });

  const startedAt = Date.now();
  const timeBudgetMs = getProvisionStepTimeBudgetMs();
  const batchSize = getUserProvisionBatchSize();
  let adoptedCount = 0;
  let batchCreated = 0;

  // With no time budget: one HTTP request = one user batch (proxy-safe for large labs).
  let processedBatch = false;
  while (
    pendingUserNumbers.length > 0 &&
    (timeBudgetMs === 0 ? !processedBatch : Date.now() - startedAt < timeBudgetMs)
  ) {
    const batchUserNumbers = pendingUserNumbers.splice(0, batchSize);
    const createdUsers = [];

    try {
      await runWithConcurrency(batchUserNumbers, DEFAULT_CONCURRENCY, async (userNumber) => {
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
          const stagedResourceGroup = stagingResourceGroupByUserNumber.get(userNumber);

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
    } catch (error) {
      logAzureUserEvent('error', 'azure_user_provision_failed', {
        requestId,
        errorName: error?.name,
        errorCode: error?.code || error?.cause?.code,
        statusCode: error?.statusCode || error?.status,
        message: error?.message,
        cause: error?.cause?.message || null
      });

      throw toGraphProvisionError(error);
    }

    if (createdUsers.length > 0) {
      const client = await db.connect();

      try {
        await client.query('BEGIN');
        await insertAzureUsers(client, requestId, createdUsers);
        await client.query('COMMIT');
        batchCreated += createdUsers.length;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    processedBatch = true;
  }

  const totalUsers = (await getExistingUsersForRequest(requestId)).length;
  const remaining = Math.max(0, accountCount - totalUsers);
  const complete = remaining === 0;

  logAzureUserEvent(complete ? 'info' : 'info', complete ? 'azure_user_provision_success' : 'azure_user_provision_partial', {
    requestId,
    subscriptionId,
    usersCreated: totalUsers,
    usersAdopted: adoptedCount,
    batchCreated,
    remaining
  });

  if (complete) {
    try {
      await provisionBudgetsForRequest(requestId);
    } catch (budgetError) {
      logAzureUserEvent('error', 'azure_user_budget_provision_failed', {
        requestId,
        message: budgetError?.message
      });
    }
  }

  return {
    usersCreated: totalUsers,
    accountCount,
    complete,
    remaining
  };
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
