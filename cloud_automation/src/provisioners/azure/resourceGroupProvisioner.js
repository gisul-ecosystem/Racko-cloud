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

const detailsMessage = (error) => {
  try {
    const body = error?.response?.parsedBody || error?.body;
    return body?.error?.message || null;
  } catch {
    return null;
  }
};

const getAzureErrorCode = (error) => {
  const details = extractAzureErrorDetails(error);
  return String(
    details.errorCode ||
      error?.code ||
      error?.details?.error?.code ||
      error?.body?.error?.code ||
      ''
  );
};

const isExistingResourceGroupConflict = (error) => {
  const statusCode = Number(error?.statusCode || error?.status);
  const errorCode = getAzureErrorCode(error);
  const message = String(error?.message || detailsMessage(error) || '');

  return (
    errorCode === 'InvalidResourceGroupLocation' ||
    errorCode === 'ResourceGroupAlreadyExists' ||
    (statusCode === 409 && /already exists/i.test(message))
  );
};

const getExistingResourceGroup = async (resourceGroupsClient, resourceGroupName) => {
  try {
    return await resourceGroupsClient.get(resourceGroupName);
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status);
    if (statusCode === 404) {
      return null;
    }
    throw error;
  }
};

const toProvisionResult = ({ response, resourceGroupName, subscriptionId, adopted = false }) => ({
  resourceGroupId: response?.id || null,
  resourceGroupName: response?.name || resourceGroupName,
  subscriptionId,
  adopted,
  location: response?.location || null
});

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
  const errorCode = getAzureErrorCode(error);
  const azureMessage = String(error?.message || detailsMessage(error) || '').trim();

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

  if (errorCode === 'InvalidResourceGroupLocation') {
    return new AppError(
      azureMessage ||
        `Resource group already exists in a different region than '${location}'.`,
      409
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
    const resourceGroupsClient = resourceClient.resourceGroups;

    // Idempotent: if Azure already has this RG (any region), adopt it into staging.
    const existing = await getExistingResourceGroup(resourceGroupsClient, resourceGroupName);
    if (existing) {
      logAzureEvent(LOG_SERVICE, 'info', 'azure_rg_adopted_existing', {
        requestId,
        subscriptionId,
        resourceGroupName: existing.name || resourceGroupName,
        resourceGroupId: existing.id || null,
        existingLocation: existing.location || null,
        requestedLocation: location,
        durationMs: Date.now() - startedAt
      });

      return toProvisionResult({
        response: existing,
        resourceGroupName,
        subscriptionId,
        adopted: true
      });
    }

    try {
      const response = await createResourceGroupWithRetry(
        resourceGroupsClient,
        resourceGroupName,
        location
      );

      logAzureEvent(LOG_SERVICE, 'info', 'azure_rg_create_success', {
        requestId,
        subscriptionId,
        resourceGroupName: response?.name || resourceGroupName,
        resourceGroupId: response?.id || null,
        location,
        durationMs: Date.now() - startedAt
      });

      return toProvisionResult({
        response,
        resourceGroupName,
        subscriptionId,
        adopted: false
      });
    } catch (createError) {
      if (isExistingResourceGroupConflict(createError)) {
        const adopted = await getExistingResourceGroup(resourceGroupsClient, resourceGroupName);
        if (adopted) {
          logAzureEvent(LOG_SERVICE, 'info', 'azure_rg_adopted_after_conflict', {
            requestId,
            subscriptionId,
            resourceGroupName: adopted.name || resourceGroupName,
            resourceGroupId: adopted.id || null,
            existingLocation: adopted.location || null,
            requestedLocation: location,
            durationMs: Date.now() - startedAt,
            ...extractAzureErrorDetails(createError)
          });

          return toProvisionResult({
            response: adopted,
            resourceGroupName,
            subscriptionId,
            adopted: true
          });
        }
      }

      throw createError;
    }
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
