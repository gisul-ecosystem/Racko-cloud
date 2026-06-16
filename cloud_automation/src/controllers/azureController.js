const azureService = require('../services/azureService');
const { logAzureEvent, summarizeAzureEnv } = require('../utils/azureLogger');

const LOG_SERVICE = 'azure-auth-controller';

const testAzureConnection = async (req, res, next) => {
  logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_test_request_received', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
    ...summarizeAzureEnv()
  });

  try {
    const result = await azureService.testAzureConnection();

    logAzureEvent(LOG_SERVICE, 'info', 'azure_auth_test_request_success', {
      subscriptionId: result.subscriptionId,
      resourceGroupCount: result.resourceGroupCount
    });

    res.status(200).json({
      success: true,
      authenticated: result.authenticated,
      subscriptionId: result.subscriptionId,
      resourceGroupCount: result.resourceGroupCount
    });
  } catch (error) {
    logAzureEvent(LOG_SERVICE, 'error', 'azure_auth_test_request_failed', {
      statusCode: error?.statusCode || 500,
      message: error?.message || null
    });

    next(error);
  }
};

module.exports = {
  testAzureConnection
};
