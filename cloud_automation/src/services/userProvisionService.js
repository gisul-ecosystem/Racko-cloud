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
  getProvisionStepTimeBudgetMs,
  getMaxProvisionAccountCount
} = require('../utils/provisionConcurrency');
const { evaluateUsageAccess } = require('./usageAccessEvaluator');
const { loadUsageWindowsByRequest } = require('./usageWindowAccessService');
const { evaluateCombinedLabAccess } = require('../utils/labAccess');
const { enforceWindowForRequest } = require('../scheduler/windowEnforcementScheduler');
const { isPerUserCosting } = require('../utils/costingMode');
const { getStagingResourceGroups, getPerUserResourceGroupProgress, provisionPerUserResourceGroups } = require('./userResourceGroupService');
const { provisionServiceResourcesForRequest } = require('./serviceResourceProvisionService');
const { provisionRolesForRequest, getRoleProvisionStatus } = require('./roleProvisionService');
const { provisionBudgetsForRequest } = require('./budgetProvisionService');
const { assignLicenseToUser } = require('./microsoftLicenseService');
const { resolveUsageLocation } = require('../utils/azureUsageLocation');

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
      expires_at,
      starts_at,
      enable_daily_usage,
      daily_limit_minutes,
      usage_schedule,
      enforce_in_azure,
      costing_mode,
      location,
      microsoft_license_sku_id
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

