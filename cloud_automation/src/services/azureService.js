const { ResourceManagementClient } = require('@azure/arm-resources');
const { ensureAzureManagementAccess } = require('../config/azure');
const AppError = require('../utils/AppError');
const {
  buildAzureNetworkErrorMessage,
  extractAzureErrorDetails,
  isAzureNetworkError,
  logAzureEvent,
  summarizeAzureEnv
} = require('../utils/azureLogger');

const LOG_SERVICE = 'azure-auth';

const getAzureErrorStatus = (error) => {
  const statusCode = error?.statusCode || error?.status || error?.code;

  if (statusCode === 401 || statusCode === 403 || statusCode === '401' || statusCode === '403') {
    return 403;
  }

  return 500;
};

const testAzureConnection = async () => {
  const startedAt = Date.now();

  logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_test_started', {
    ...summarizeAzureEnv()
  });

  try {
    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_token_request_started', {
      scope: 'https://management.azure.com/.default'
    });

    const { credential, subscriptionId } = await ensureAzureManagementAccess();

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_token_request_success', {
      subscriptionId
    });

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_arm_client_init_started', {
      subscriptionId
    });

    const resourceClient = new ResourceManagementClient(credential, subscriptionId);

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_resource_groups_list_started', {
      subscriptionId
    });

    let resourceGroupCount = 0;

    for await (const _resourceGroup of resourceClient.resourceGroups.list()) {
      resourceGroupCount += 1;
    }

    const durationMs = Date.now() - startedAt;

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_test_success', {
      subscriptionId,
      resourceGroupCount,
      durationMs
    });

    return {
      authenticated: true,
      subscriptionId,
      resourceGroupCount
    };
  } catch (error) {
    const statusCode = getAzureErrorStatus(error);
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID?.trim();
    const durationMs = Date.now() - startedAt;

    logAzureEvent(LOG_SERVICE, 'error', 'azure_auth_test_failed', {
      subscriptionId,
      statusCode,
      durationMs,
      ...summarizeAzureEnv(),
      ...extractAzureErrorDetails(error)
    });

    if (error instanceof AppError) {
      throw error;
    }

    if (isAzureNetworkError(error)) {
      throw new AppError(buildAzureNetworkErrorMessage(), 503);
    }

    if (statusCode === 403) {
      throw new AppError('Azure authentication failed or access was denied.', 403);
    }

    throw new AppError('Unable to verify Azure authentication.', 500);
  }
};

module.exports = {
  testAzureConnection
};
