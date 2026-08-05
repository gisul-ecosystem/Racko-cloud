export const PROVISION_STEPS = {
  ACCOUNT: { step: 1, progress: 15, name: 'Prepare lab account' },
  SCP: { step: 2, progress: 25, name: 'Apply SCP restrictions' },
  AUTOTAG: { step: 3, progress: 40, name: 'Deploy auto-tagger Lambda' },
  ROLES: { step: 4, progress: 55, name: 'Create IAM lab roles' },
  POLICY: { step: 5, progress: 75, name: 'Attach permissions' },
  PORTAL: { step: 6, progress: 90, name: 'Create manage portal access' },
  EMAIL: { step: 7, progress: 100, name: 'Send credentials email' },
};

export const provisioningConfig = {
  labsOuId: process.env.AWS_LABS_OU_ID || '',
  sandboxOuId: process.env.AWS_SANDBOX_OU_ID || '',
  productionOuId: process.env.AWS_PRODUCTION_OU_ID || '',
  defaultOuKey: process.env.AWS_DEFAULT_OU || 'Labs',
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_FROM || 'info@racko.ai',
  emailFromName: process.env.EMAIL_FROM_NAME || 'Racko',
  clientPortalUrl: process.env.CLIENT_PORTAL_URL || 'http://localhost:3000',
  accountCreationTimeoutMs: Number(process.env.ACCOUNT_CREATION_TIMEOUT_MS || 20 * 60 * 1000),
  accountCreationPollMs: Number(process.env.ACCOUNT_CREATION_POLL_MS || 15000),
  accountCreationMaxRetries: Number(process.env.ACCOUNT_CREATION_MAX_RETRIES || 5),
  enableCatalogScheduler: process.env.ENABLE_CATALOG_SCHEDULER !== 'false',
  catalogSyncCron: process.env.CATALOG_SYNC_CRON || '0 2 * * *',
};

export function resolveTargetOuId(ouKey) {
  const map = {
    Labs: provisioningConfig.labsOuId,
    Sandbox: provisioningConfig.sandboxOuId,
    Production: provisioningConfig.productionOuId,
  };
  return map[ouKey] || provisioningConfig.labsOuId;
}
