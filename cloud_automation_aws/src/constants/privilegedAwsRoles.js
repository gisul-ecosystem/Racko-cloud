/**
 * Curated AWS privileged IAM packs (AdministratorAccess / account root excluded).
 * Analogous to Azure Contributor / UAA / RBAC Admin / Reservations Admin.
 */
export const PRIVILEGED_AWS_ROLES = [
  {
    key: 'power_user',
    name: 'Power User',
    description:
      'Broad service access similar to Azure Contributor (PowerUserAccess). Cannot manage IAM users/roles.',
    managedPolicyArn: 'arn:aws:iam::aws:policy/PowerUserAccess',
  },
  {
    key: 'iam_access_admin',
    name: 'IAM Access Administrator',
    description:
      'Manage IAM users, groups, roles, and policies within the lab account (similar to Azure User Access / RBAC Admin).',
    managedPolicyArn: 'arn:aws:iam::aws:policy/IAMFullAccess',
  },
  {
    key: 'billing_read_only',
    name: 'Billing Read Only',
    description: 'View billing and cost data (AWSBillingReadOnlyAccess).',
    managedPolicyArn: 'arn:aws:iam::aws:policy/AWSBillingReadOnlyAccess',
  },
  {
    key: 'support_access',
    name: 'Support Access',
    description: 'Create and manage AWS Support cases (AWSSupportAccess).',
    managedPolicyArn: 'arn:aws:iam::aws:policy/AWSSupportAccess',
  },
];

const BY_KEY = new Map(PRIVILEGED_AWS_ROLES.map((role) => [role.key, role]));
const BY_NAME = new Map(
  PRIVILEGED_AWS_ROLES.map((role) => [role.name.toLowerCase(), role])
);

export function listPrivilegedAwsRoles() {
  return PRIVILEGED_AWS_ROLES.map((role) => ({
    key: role.key,
    name: role.name,
    description: role.description,
    managedPolicyArn: role.managedPolicyArn,
  }));
}

export function resolvePrivilegedAwsRole(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    const err = new Error('awsRole is required.');
    err.statusCode = 400;
    throw err;
  }

  if (raw.toLowerCase() === 'administratoraccess' || raw.toLowerCase() === 'administrator') {
    const err = new Error('AdministratorAccess is not allowed for privileged role requests.');
    err.statusCode = 400;
    throw err;
  }

  const role =
    BY_KEY.get(raw) ||
    BY_NAME.get(raw.toLowerCase()) ||
    PRIVILEGED_AWS_ROLES.find((entry) => entry.managedPolicyArn === raw);

  if (!role) {
    const err = new Error(`"${raw}" is not an allowed privileged AWS role.`);
    err.statusCode = 400;
    throw err;
  }

  return role;
}

export function privilegedInlinePolicyName(roleKey) {
  const safe = String(roleKey || 'role')
    .replace(/[^a-zA-Z0-9+=,.@_-]/g, '-')
    .slice(0, 64);
  return `RackoPrivileged-${safe}`.slice(0, 128);
}
