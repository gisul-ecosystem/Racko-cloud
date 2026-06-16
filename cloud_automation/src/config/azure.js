const { ClientSecretCredential } = require('@azure/identity');
const AppError = require('../utils/AppError');
const {
  logAzureEvent,
  maskIdentifier,
  summarizeAzureEnv
} = require('../utils/azureLogger');

const LOG_SERVICE = 'azure-config';

const REQUIRED_ENV_VARS = [
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_TENANT_ID',
  'AZURE_SUBSCRIPTION_ID'
];

const getTrimmedEnvValue = (name) => {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
};

const validateAzureEnv = () => {
  logAzureEvent(LOG_SERVICE, 'info', 'azure_env_validation_started', summarizeAzureEnv());

  const envValues = REQUIRED_ENV_VARS.reduce((accumulator, name) => {
    accumulator[name] = getTrimmedEnvValue(name);
    return accumulator;
  }, {});

  const missingVars = REQUIRED_ENV_VARS.filter((name) => !envValues[name]);

  if (missingVars.length > 0) {
    logAzureEvent(LOG_SERVICE, 'error', 'azure_env_validation_failed', {
      missingVars,
      ...summarizeAzureEnv()
    });

    throw new AppError(
      `Missing required Azure environment variable(s): ${missingVars.join(', ')}`,
      500
    );
  }

  logAzureEvent(LOG_SERVICE, 'info', 'azure_env_validation_success', {
    tenantId: envValues.AZURE_TENANT_ID,
    clientId: maskIdentifier(envValues.AZURE_CLIENT_ID),
    subscriptionId: envValues.AZURE_SUBSCRIPTION_ID,
    clientSecretConfigured: true,
    clientSecretLength: envValues.AZURE_CLIENT_SECRET.length
  });

  return {
    clientId: envValues.AZURE_CLIENT_ID,
    clientSecret: envValues.AZURE_CLIENT_SECRET,
    tenantId: envValues.AZURE_TENANT_ID,
    subscriptionId: envValues.AZURE_SUBSCRIPTION_ID
  };
};

const createAzureCredential = ({ tenantId, clientId, clientSecret }) => {
  logAzureEvent(LOG_SERVICE, 'info', 'azure_credential_create_started', {
    tenantId,
    clientId: maskIdentifier(clientId),
    credentialType: 'ClientSecretCredential'
  });

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  logAzureEvent(LOG_SERVICE, 'info', 'azure_credential_create_success', {
    tenantId,
    clientId: maskIdentifier(clientId),
    credentialType: 'ClientSecretCredential'
  });

  return credential;
};

module.exports = {
  createAzureCredential,
  validateAzureEnv
};
