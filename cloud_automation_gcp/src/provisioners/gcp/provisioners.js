import {
  GCP_ORGANIZATION_ID,
  GCP_BILLING_ACCOUNT,
  GCP_PROJECT_ID,
  GCP_DOMAIN,
  GCP_ADMIN_EMAIL,
  gcpConfig,
  projectsClient,
  billingClient,
  getGoogleAdminClient,
  auth,
  formatAdminSdkHelp,
  formatDomainWideDelegationHelp,
} from '../../config/gcp.js';
import { sendMailWithRetry } from '../../services/email/mailSender.js';
import { getResendConfigStatus } from '../../services/email/resendEnv.js';
import { createManagePortalSession } from '../../services/managePortalService.js';
import { resolvePortalBaseUrl } from '../../utils/portalUrl.js';

export function hasBillingAccount() {
  return Boolean(GCP_BILLING_ACCOUNT);
}

/** Credentials required for users, IAM, and email (billing not required). */
export function assertBaseProvisionCredentials() {
  const missing = [];

  if (!GCP_ORGANIZATION_ID) missing.push('GCP_ORGANIZATION_ID');
  if (!gcpConfig.keyFilename && !gcpConfig.credentials) {
    missing.push('GCP_SERVICE_ACCOUNT_KEY_PATH or GCP_SERVICE_ACCOUNT_KEY');
  }
  if (!GCP_DOMAIN) missing.push('GCP_DOMAIN');
  if (!GCP_ADMIN_EMAIL) missing.push('GCP_ADMIN_EMAIL');
  if (!GCP_PROJECT_ID) missing.push('GCP_PROJECT_ID');

  if (missing.length) {
    const error = new Error(
      `GCP credentials not configured. Add to .env: ${missing.join(', ')}`
    );
    error.code = 'GCP_CREDENTIALS_MISSING';
    throw error;
  }
}

