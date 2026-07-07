const normalizeForMatch = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildUsernamePatterns = (username) => {
  const localPart = String(username || '').split('@')[0];
  const normalized = normalizeForMatch(localPart);

  if (!normalized) {
    return [];
  }

  const patterns = [normalized];

  const digitSuffix = localPart.match(/(\d+)\s*$/);
  if (digitSuffix) {
    patterns.push(`user${digitSuffix[1]}`, `u${digitSuffix[1]}`, `azureuser${digitSuffix[1]}`);
  }

  return [...new Set(patterns.filter(Boolean))];
};

const buildUserNumberPatterns = (userNumber) => {
  const userNum = Number(userNumber);

  if (!Number.isInteger(userNum) || userNum <= 0) {
    return [];
  }

  return [`user${userNum}`, `u${userNum}`, `azureuser${userNum}`];
};

const resourceNameMatchesPatterns = (resourceName, patterns) => {
  if (!resourceName || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => {
    const index = resourceName.indexOf(pattern);
    if (index === -1) {
      return false;
    }

    const nextChar = resourceName[index + pattern.length];
    return !nextChar || !/[0-9]/.test(nextChar);
  });
};

const resourceBelongsToUser = (resource, { entraObjectId, username, userNumber } = {}) => {
  const tags = resource?.tags || {};

  if (
    entraObjectId &&
    (tags.racko_owner === entraObjectId || tags.created_by === entraObjectId)
  ) {
    return true;
  }

  const resourceName = normalizeForMatch(resource?.name);
  if (!resourceName) {
    return false;
  }

  const patterns = [
    ...buildUsernamePatterns(username),
    ...buildUserNumberPatterns(userNumber)
  ];

  return resourceNameMatchesPatterns(resourceName, patterns);
};

const filterResourcesForUser = (resources, ownership) =>
  (resources || []).filter((resource) => resourceBelongsToUser(resource, ownership));

const VM_RESOURCE_TYPE = 'microsoft.compute/virtualmachines';

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isDeploymentSibling = (resourceName, vmName) => {
  if (!resourceName || !vmName) {
    return false;
  }

  if (resourceName.toLowerCase() === vmName.toLowerCase()) {
    return true;
  }

  const pattern = new RegExp(`^${escapeRegExp(vmName)}\\d*([-_]|$)`, 'i');
  return pattern.test(resourceName);
};

/**
 * Expands a matched resource set to include NICs, disks, NSGs, etc. created
 * alongside a matched VM (e.g. azureuser12936_z1 for VM azureuser12).
 */
const expandDeploymentResources = (allResources, matchedResources) => {
  const expanded = new Map();

  for (const resource of matchedResources || []) {
    if (resource?.id) {
      expanded.set(resource.id, resource);
    }
  }

  const matchedVms = (matchedResources || []).filter(
    (resource) => String(resource.type || '').toLowerCase() === VM_RESOURCE_TYPE
  );

  if (!matchedVms.length) {
    return [...expanded.values()];
  }

  for (const resource of allResources || []) {
    if (!resource?.id || expanded.has(resource.id)) {
      continue;
    }

    if (matchedVms.some((vm) => isDeploymentSibling(resource.name, vm.name))) {
      expanded.set(resource.id, resource);
    }
  }

  return [...expanded.values()];
};

module.exports = {
  normalizeForMatch,
  resourceBelongsToUser,
  filterResourcesForUser,
  expandDeploymentResources,
  isDeploymentSibling
};
