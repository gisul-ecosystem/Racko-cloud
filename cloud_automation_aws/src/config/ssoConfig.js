import { IdentitystoreClient } from '@aws-sdk/client-identitystore';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

export const SSO_INSTANCE_ARN = process.env.AWS_SSO_INSTANCE_ARN?.trim() || '';
export const IDENTITY_STORE_ID = process.env.AWS_SSO_IDENTITY_STORE_ID?.trim() || '';

export let SSO_REGION =
  process.env.AWS_SSO_REGION?.trim() || process.env.AWS_REGION?.trim() || 'ap-south-1';

function candidateRegions() {
  return [
    ...new Set(
      [
        process.env.AWS_SSO_REGION?.trim(),
        process.env.AWS_REGION?.trim(),
        SSO_REGION,
        'us-east-1',
        'eu-north-1',
        'ap-south-1',
      ].filter(Boolean)
    ),
  ];
}

function createClients(region) {
  const config = { region, credentials };
  return {
    ssoAdminClient: new SSOAdminClient(config),
    identityStoreClient: new IdentitystoreClient(config),
  };
}

let clients = createClients(SSO_REGION);
export let ssoAdminClient = clients.ssoAdminClient;
export let identityStoreClient = clients.identityStoreClient;

export function formatIdentityCenterError(err, context = '') {
  const message = err?.message || String(err);
  const prefix = context ? `${context}: ` : '';

  if (isIdentityCenterNotFoundError(err)) {
    const error = new Error(
      `${prefix}${message}. IAM Identity Center was not found in region "${SSO_REGION}". ` +
        'Set AWS_SSO_REGION to the region where Identity Center is enabled ' +
        '(check the console URL or run `aws sso-admin list-instances --region <region>`). ' +
        'Also verify AWS_SSO_INSTANCE_ARN and AWS_SSO_IDENTITY_STORE_ID match that instance.'
    );
    error.cause = err;
    error.code = err?.name || err?.Code;
    return error;
  }

  const enhanced = new Error(`${prefix}${message}`);
  enhanced.originalError = err;
  enhanced.code = err?.name || err?.Code;
  return enhanced;
}

export function isIdentityCenterNotFoundError(err) {
  const code = String(err?.name || err?.Code || '');
  const message = String(err?.message || '').toLowerCase();

  return (
    code === 'ResourceNotFoundException' ||
    message.includes('applicationinstance not found') ||
    message.includes('identitystore not found') ||
    message.includes('not found') ||
    message.includes('does not exist')
  );
}

export async function initializeIdentityCenter() {
  const missing = [];
  if (!SSO_INSTANCE_ARN) missing.push('AWS_SSO_INSTANCE_ARN');
  if (!IDENTITY_STORE_ID) missing.push('AWS_SSO_IDENTITY_STORE_ID');
  if (!process.env.MASTER_ACCOUNT_ID?.trim()) missing.push('MASTER_ACCOUNT_ID');

  for (const region of candidateRegions()) {
    try {
      const probe = new SSOAdminClient({ region, credentials });
      const response = await probe.send(new ListInstancesCommand({}));
      const instances = response.Instances || [];

      if (instances.length === 0) {
        continue;
      }

      const match =
        instances.find(
          (instance) =>
            instance.InstanceArn === SSO_INSTANCE_ARN &&
            instance.IdentityStoreId === IDENTITY_STORE_ID
        ) ||
        instances.find((instance) => instance.InstanceArn === SSO_INSTANCE_ARN) ||
        instances[0];

      if (region !== SSO_REGION) {
        console.warn(
          `[ssoConfig] Identity Center found in ${region} (AWS_SSO_REGION was ${SSO_REGION}). Using ${region}.`
        );
      }

      SSO_REGION = region;
      clients = createClients(region);
      ssoAdminClient = clients.ssoAdminClient;
      identityStoreClient = clients.identityStoreClient;

      if (missing.length > 0) {
        console.warn(
          `[ssoConfig] Missing env vars: ${missing.join(', ')}. Provisioning will fail until configured.`
        );
        console.warn(
          `[ssoConfig] Discovered instance: AWS_SSO_INSTANCE_ARN=${match.InstanceArn}, AWS_SSO_IDENTITY_STORE_ID=${match.IdentityStoreId}, AWS_SSO_REGION=${region}`
        );
        return { ok: false, reason: 'missing_env', region, instance: match };
      }

      if (
        match.InstanceArn !== SSO_INSTANCE_ARN ||
        match.IdentityStoreId !== IDENTITY_STORE_ID
      ) {
        console.warn(
          `[ssoConfig] Configured Identity Center IDs do not match region "${region}". ` +
            `Found InstanceArn=${match.InstanceArn}, IdentityStoreId=${match.IdentityStoreId}. ` +
            'Update AWS_SSO_INSTANCE_ARN, AWS_SSO_IDENTITY_STORE_ID, and AWS_SSO_REGION.'
        );
        return { ok: false, reason: 'config_mismatch', region, instance: match };
      }

      console.log(`[ssoConfig] IAM Identity Center config validated OK (${region})`);
      return { ok: true, region, instance: match };
    } catch {
      // Try the next candidate region.
    }
  }

  if (missing.length > 0) {
    console.warn(
      `[ssoConfig] Missing env vars: ${missing.join(', ')}. Provisioning will fail.`
    );
  } else {
    console.warn(
      `[ssoConfig] No IAM Identity Center instance found in regions: ${candidateRegions().join(', ')}. ` +
        'Set AWS_SSO_REGION to the region where Identity Center is enabled.'
    );
  }

  return { ok: false, reason: 'no_instance' };
}

export async function validateIdentityCenterConfig() {
  return initializeIdentityCenter();
}