const getInitialScheduleAccess = (request, usageWindows = []) => {
  if (Array.isArray(usageWindows) && usageWindows.length > 0) {
    const access = evaluateCombinedLabAccess(request, usageWindows);
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
      blockedUntil: null,
      disableAzureAccount: true,
      reason: access.reason,
      message: access.message
    };
  }

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
        expires_at,
        starts_at,
        enable_daily_usage,
        daily_limit_minutes,
        usage_schedule,
        enforce_in_azure,
        costing_mode,
        location,
        microsoft_license_sku_id
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
      const budgetResult = await provisionBudgetsForRequest(requestId);
      if (budgetResult && budgetResult.complete === false) {
        return {
          usersCreated: existingUsers.length,
          accountCount,
          complete: false,
          remaining: Math.max(1, Number(budgetResult.remaining) || 0),
          budgetsRemaining: budgetResult.remaining
        };
      }
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
  const usageWindows =
    (await loadUsageWindowsByRequest([requestId])).get(Number(requestId)) || [];
  const initialAccess = getInitialScheduleAccess(request, usageWindows);
  const usageLocation = resolveUsageLocation(request.location);

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
    usageLocation,
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
          accountEnabled: !initialAccess.disableAzureAccount,
          usageLocation
        });

        const { user: createdUser, adopted } = await createOrAdoptGraphUser(
          graphClient,
          { payload, temporaryPassword },
          requestId
        );

        if (adopted) {
          adoptedCount += 1;
        }

        const licenseSkuId = String(request.microsoft_license_sku_id || '').trim();
        if (licenseSkuId) {
          try {
            await assignLicenseToUser(graphClient, createdUser.id, licenseSkuId, usageLocation);
            logAzureUserEvent('info', 'azure_user_license_assigned', {
              requestId,
              azureUserId: createdUser.id,
              username,
              skuId: licenseSkuId,
              usageLocation
            });
          } catch (licenseError) {
            logAzureUserEvent('error', 'azure_user_license_assign_failed', {
              requestId,
              azureUserId: createdUser.id,
              username,
              skuId: licenseSkuId,
              usageLocation,
              message: licenseError?.message || null,
              statusCode: licenseError?.statusCode || licenseError?.status || null
            });
            throw licenseError;
          }
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
      const budgetResult = await provisionBudgetsForRequest(requestId);
      if (budgetResult && budgetResult.complete === false) {
        return {
          usersCreated: totalUsers,
          accountCount,
          complete: false,
          remaining: Math.max(1, Number(budgetResult.remaining) || 0),
          budgetsRemaining: budgetResult.remaining
        };
      }
    } catch (budgetError) {
      logAzureUserEvent('error', 'azure_user_budget_provision_failed', {
        requestId,
        message: budgetError?.message
      });
    }
  }

  if (usageWindows.length > 0 && totalUsers > 0) {
    try {
      await enforceWindowForRequest({
        id: requestId,
        starts_at: request.starts_at,
        expiry_date: request.expiry_date,
        expires_at: request.expires_at
      });
    } catch (enforceError) {
      logAzureUserEvent('warn', 'azure_user_window_enforcement_failed', {
        requestId,
        message: enforceError?.message || null
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

const createSingleUserForRequest = async (requestId, userNumber, request) => {
  const { graphClient } = createGraphClient();
  const verifiedDomain = await getVerifiedDomain(graphClient);
  const usageWindows =
    (await loadUsageWindowsByRequest([requestId])).get(Number(requestId)) || [];
  const initialAccess = getInitialScheduleAccess(request, usageWindows);
  const usageLocation = resolveUsageLocation(request.location);

  let resourceGroupName = null;
  let resourceGroupId = null;

  if (isPerUserCosting(request.costing_mode)) {
    const stagingRows = await getStagingResourceGroups(requestId);
    const stagedResourceGroup = stagingRows.find(
      (row) => Number(row.user_number) === userNumber
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

  const { username, temporaryPassword, payload } = buildUserPayload({
    requestId,
    userNumber,
    domain: verifiedDomain,
    accountEnabled: !initialAccess.disableAzureAccount,
    usageLocation
  });

  const { user: createdUser, adopted } = await createOrAdoptGraphUser(
    graphClient,
    { payload, temporaryPassword },
    requestId
  );

  const licenseSkuId = String(request.microsoft_license_sku_id || '').trim();
  if (licenseSkuId) {
    await assignLicenseToUser(graphClient, createdUser.id, licenseSkuId, usageLocation);
  }

  const userRecord = {
    azureUserId: createdUser.id,
    username,
    temporaryPassword,
    status: initialAccess.status,
    blockedUntil: initialAccess.blockedUntil,
    userNumber,
    resourceGroupName,
    resourceGroupId
  };

  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await insertAzureUsers(client, requestId, [userRecord]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const inserted = await db.query(
    `
      SELECT id, azure_user_id, username, status, created_at, user_number, azure_resource_group_name
      FROM azure_users
      WHERE request_id = $1
        AND user_number = $2
      LIMIT 1
    `,
    [requestId, userNumber]
  );

  const row = inserted.rows[0];

  return {
    id: row.id,
    azureUserId: row.azure_user_id,
    username: row.username,
    temporaryPassword,
    status: row.status,
    createdAt: row.created_at,
    userNumber: row.user_number,
    resourceGroup: row.azure_resource_group_name,
    resourceGroupName: row.azure_resource_group_name,
    resourceGroupId,
    adopted: adopted === true
  };
};

const addUserToRequest = async (requestId) => {
  const normalizedRequestId = Number(requestId);
  if (!Number.isInteger(normalizedRequestId) || normalizedRequestId <= 0) {
    throw new AppError('Request id must be a positive integer.', 400);
  }

  const client = await db.connect();
  let request;
  let nextUserNumber;
  let newAccountCount;

  try {
    await client.query('BEGIN');
    request = await getRequestByIdForUserProvisioning(client, normalizedRequestId);

    if (!request) {
      throw new AppError('Request not found.', 404);
    }

    const existingUsersResult = await client.query(
      `
        SELECT user_number
        FROM azure_users
        WHERE request_id = $1
          AND COALESCE(is_deleted, false) = false
      `,
      [normalizedRequestId]
    );

    const maxUserNumber = existingUsersResult.rows.reduce((max, row) => {
      const userNumber = Number(row.user_number);
      return Number.isInteger(userNumber) && userNumber > max ? userNumber : max;
    }, 0);

    nextUserNumber = maxUserNumber + 1;
    newAccountCount = Math.max(Number(request.account_count) || 0, nextUserNumber);

    const maxAllowed = getMaxProvisionAccountCount();
    if (newAccountCount > maxAllowed) {
      throw new AppError(
        `Cannot add user: maximum account count (${maxAllowed}) would be exceeded.`,
        400
      );
    }

    if (Number(request.account_count) !== newAccountCount) {
      await client.query(
        `
          UPDATE requests
          SET account_count = $1
          WHERE id = $2
        `,
        [newAccountCount, normalizedRequestId]
      );
      request.account_count = newAccountCount;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  logAzureUserEvent('info', 'azure_user_add_started', {
    requestId: normalizedRequestId,
    userNumber: nextUserNumber,
    accountCount: newAccountCount,
    costingMode: request.costing_mode
  });

  if (isPerUserCosting(request.costing_mode)) {
    let rgProgress;
    let rgIterations = 0;

    do {
      rgProgress = await provisionPerUserResourceGroups({
        requestId: normalizedRequestId,
        accountCount: newAccountCount,
        location: request.location,
        batchSize: 1
      });
      rgIterations += 1;
      if (rgIterations > 50) {
        break;
      }
    } while (!rgProgress.done && rgProgress.batchCreated > 0);

    if (!rgProgress?.done) {
      throw new AppError('Failed to provision resource group for the new user.', 502);
    }

    let serviceComplete = false;
    for (let attempt = 0; attempt < 30 && !serviceComplete; attempt += 1) {
      const serviceResult = await provisionServiceResourcesForRequest(normalizedRequestId);
      serviceComplete = serviceResult.complete !== false;
    }
  }

  const createdUser = await createSingleUserForRequest(
    normalizedRequestId,
    nextUserNumber,
    request
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await provisionRolesForRequest(normalizedRequestId);
    const roleStatus = await getRoleProvisionStatus(normalizedRequestId);
    if (roleStatus.complete) {
      break;
    }
  }

  try {
    await provisionBudgetsForRequest(normalizedRequestId);
  } catch (budgetError) {
    logAzureUserEvent('warn', 'azure_user_add_budget_provision_failed', {
      requestId: normalizedRequestId,
      message: budgetError?.message || null
    });
  }

  const usageWindows =
    (await loadUsageWindowsByRequest([normalizedRequestId])).get(Number(normalizedRequestId)) ||
    [];

  if (usageWindows.length > 0) {
    try {
      await enforceWindowForRequest({
        id: normalizedRequestId,
        starts_at: request.starts_at,
        expiry_date: request.expiry_date,
        expires_at: request.expires_at
      });
    } catch (enforceError) {
      logAzureUserEvent('warn', 'azure_user_add_window_enforcement_failed', {
        requestId: normalizedRequestId,
        message: enforceError?.message || null
      });
    }
  }

  const [existingUsers, accountCountResult] = await Promise.all([
    getExistingUsersForRequest(normalizedRequestId),
    db.query(`SELECT account_count FROM requests WHERE id = $1`, [normalizedRequestId])
  ]);

  logAzureUserEvent('info', 'azure_user_add_success', {
    requestId: normalizedRequestId,
    userId: createdUser.id,
    userNumber: nextUserNumber,
    userCount: existingUsers.length,
    accountCount: Number(accountCountResult.rows[0]?.account_count || newAccountCount)
  });

  return {
    user: createdUser,
    userCount: existingUsers.length,
    accountCount: Number(accountCountResult.rows[0]?.account_count || newAccountCount),
    userNumber: nextUserNumber
  };
};

module.exports = {
  getUsersForRequest,
  provisionUsersForRequest,
  addUserToRequest
};