/** Full provisioning including dedicated lab project creation. */
export function assertProvisionCredentials() {
  assertBaseProvisionCredentials();
  if (!GCP_BILLING_ACCOUNT) {
    const error = new Error(
      'GCP credentials not configured. Add to .env: GCP_BILLING_ACCOUNT_ID'
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

function collectRoles(permissions = [], userRoles = []) {
  const roleSet = new Set(['roles/viewer']);

  for (const role of userRoles || []) {
    if (role) roleSet.add(role);
  }

  for (const entry of permissions || []) {
    for (const role of entry.roles || []) {
      if (role) roleSet.add(role);
    }
  }

  return [...roleSet];
}

function rethrowAdminClientError(err) {
  const message = String(err?.message || '');
  if (
    message.includes('admin.googleapis.com') ||
    message.includes('Admin SDK API has not been used') ||
    message.includes('SERVICE_DISABLED')
  ) {
    const error = new Error(formatAdminSdkHelp(err));
    error.code = 'GCP_ADMIN_SDK_DISABLED';
    throw error;
  }
  if (message.includes('unauthorized_client')) {
    const error = new Error(formatDomainWideDelegationHelp(err));
    error.code = 'GCP_DOMAIN_WIDE_DELEGATION_MISSING';
    throw error;
  }
  throw err;
}

function deriveIdentityUsername(userIndex, requestId, idMode) {
  const suffix = String(requestId || Date.now()).slice(-6);
  const prefix = idMode === 'test_ids' ? 'testlab' : 'labuser';
  return `${prefix}${userIndex + 1}-${suffix}`;
}

function isIdentityUserExistsError(err) {
  const message = String(err?.message || '');
  return err?.code === 409 || message.includes('Entity already exists');
}

function isPermittedCustomerIamError(err) {
  const message = String(err?.message || '');
  return message.includes('do not belong to a permitted customer');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  return { projectId, displayName: displayName || projectId, mode: 'dedicated' };
}

/**
 * Without billing, reuse the master project so users/IAM/email can still be provisioned.
 * Students share one project until billing is configured for per-lab projects.
 */
export async function resolveLabProject({ displayName, requestId }) {
  if (hasBillingAccount()) {
    return createLabProject({ displayName, requestId });
  }

  assertBaseProvisionCredentials();

  console.warn(
    `[gcp provision] GCP_BILLING_ACCOUNT_ID not set — using shared master project ${GCP_PROJECT_ID} (users + IAM only).`
  );

  return {
    projectId: GCP_PROJECT_ID,
    displayName: displayName || GCP_PROJECT_ID,
    mode: 'shared_master',
    skippedReason:
      'Billing account not configured. Lab users share the master project until GCP_BILLING_ACCOUNT_ID is added.',
  };
}

export async function deleteLabProject(projectId) {
  if (!projectId || projectId === GCP_PROJECT_ID) return;
  await projectsClient.deleteProject({ name: `projects/${projectId}` });
}

export async function createIdentityUsers({
  accountCount,
  projectId,
  idMode,
  requestId,
  startIndex = 0,
}) {
  assertBaseProvisionCredentials();

  let admin;
  try {
    admin = await getGoogleAdminClient();
  } catch (err) {
    rethrowAdminClientError(err);
  }

  const users = [];
  const domain = GCP_DOMAIN;

  for (let i = 0; i < accountCount; i += 1) {
    const userIndex = startIndex + i;
    const username = deriveIdentityUsername(userIndex, requestId, idMode);
    const email = `${username}@${domain}`;
    const password = `Racko${Date.now().toString(36)}${userIndex}!`;

    try {
      await admin.users.insert({
        requestBody: {
          primaryEmail: email,
          name: { givenName: username, familyName: 'Lab' },
          password,
          changePasswordAtNextLogin: true,
        },
      });
    } catch (err) {
      if (isIdentityUserExistsError(err)) {
        await admin.users.update({
          userKey: email,
          requestBody: {
            password,
            changePasswordAtNextLogin: true,
            suspended: false,
          },
        });
      } else {
        rethrowAdminClientError(err);
      }
    }

    users.push({
      userIndex,
      username,
      email,
      password,
      gcpProjectId: projectId,
      consoleUrl: projectId
        ? `https://console.cloud.google.com/home/dashboard?project=${encodeURIComponent(projectId)}`
        : 'https://console.cloud.google.com/',
    });
  }

  return users;
}

export async function assignProjectIamRoles({
  projectId,
  users = [],
  permissions = [],
  replaceUserBindings = false,
}) {
  if (!projectId) {
    throw new Error('projectId is required for IAM assignment');
  }

  const client = await auth.getClient();
  const resource = `projects/${projectId}`;
  const url = `https://cloudresourcemanager.googleapis.com/v1/${resource}:getIamPolicy`;

  const getResponse = await client.request({ url, method: 'POST', data: {} });
  const policy = getResponse.data || { bindings: [] };
  const bindings = [...(policy.bindings || [])];

  for (const user of users) {
    const member = user.email?.includes('@') ? `user:${user.email}` : null;
    if (!member) continue;

    const roles = collectRoles(permissions, user.roles);

    if (replaceUserBindings) {
      for (const binding of bindings) {
        binding.members = (binding.members || []).filter((entry) => entry !== member);
      }
    }

    for (const role of roles) {
      let binding = bindings.find((entry) => entry.role === role);
      if (!binding) {
        binding = { role, members: [] };
        bindings.push(binding);
      }
      if (!binding.members.includes(member)) {
        binding.members.push(member);
      }
    }
  }

  const setIamPolicy = () =>
    client.request({
      url: `https://cloudresourcemanager.googleapis.com/v1/${resource}:setIamPolicy`,
      method: 'POST',
      data: {
        policy: {
          ...policy,
          bindings: bindings.filter((binding) => (binding.members || []).length > 0),
        },
      },
    });

  const retryDelaysMs = [0, 30_000, 60_000];
  let lastError;

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    if (retryDelaysMs[attempt] > 0) {
      console.warn(
        `[gcp provision] IAM assign retry ${attempt + 1}/${retryDelaysMs.length} for ${projectId} after permitted-customer error`
      );
      await sleep(retryDelaysMs[attempt]);
    }

    try {
      await setIamPolicy();
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (!isPermittedCustomerIamError(err) || attempt === retryDelaysMs.length - 1) {
        throw err;
      }
    }
  }

  if (lastError) throw lastError;

  return {
    projectId,
    bindings: bindings.length,
    users: users.length,
  };
}

export async function suspendIdentityUser(request, userIndex) {
  const user = request.identityUsers?.find((entry) => entry.userIndex === Number(userIndex));
  if (!user?.email) return;

  const admin = await getGoogleAdminClient();
  await admin.users.update({
    userKey: user.email,
    requestBody: { suspended: true },
  });
}

export async function reinstateIdentityUser(request, userIndex, { forceNewPassword = false } = {}) {
  const user = request.identityUsers?.find((entry) => entry.userIndex === Number(userIndex));
  if (!user?.email) {
    throw new Error('User not found');
  }

  const admin = await getGoogleAdminClient();
  const password = forceNewPassword
    ? `Racko${Date.now().toString(36)}${userIndex}!`
    : user.password;

  await admin.users.update({
    userKey: user.email,
    requestBody: {
      suspended: false,
      ...(forceNewPassword ? { password, changePasswordAtNextLogin: true } : {}),
    },
  });

  return { password };
}

export async function deleteIdentityUser(user) {
  if (!user?.email) return;

  const admin = await getGoogleAdminClient();
  await admin.users.delete({ userKey: user.email });
}

function buildCredentialsHtml({ request, users, portalUrl, portalSession }) {
  const rows = users
    .map(
      (user) => `<tr>
        <td style="padding:8px;border:1px solid #e5e7eb;">${user.username}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${user.email}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;">${user.password}</td>
      </tr>`
    )
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;max-width:720px;">
      <h2 style="margin:0 0 12px;">Your GCP lab credentials are ready</h2>
      <p>Project: <strong>${request.projectName || request.gcpProjectId || 'GCP Lab'}</strong></p>
      <p>GCP project ID: <strong>${request.gcpProjectId || 'Pending'}</strong></p>
      <p>Manage portal: <a href="${portalUrl}">${portalUrl}</a></p>
      <p style="margin-top:12px;font-size:13px;color:#374151;">
        Admin portal login:
        <strong style="font-family:monospace;">${portalSession.username}</strong> /
        <strong style="font-family:monospace;">${portalSession.password}</strong>
      </p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
        <tr style="background:#f3f4f6;">
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Username</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Email</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Password</th>
        </tr>
        ${rows}
      </table>
      <p style="margin-top:16px;font-size:13px;color:#6b7280;">
        Sign in at <a href="https://console.cloud.google.com/">Google Cloud Console</a> using the email and password above.
      </p>
    </div>
  `;
}

export async function sendCredentialsEmail({ request, users }) {
  const emailStatus = getResendConfigStatus();
  const portalSession = await createManagePortalSession(request);
  const portalBase = await resolvePortalBaseUrl({ portalBaseUrl: request.portalBaseUrl });
  const portalUrl = `${portalBase}/manage-users/gcp?token=${portalSession.token}`;

  if (!emailStatus.configured) {
    console.log(
      `[gcp email] Credentials ready for ${request.customerEmail} (${users?.length || 0} users)`
    );
    return {
      sent: false,
      reason: 'Email provider not configured',
      portalUrl,
      portalSession,
    };
  }

  await sendMailWithRetry({
    to: request.customerEmail,
    subject: `GCP Lab credentials — ${request.projectName || request.requestName || 'Racko Lab'}`,
    html: buildCredentialsHtml({ request, users, portalUrl, portalSession }),
    text: `Your GCP lab credentials are ready. Manage portal: ${portalUrl}. Admin login: ${portalSession.username} / ${portalSession.password}`,
  });

  return { sent: true, portalUrl, portalSession };
}
