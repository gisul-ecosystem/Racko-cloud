/** Built-in Azure privileged RBAC roles assignable via org-admin (Owner excluded). */
const PRIVILEGED_AZURE_ROLES = [
  { name: 'Contributor', definitionId: 'b24988ac-6180-42a0-ab88-20f7382dd24c' },
  {
    name: 'User Access Administrator',
    definitionId: '18d7d88d-d35e-4fb5-a5c3-7773c0df55f5'
  },
  {
    name: 'Role Based Access Control Administrator',
    definitionId: '62a82d94-763b-4b82-8ec9-3895558c557b'
  },
  {
    name: 'Reservations Administrator',
    definitionId: '749f88d5-cbae-401f-8a62-7073438777ec'
  }
];

const PRIVILEGED_ROLE_NAMES = new Set(PRIVILEGED_AZURE_ROLES.map((role) => role.name.toLowerCase()));

const isPrivilegedAzureRole = (roleName) =>
  PRIVILEGED_ROLE_NAMES.has(String(roleName || '').trim().toLowerCase());

const assertPrivilegedAzureRole = (roleName) => {
  const normalized = String(roleName || '').trim();

  if (!normalized) {
    throw new Error('azureRole is required.');
  }

  if (normalized.toLowerCase() === 'owner') {
    throw new Error('Owner is not allowed for privileged role requests.');
  }

  if (!isPrivilegedAzureRole(normalized)) {
    throw new Error(`"${normalized}" is not an allowed privileged Azure role.`);
  }

  return PRIVILEGED_AZURE_ROLES.find(
    (role) => role.name.toLowerCase() === normalized.toLowerCase()
  ).name;
};

module.exports = {
  PRIVILEGED_AZURE_ROLES,
  assertPrivilegedAzureRole,
  isPrivilegedAzureRole
};
