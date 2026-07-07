const { ResourceManagementClient } = require('@azure/arm-resources');
const { ensureAzureManagementAccess, getAzureContext } = require('../../config/azure');
const AppError = require('../../utils/AppError');
const {
  buildAzureNetworkErrorMessage,
  extractAzureErrorDetails,
  isAzureNetworkError,
  logAzureEvent
} = require('../../utils/azureLogger');

const LOG_SERVICE = 'azure-resource-group-provisioner';
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error) => {
  const statusCode = Number(error?.statusCode || error?.status);
  const errorCode = String(error?.code || '').toUpperCase();

  return (
    RETRYABLE_STATUS_CODES.has(statusCode) ||
    ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'REQUESTTIMEOUT'].includes(errorCode)
  );
};

const createResourceGroupWithRetry = async (resourceGroupsClient, resourceGroupName, location) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await resourceGroupsClient.createOrUpdate(resourceGroupName, {
        location
      });
    } catch (error) {
      lastError = error;

      if (attempt === MAX_ATTEMPTS || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = 500 * 2 ** (attempt - 1);

      logAzureEvent(LOG_SERVICE, 'info', 'azure_rg_create_retry', {
        resourceGroupName,
        location,
        attempt,
        nextDelayMs: delayMs,
        ...extractAzureErrorDetails(error)
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
};

const mapProvisionerError = (error, location) => {
  if (error instanceof AppError) {
    return error;
  }

  if (isAzureNetworkError(error)) {
    return new AppError(buildAzureNetworkErrorMessage(), 503);
  }

  const statusCode = Number(error?.statusCode || error?.status);
  const errorCode = String(error?.code || '');
  const azureMessage = String(error?.message || '').trim();

  if (statusCode === 401 || statusCode === 403) {
    return new AppError('Azure authentication failed or access was denied.', 403);
  }

  if (errorCode === 'LocationNotAvailableForResourceGroup') {
    return new AppError(
      azureMessage ||
        `Region '${location}' cannot be used for resource groups. Choose a production Azure region.`,
      400
    );
  }

  if (statusCode === 400 && azureMessage) {
    return new AppError(azureMessage, 400);
  }

  return new AppError(azureMessage || 'Unable to create Azure resource group.', 502);
};

const provisionResourceGroup = async ({ requestId, resourceGroupName, location }) => {
  const startedAt = Date.now();

  logAzureEvent(LOG_SERVICE, 'info', 'azure_rg_create_started', {
    requestId,
    resourceGroupName,
    location
  });

  try {
    const { credential, subscriptionId } = getAzureContext();
    const resourceClient = new ResourceManagementClient(credential, subscriptionId);

    const response = await createResourceGroupWithRetry(
      resourceClient.resourceGroups,
      resourceGroupName,
      location
    );

    const createdResourceGroupName = response?.name || resourceGroupName;
    const createdResourceGroupId = response?.id || null;

    logAzureEvent(LOG_SERVICE, 'info', 'azure_rg_create_success', {
      requestId,
      subscriptionId,
      resourceGroupName: createdResourceGroupName,
      resourceGroupId: createdResourceGroupId,
      location,
      durationMs: Date.now() - startedAt
    });

    return {
      resourceGroupId: createdResourceGroupId,
      resourceGroupName: createdResourceGroupName,
      subscriptionId
    };
  } catch (error) {
    logAzureEvent(LOG_SERVICE, 'error', 'azure_rg_create_failed', {
      requestId,
      resourceGroupName,
      location,
      durationMs: Date.now() - startedAt,
      ...extractAzureErrorDetails(error)
    });

    throw mapProvisionerError(error, location);
  }
};

const preflightAzureManagementAccess = async ({ requestId } = {}) => {
  const startedAt = Date.now();

  logAzureEvent(LOG_SERVICE, 'info', 'azure_rg_preflight_started', { requestId });

  try {
    const { subscriptionId } = await ensureAzureManagementAccess();

    logAzureEvent(LOG_SERVICE, 'info', 'azure_rg_preflight_success', {
      requestId,
      subscriptionId,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    logAzureEvent(LOG_SERVICE, 'error', 'azure_rg_preflight_failed', {
      requestId,
      durationMs: Date.now() - startedAt,
      ...extractAzureErrorDetails(error)
    });

    throw mapProvisionerError(error);
  }
};

module.exports = {
  preflightAzureManagementAccess,
  provisionResourceGroup
};
