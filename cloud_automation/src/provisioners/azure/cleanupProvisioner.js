const { AuthorizationManagementClient } = require('@azure/arm-authorization');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { createGraphClient } = require('./userProvisioner');
const { createAzureCredential, validateAzureEnv } = require('../../config/azure');
const AppError = require('../../utils/AppError');

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logCleanupProvisionEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'cleanup-provisioner',
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

const isRetryableError = (error) => {
  const statusCode = Number(error?.statusCode || error?.status);
  const errorCode = String(error?.code || '').toUpperCase();

  return (
    RETRYABLE_STATUS_CODES.has(statusCode) ||
    ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'REQUESTTIMEOUT'].includes(errorCode)
  );
};

const getRetryDelayMs = (error, attempt) => {
  const headers = error?.response?.headers || error?.headers || {};
  const retryAfterHeader =
    (typeof headers.get === 'function' ? headers.get('retry-after') : null) ||
    headers['retry-after'] ||
    headers['Retry-After'];
  const retryAfterSeconds = Number(retryAfterHeader);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 60_000);
  }

  const statusCode = Number(error?.statusCode || error?.status);
  if (statusCode === 429) {
    return Math.min(1000 * 2 ** (attempt - 1), 30_000);
  }

  return Math.min(400 * 2 ** (attempt - 1), 15_000);
};

const createCleanupClients = () => {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);

  return {
    authorizationClient: new AuthorizationManagementClient(credential, azureConfig.subscriptionId),
    resourceClient: new ResourceManagementClient(credential, azureConfig.subscriptionId),
    graphClient: createGraphClient().graphClient,
    subscriptionId: azureConfig.subscriptionId
  };
};

const deleteRoleAssignmentWithRetry = async (
  authorizationClient,
  scope,
  assignmentId,
  requestId
) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await authorizationClient.roleAssignments.delete(scope, assignmentId);
      return true;
    } catch (error) {
      lastError = error;

      const statusCode = Number(error?.statusCode || error?.status);
      if (statusCode === 404) {
        return false;
      }

      if (attempt === MAX_ATTEMPTS || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = getRetryDelayMs(error, attempt);

      logCleanupProvisionEvent('info', 'cleanup_rbac_delete_retry', {
        requestId,
        scope,
        assignmentId,
        attempt,
        nextDelayMs: delayMs,
        errorName: error?.name,
        errorCode: error?.code,
        statusCode: error?.statusCode || error?.status,
        message: error?.message
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
};

const disableAzureUserWithRetry = async (graphClient, azureUserId, requestId) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await graphClient.api(`/users/${azureUserId}`).patch({ accountEnabled: false });
      return true;
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.statusCode || error?.status);
      if (statusCode === 404) {
        return false;
      }

      if (attempt === MAX_ATTEMPTS || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = getRetryDelayMs(error, attempt);

      logCleanupProvisionEvent('info', 'cleanup_user_disable_retry', {
        requestId,
        azureUserId,
        attempt,
        nextDelayMs: delayMs,
        errorName: error?.name,
        errorCode: error?.code,
        statusCode: error?.statusCode || error?.status,
        message: error?.message
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
};

const deleteResourceGroupWithRetry = async (resourceClient, resourceGroupName, requestId) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await resourceClient.resourceGroups.beginDeleteAndWait(resourceGroupName);
      return true;
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.statusCode || error?.status);
      if (statusCode === 404) {
        return false;
      }

      if (attempt === MAX_ATTEMPTS || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = getRetryDelayMs(error, attempt);

      logCleanupProvisionEvent('info', 'cleanup_rg_delete_retry', {
        requestId,
        resourceGroupName,
        attempt,
        nextDelayMs: delayMs,
        errorName: error?.name,
        errorCode: error?.code,
        statusCode: error?.statusCode || error?.status,
        message: error?.message
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
};

const startResourceGroupDeletion = async (resourceClient, resourceGroupName, requestId) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await resourceClient.resourceGroups.beginDelete(resourceGroupName);
      logCleanupProvisionEvent('info', 'cleanup_rg_delete_started', {
        requestId,
        resourceGroupName,
        attempt
      });
      return true;
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.statusCode || error?.status);
      if (statusCode === 404) {
        return false;
      }

      if (attempt === MAX_ATTEMPTS || !isRetryableError(error)) {
        logCleanupProvisionEvent('error', 'cleanup_rg_delete_start_failed', {
          requestId,
          resourceGroupName,
          attempt,
          message: error?.message,
          statusCode
        });
        return false;
      }

      const delayMs = getRetryDelayMs(error, attempt);
      logCleanupProvisionEvent('info', 'cleanup_rg_delete_start_retry', {
        requestId,
        resourceGroupName,
        attempt,
        nextDelayMs: delayMs,
        statusCode,
        message: error?.message
      });
      await sleep(delayMs);
    }
  }

  logCleanupProvisionEvent('error', 'cleanup_rg_delete_start_failed', {
    requestId,
    resourceGroupName,
    message: lastError?.message
  });
  return false;
};

module.exports = {
  createCleanupClients,
  deleteResourceGroupWithRetry,
  startResourceGroupDeletion,
  deleteRoleAssignmentWithRetry,
  disableAzureUserWithRetry,
  logCleanupProvisionEvent
};
