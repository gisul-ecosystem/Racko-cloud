require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
 
const express = require('express');
const categoryRoutes = require('./src/routes/categoryRoutes');
const azureRoutes = require('./src/routes/azureRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const cleanupRoutes = require('./src/routes/cleanupRoutes');
const accessRoutes = require('./src/routes/accessRoutes');
const credentialRoutes = require('./src/routes/credentialRoutes');
const catalogRoutes = require('./src/routes/catalogRoutes');
const provisionRoutes = require('./src/routes/provisionRoutes');
const roleProvisionRoutes = require('./src/routes/roleProvisionRoutes');
const serviceResourceProvisionRoutes = require('./src/routes/serviceResourceProvisionRoutes');
const userProvisionRoutes = require('./src/routes/userProvisionRoutes');
const fabricProvisionRoutes = require('./src/routes/fabricProvisionRoutes');
const { startExpiryScheduler } = require('./src/scheduler/expiryScheduler');
const { startUsageScheduler } = require('./src/scheduler/usageScheduler');
const { startCleanupScheduler } = require('./src/scheduler/cleanupScheduler');
const { startBudgetScheduler } = require('./src/scheduler/budgetScheduler');
const { startResourceCleanupScheduler } = require('./src/scheduler/resourceCleanupScheduler');
const { startBudgetSpendSyncScheduler } = require('./src/scheduler/budgetSyncScheduler');
const { startWindowEnforcementScheduler } = require('./src/scheduler/windowEnforcementScheduler');
const { startPurchaseIntentScheduler } = require('./src/scheduler/purchaseIntentScheduler');
const pricingRoutes = require('./src/routes/pricingRoutes');
const servicePricingRoutes = require('./src/routes/servicePricingRoutes');
const requestRoutes = require('./src/routes/requestRoutes');
const usageRoutes = require('./src/routes/usageRoutes');
const orgAdminRoutes = require('./src/routes/orgAdminRoutes');
const adminAccessRequestRoutes = require('./src/routes/adminAccessRequestRoutes');
const privilegedRoleRequestRoutes = require('./src/routes/privilegedRoleRequestRoutes');
const serviceRoutes = require('./src/routes/serviceRoutes');
const jobRoutes = require('./src/routes/jobRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const purchaseIntentRoutes = require('./src/routes/purchaseIntentRoutes');
const AppError = require('./src/utils/AppError');
const pool = require('./src/config/database');
const { resumeOutboundEmailJobs } = require('./src/services/emailQueueService');
const { resumeProvisioningJobs } = require('./src/services/provisioningJobService');
const { getResendConfigStatus } = require('./src/services/email/resendEnv');

const app = express();

// Dynamic provisioning/status APIs must not return 304 — clients poll for fresh data.
app.set('etag', false);

app.use(express.json());

app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1000000;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs.toFixed(2)} ms`);
  });

  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Service Catalog API is running.'
  });
});

app.use('/api/categories', categoryRoutes);
app.use('/api/azure', azureRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cleanup', cleanupRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/manage', accessRoutes);
app.use('/api', catalogRoutes);
app.use('/api/provision', credentialRoutes);
app.use('/api/provision', provisionRoutes);
app.use('/api/provision', userProvisionRoutes);
app.use('/api/provision', fabricProvisionRoutes);
app.use('/api/provision', roleProvisionRoutes);
app.use('/api/provision', serviceResourceProvisionRoutes);
app.use('/api/pricing', pricingRoutes);
console.log('pricing_routes_registered');
app.use('/api/services/pricing', servicePricingRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin-access-requests', adminAccessRequestRoutes);
app.use('/api/privileged-role-requests', privilegedRoleRequestRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/org-admin', orgAdminRoutes);
app.use('/api/purchase-intent', purchaseIntentRoutes);
app.use('/api', notificationRoutes);

app.all('*', (req, res, next) => {
  next(new AppError(`Route not found: ${req.originalUrl}`, 404));
});

app.use((error, req, res, next) => {
  const rawStatus = Number(error.statusCode ?? error.status);
  const statusCode =
    Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

  const isNetworkFailure =
    rawStatus === -1 ||
    error?.code === 'TypeError' ||
    /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i.test(String(error?.message || ''));

  const message = error.isOperational
    ? error.message
    : isNetworkFailure
      ? 'Unable to reach Microsoft Graph. Check network connectivity and try again.'
      : 'Internal server error.';

  if (!error.isOperational) {
    console.error('Unhandled error:', error);
  }

  res.status(isNetworkFailure && statusCode === 500 ? 502 : statusCode).json({
    success: false,
    message
  });
});

const port = Number(process.env.PORT || 3000);
let server;

const startServer = () => {
  startExpiryScheduler();
  startUsageScheduler();
  startCleanupScheduler();
  startBudgetScheduler();
  startResourceCleanupScheduler();
  startBudgetSpendSyncScheduler();
  startWindowEnforcementScheduler();
  startPurchaseIntentScheduler();

  if (process.env.USAGE_TRACKING_DEBUG === 'true') {
    setInterval(async () => {
      try {
        const sessions = await pool.query(
          'SELECT COUNT(*) FROM user_usage_sessions WHERE logout_at IS NULL'
        );
        const usage = await pool.query(
          'SELECT username, used_today_minutes FROM azure_users WHERE used_today_minutes > 0 LIMIT 10'
        );
        console.log(
          `[DEBUG] Open sessions: ${sessions.rows[0].count}, Users with usage: ${usage.rows.length}`
        );
      } catch (error) {
        console.error('[DEBUG] Usage tracking check failed:', error.message);
      }
    }, 60000);
  }

  server = app.listen(port, () => {
    server.timeout = 0;
    server.requestTimeout = 0;
    server.headersTimeout = 0;
    server.keepAliveTimeout = 0;

    console.log(`Service Catalog API listening on port ${port}`);

    const emailStatus = getResendConfigStatus();
    if (emailStatus.configured) {
      console.log('Resend email delivery is configured.');
    } else {
      console.warn(
        `Resend email delivery is NOT configured. Missing: ${emailStatus.missingVars.join(', ')}`
      );
    }

    resumeOutboundEmailJobs().catch((error) => {
      console.error('Failed to resume outbound email jobs:', error?.message || error);
    });

    resumeProvisioningJobs().catch((error) => {
      console.error('Failed to resume provisioning jobs:', error?.message || error);
    });
  });

  return server;
};

const shutdown = async (signal) => {
  console.log(`${signal} received. Closing server gracefully.`);

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(async () => {
    try {
      await pool.end();
      console.log('PostgreSQL pool closed.');
      process.exit(0);
    } catch (error) {
      console.error('Error while closing PostgreSQL pool:', error);
      process.exit(1);
    }
  });
};

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

if (require.main === module) {
  startServer();
}

module.exports = app;
