const maskIdentifier = (value) => {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}***`;
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
};

const summarizeAzureEnv = () => {
  const readEnv = (name) => {
    const value = process.env[name];
    return typeof value === 'string' ? value.trim() : '';
  };

  const clientSecret = readEnv('AZURE_CLIENT_SECRET');

  return {
    tenantId: readEnv('AZURE_TENANT_ID') || null,
    clientId: maskIdentifier(readEnv('AZURE_CLIENT_ID')),
    subscriptionId: readEnv('AZURE_SUBSCRIPTION_ID') || null,
    clientSecretConfigured: Boolean(clientSecret),
    clientSecretLength: clientSecret ? clientSecret.length : 0,
    nodeEnv: process.env.NODE_ENV || 'development'
  };
};

const extractAzureErrorDetails = (error) => {
  if (!error) {
    return {};
  }

  const responseBody =
    error?.response?.body ||
    error?.response?.parsedBody ||
    error?.body ||
    error?.details?.body ||
    null;

  let responseBodySummary = null;

  if (responseBody) {
    if (typeof responseBody === 'string') {
      responseBodySummary = responseBody.slice(0, 500);
    } else {
      try {
        responseBodySummary = JSON.stringify(responseBody).slice(0, 500);
      } catch {
        responseBodySummary = '[unserializable response body]';
      }
    }
  }

  return {
    errorName: error?.name || null,
    errorCode: error?.code || null,
    statusCode: error?.statusCode || error?.status || null,
    message: error?.message || null,
    correlationId: error?.correlationId || error?.details?.correlationId || null,
    oauthError: error?.error || null,
    oauthErrorDescription: error?.errorDescription || null,
    responseBodySummary
  };
};

const logAzureEvent = (service, level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service,
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

module.exports = {
  extractAzureErrorDetails,
  logAzureEvent,
  maskIdentifier,
  summarizeAzureEnv
};
