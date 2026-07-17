const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const getBulkProvisionConcurrency = () =>
  parsePositiveInt(process.env.BULK_PROVISION_CONCURRENCY, 30);

const getRoleProvisionConcurrency = () =>
  parsePositiveInt(
    process.env.ROLE_PROVISION_CONCURRENCY || process.env.BULK_PROVISION_CONCURRENCY,
    30
  );

const getServiceProvisionConcurrency = () =>
  parsePositiveInt(
    process.env.SERVICE_PROVISION_CONCURRENCY || process.env.BULK_PROVISION_CONCURRENCY,
    30
  );

const getResourceGroupBatchSize = () =>
  parsePositiveInt(process.env.RESOURCE_GROUP_BATCH_SIZE, 50);

const getRoleProvisionBatchSize = () =>
  parsePositiveInt(process.env.ROLE_PROVISION_BATCH_SIZE, 150);

const getUserProvisionBatchSize = () =>
  parsePositiveInt(process.env.USER_PROVISION_BATCH_SIZE, 50);

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

const getMaxProvisionAccountCount = () =>
  parsePositiveInt(process.env.MAX_PROVISION_ACCOUNT_COUNT, 1000);

const getDeleteAzureConcurrency = () =>
  parsePositiveInt(
    process.env.DELETE_AZURE_CONCURRENCY || process.env.BULK_PROVISION_CONCURRENCY,
    30
  );

module.exports = {
  getBulkProvisionConcurrency,
  getRoleProvisionConcurrency,
  getServiceProvisionConcurrency,
  getResourceGroupBatchSize,
  getRoleProvisionBatchSize,
  getUserProvisionBatchSize,
  getProvisionStepTimeBudgetMs,
  getMaxProvisionAccountCount,
  getDeleteAzureConcurrency
};
