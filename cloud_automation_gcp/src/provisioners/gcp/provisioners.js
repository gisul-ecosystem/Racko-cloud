import {
  GCP_ORGANIZATION_ID,
  GCP_BILLING_ACCOUNT,
  GCP_DOMAIN,
  GCP_ADMIN_EMAIL,
  gcpConfig,
  projectsClient,
  billingClient,
  getGoogleAdminClient,
} from '../../config/gcp.js';

export function assertProvisionCredentials() {
  const missing = [];

  if (!GCP_ORGANIZATION_ID) missing.push('GCP_ORGANIZATION_ID');
  if (!GCP_BILLING_ACCOUNT) missing.push('GCP_BILLING_ACCOUNT_ID');
  if (!gcpConfig.keyFilename && !gcpConfig.credentials) {
    missing.push('GCP_SERVICE_ACCOUNT_KEY_PATH or GCP_SERVICE_ACCOUNT_KEY');
  }
  if (!GCP_DOMAIN) missing.push('GCP_DOMAIN');
  if (!GCP_ADMIN_EMAIL) missing.push('GCP_ADMIN_EMAIL');

  if (missing.length) {
    const error = new Error(
      `GCP credentials not configured. Add to .env: ${missing.join(', ')}`
    );
    error.code = 'GCP_CREDENTIALS_MISSING';
    throw error;
  }
}

function sanitizeProjectId(base) {
  return String(base || 'racko-lab')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 26);
}

export async function createLabProject({ displayName, requestId }) {
  assertProvisionCredentials();

  const prefix = process.env.GCP_LAB_PROJECT_PREFIX || 'racko-lab';
  const suffix = String(requestId || Date.now()).slice(-6);
  const projectId = `${sanitizeProjectId(prefix)}-${suffix}`;

  const parent = process.env.GCP_FOLDER_ID
    ? `folders/${process.env.GCP_FOLDER_ID}`
    : `organizations/${GCP_ORGANIZATION_ID}`;

  const [operation] = await projectsClient.createProject({
    project: {
      projectId,
      displayName: displayName || projectId,
      parent,
    },
  });

  await operation.promise();

  await billingClient.updateProjectBillingInfo({
    name: `projects/${projectId}`,
    projectBillingInfo: {
      billingAccountName: `billingAccounts/${GCP_BILLING_ACCOUNT}`,
    },
  });

  return { projectId, displayName: displayName || projectId };
}

export async function deleteLabProject(projectId) {
  if (!projectId) return;
  await projectsClient.deleteProject({ name: `projects/${projectId}` });
}

export async function createIdentityUsers({ accountCount, projectId, idMode }) {
  assertProvisionCredentials();

  const admin = await getGoogleAdminClient();
  const users = [];
  const domain = GCP_DOMAIN;

  for (let i = 0; i < accountCount; i += 1) {
    const username = idMode === 'test_ids' ? `testlab${i + 1}` : `labuser${i + 1}`;
    const email = `${username}@${domain}`;
    const password = `Racko${Date.now().toString(36)}${i}!`;

    await admin.users.insert({
      requestBody: {
        primaryEmail: email,
        name: { givenName: username, familyName: 'Lab' },
        password,
        changePasswordAtNextLogin: true,
      },
    });

    users.push({
      userIndex: i,
      username,
      email,
      password,
      gcpProjectId: projectId,
      consoleUrl: 'https://console.cloud.google.com/',
    });
  }

  return users;
}

export async function assignProjectIamRoles({ projectId, users, permissions }) {
  // Phase 2: bind roles via Cloud Resource Manager IAM API
  return {
    projectId,
    bindings: permissions?.length || 0,
    users: users?.length || 0,
  };
}

export async function sendCredentialsEmail({ request, users }) {
  // Phase 2: wire Resend/Zoho mailSender
  console.log(
    `[gcp email] Credentials ready for ${request.customerEmail} (${users?.length || 0} users)`
  );
  return { sent: false, reason: 'Email provider not wired yet — credentials stored on request' };
}
