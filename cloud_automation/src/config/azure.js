const https = require('https');
const { createDefaultHttpClient } = require('@azure/core-rest-pipeline');
const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const AppError = require('../utils/AppError');
const {
  logAzureEvent,
  maskIdentifier,
  summarizeAzureEnv
} = require('../utils/azureLogger');

const LOG_SERVICE = 'azure-config';
const MANAGEMENT_SCOPE = 'https://management.azure.com/.default';

const REQUIRED_ENV_VARS = [
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_TENANT_ID',
  'AZURE_SUBSCRIPTION_ID'
];

let envValidationLogged = false;
let cachedAzureContext = null;

const ipv4Agent = new https.Agent({ family: 4 });
const defaultHttpClient = createDefaultHttpClient();
const ipv4HttpClient = {
  sendRequest: async (request) => {
    request.agent = ipv4Agent;
    return defaultHttpClient.sendRequest(request);
  }
};

const getTrimmedEnvValue = (name) => {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
};

const validateAzureEnv = () => {
  const shouldLog = !envValidationLogged;

  if (shouldLog) {
    logAzureEvent(LOG_SERVICE, 'info', 'azure_env_validation_started', summarizeAzureEnv());
  }

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

  if (shouldLog) {
    envValidationLogged = true;

    logAzureEvent(LOG_SERVICE, 'info', 'azure_env_validation_success', {
      tenantId: envValues.AZURE_TENANT_ID,
      clientId: maskIdentifier(envValues.AZURE_CLIENT_ID),
      subscriptionId: envValues.AZURE_SUBSCRIPTION_ID,
      clientSecretConfigured: true,
      clientSecretLength: envValues.AZURE_CLIENT_SECRET.length
    });
  }

  return {
    clientId: envValues.AZURE_CLIENT_ID,
    clientSecret: envValues.AZURE_CLIENT_SECRET,
    tenantId: envValues.AZURE_TENANT_ID,
    subscriptionId: envValues.AZURE_SUBSCRIPTION_ID
  };
};

const createAzureCredential = ({ tenantId, clientId, clientSecret }) => {
  return new ClientSecretCredential(tenantId, clientId, clientSecret, {
    httpClient: ipv4HttpClient
  });
};

const getAzureContext = () => {
  const config = validateAzureEnv();

  if (
    !cachedAzureContext ||
    cachedAzureContext.tenantId !== config.tenantId ||
    cachedAzureContext.clientId !== config.clientId ||
    cachedAzureContext.subscriptionId !== config.subscriptionId
  ) {
    logAzureEvent(LOG_SERVICE, 'info', 'azure_credential_initialized', {
      tenantId: config.tenantId,
      clientId: maskIdentifier(config.clientId),
      subscriptionId: config.subscriptionId,
      credentialType: 'ClientSecretCredential'
    });

    cachedAzureContext = {
      ...config,
      credential: createAzureCredential(config)
    };
  }

  return cachedAzureContext;
};

const ensureAzureManagementAccess = async () => {
  const { credential, subscriptionId } = getAzureContext();
  const token = await credential.getToken(MANAGEMENT_SCOPE);

  return {
    credential,
    subscriptionId,
    token
  };
};

/**
 * Microsoft Graph client for sign-in monitoring and account enforcement.
 *
 * Required Microsoft Graph API permissions (application permissions, admin consent):
 *   AuditLog.Read.All — read sign-in logs (/auditLogs/signIns)
 *   Directory.Read.All — read user info / subscribed SKUs
 *   Organization.Read.All — optional for organization metadata
 *   User.ReadWrite.All — disable/enable accounts, revoke sessions, assign licenses
 *   LicenseAssignment.ReadWrite.All — preferred for assignLicense / subscribedSkus
 *
 * Verify in Azure Portal → App registrations → API permissions.
 * Smoke test: GET https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=1
 */
const createGraphClient = () => {
  const { tenantId, clientId, clientSecret } = getAzureContext();

  const credential = createAzureCredential({ tenantId, clientId, clientSecret });

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken('https://graph.microsoft.com/.default');
        return token.token;
      }
    }
  });
};

module.exports = {
  createAzureCredential,
  createGraphClient,
  ensureAzureManagementAccess,
  getAzureContext,
  validateAzureEnv
};
