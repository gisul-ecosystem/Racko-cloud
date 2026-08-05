const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

// Defaults tuned for ~500–1000 user labs with multi-service selection.
// Keep PROVISION_STEP_TIME_BUDGET_MS=0 so each HTTP call does one batch (proxy-safe).
const getBulkProvisionConcurrency = () =>
  parsePositiveInt(process.env.BULK_PROVISION_CONCURRENCY, 50);

const getRoleProvisionConcurrency = () =>
  parsePositiveInt(
    process.env.ROLE_PROVISION_CONCURRENCY || process.env.BULK_PROVISION_CONCURRENCY,
    60
  );

const getServiceProvisionConcurrency = () =>
  parsePositiveInt(
    process.env.SERVICE_PROVISION_CONCURRENCY || process.env.BULK_PROVISION_CONCURRENCY,
    40
  );

const getResourceGroupBatchSize = () =>
  parsePositiveInt(process.env.RESOURCE_GROUP_BATCH_SIZE, 50);

const getRoleProvisionBatchSize = () =>
  parsePositiveInt(process.env.ROLE_PROVISION_BATCH_SIZE, 120);

const getUserProvisionBatchSize = () =>
  parsePositiveInt(process.env.USER_PROVISION_BATCH_SIZE, 50);

const getServicePolicyBatchSize = () =>
  parsePositiveInt(
    process.env.SERVICE_POLICY_BATCH_SIZE || process.env.RESOURCE_GROUP_BATCH_SIZE,
    50
  );

const getBudgetProvisionBatchSize = () =>
  parsePositiveInt(
    process.env.BUDGET_PROVISION_BATCH_SIZE || process.env.USER_PROVISION_BATCH_SIZE,
    50
  );

const getResourceScopedUserBatchSize = () =>
  parsePositiveInt(
    process.env.RESOURCE_SCOPED_USER_BATCH_SIZE || process.env.ROLE_PROVISION_BATCH_SIZE,
    80
  );

const getProvisionStepTimeBudgetMs = () => {
  const raw = process.env.PROVISION_STEP_TIME_BUDGET_MS;
  if (raw === '0') {
    return 0;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
};

/**
 * Role assignment packs many RBAC calls into one HTTP request.
 * Default 55s keeps nginx (300s) happy while finishing 48–500 user labs faster.
 * Set ROLE_PROVISION_TIME_BUDGET_MS=0 to force one batch per request.
 */
const getRoleProvisionTimeBudgetMs = () => {
  const raw = process.env.ROLE_PROVISION_TIME_BUDGET_MS;
  if (raw === '0') {
    return 0;
  }

  if (raw != null && String(raw).trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }

  const shared = getProvisionStepTimeBudgetMs();
  if (shared > 0) {
    return shared;
  }

  return 55_000;
};

const getMaxProvisionAccountCount = () =>
  parsePositiveInt(process.env.MAX_PROVISION_ACCOUNT_COUNT, 1000);

const getDeleteAzureConcurrency = () =>
  parsePositiveInt(
    process.env.DELETE_AZURE_CONCURRENCY || process.env.BULK_PROVISION_CONCURRENCY,
    30
  );

const getResourceCleanupConcurrency = () =>
  parsePositiveInt(
    process.env.RESOURCE_CLEANUP_CONCURRENCY || process.env.DELETE_AZURE_CONCURRENCY,
    6
  );

module.exports = {
  getBulkProvisionConcurrency,
  getRoleProvisionConcurrency,
  getServiceProvisionConcurrency,
  getResourceGroupBatchSize,
  getRoleProvisionBatchSize,
  getUserProvisionBatchSize,
  getServicePolicyBatchSize,
  getBudgetProvisionBatchSize,
  getResourceScopedUserBatchSize,
  getProvisionStepTimeBudgetMs,
  getRoleProvisionTimeBudgetMs,
  getMaxProvisionAccountCount,
  getDeleteAzureConcurrency,
  getResourceCleanupConcurrency
};
