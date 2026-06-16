const { ResourceManagementClient } = require('@azure/arm-resources');
const { createAzureCredential, validateAzureEnv } = require('../config/azure');
const AppError = require('../utils/AppError');
const {
  extractAzureErrorDetails,
  logAzureEvent,
  maskIdentifier,
  summarizeAzureEnv
} = require('../utils/azureLogger');

const LOG_SERVICE = 'azure-auth';
const MANAGEMENT_SCOPE = 'https://management.azure.com/.default';

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
    const azureConfig = validateAzureEnv();

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_config_loaded', {
      tenantId: azureConfig.tenantId,
      clientId: maskIdentifier(azureConfig.clientId),
      subscriptionId: azureConfig.subscriptionId
    });

    const credential = createAzureCredential(azureConfig);

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_token_request_started', {
      scope: MANAGEMENT_SCOPE,
      subscriptionId: azureConfig.subscriptionId
    });

    const tokenResponse = await credential.getToken(MANAGEMENT_SCOPE);

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_token_request_success', {
      subscriptionId: azureConfig.subscriptionId,
      tokenExpiresOn: tokenResponse?.expiresOnTimestamp
        ? new Date(tokenResponse.expiresOnTimestamp).toISOString()
        : null,
      tokenLength: tokenResponse?.token ? tokenResponse.token.length : 0
    });

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_arm_client_init_started', {
      subscriptionId: azureConfig.subscriptionId
    });

    const resourceClient = new ResourceManagementClient(credential, azureConfig.subscriptionId);

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_resource_groups_list_started', {
      subscriptionId: azureConfig.subscriptionId
    });

    let resourceGroupCount = 0;

    for await (const _resourceGroup of resourceClient.resourceGroups.list()) {
      resourceGroupCount += 1;
    }

    const durationMs = Date.now() - startedAt;

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_test_success', {
      subscriptionId: azureConfig.subscriptionId,
      resourceGroupCount,
      durationMs
    });

    return {
      authenticated: true,
      subscriptionId: azureConfig.subscriptionId,
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

    if (statusCode === 403) {
      throw new AppError('Azure authentication failed or access was denied.', 403);
    }

    throw new AppError('Unable to verify Azure authentication.', 500);
  }
};

module.exports = {
  testAzureConnection
};
