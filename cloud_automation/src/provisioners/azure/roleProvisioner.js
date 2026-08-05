const crypto = require('crypto');
const { AuthorizationManagementClient } = require('@azure/arm-authorization');
const { createAzureCredential, validateAzureEnv } = require('../../config/azure');

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const ROLE_DEFINITION_CACHE_TTL_MS = 30 * 60 * 1000;

/** Per-subscription map of normalized roleName → definition (or null if not found). */
const roleDefinitionCacheBySubscription = new Map();
const roleDefinitionInflightByKey = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logAzureRoleEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'azure-role-provisioner',
    level,
    event,
    ...details
  };

  const message = JSON.stringify(entry);

  if (level === 'error') {
    console.error(message);
    return;
  }

  // High-volume / expected under load — keep out of default console noise.
  if (
    event === 'azure_role_assign_retry' ||
    event === 'key_vault_permissions_assigned' ||
    event === 'resource_scoped_role_assigned' ||
    event === 'resource_scoped_permissions_no_resources'
  ) {
    return;
  }

  console.log(message);
};

const isRetryableError = (error) => {
  const statusCode = Number(error?.statusCode || error?.status);
  const errorCode = String(error?.code || '').toUpperCase();

  return (
    RETRYABLE_STATUS_CODES.has(statusCode) ||
    ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'REQUESTTIMEOUT'].includes(errorCode)
  );
};

const normalizeRoleName = (value) => String(value || '').trim().toLowerCase();

const escapeODataString = (value) => String(value || '').replace(/'/g, "''");

const createAuthorizationClient = () => {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);

  return {
    authorizationClient: new AuthorizationManagementClient(credential, azureConfig.subscriptionId),
    subscriptionId: azureConfig.subscriptionId
  };
};

const buildResourceGroupScope = (subscriptionId, resourceGroupName) => {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;
};

const roleAssignmentIdFromSeed = (seed) => {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const chars = hash.slice(0, 32).split('');

  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);

  return [
    chars.slice(0, 8).join(''),
    chars.slice(8, 12).join(''),
    chars.slice(12, 16).join(''),
    chars.slice(16, 20).join(''),
    chars.slice(20, 32).join('')
  ].join('-');
};

const extractSubscriptionId = (scope) => {
  const match = String(scope || '').match(/^\/subscriptions\/([^/]+)/i);
  return match?.[1] || null;
};

const getOrCreateSubscriptionCache = (subscriptionId) => {
  const existing = roleDefinitionCacheBySubscription.get(subscriptionId);
  if (existing && existing.expiresAt > Date.now()) {
    return existing;
  }

  const fresh = {
    map: new Map(),
    expiresAt: Date.now() + ROLE_DEFINITION_CACHE_TTL_MS
  };
  roleDefinitionCacheBySubscription.set(subscriptionId, fresh);
  return fresh;
};

/**
 * Resolve one role definition by name using an OData filter (1 result), not a full list.
 * Cached per subscription for 30 minutes — critical for 48–500 user Assigning Access.
 */
const findMatchingRoleDefinition = async (authorizationClient, scope, roleName) => {
  const subscriptionId = extractSubscriptionId(scope);
  const normalized = normalizeRoleName(roleName);
  if (!subscriptionId || !normalized) {
    return null;
  }

  const cache = getOrCreateSubscriptionCache(subscriptionId);
  if (cache.map.has(normalized)) {
    return cache.map.get(normalized);
  }

  const inflightKey = `${subscriptionId}:${normalized}`;
  const existingInflight = roleDefinitionInflightByKey.get(inflightKey);
  if (existingInflight) {
    return existingInflight;
  }

  const loadPromise = (async () => {
    const listScope = `/subscriptions/${subscriptionId}`;
    const filter = `roleName eq '${escapeODataString(String(roleName).trim())}'`;
    let match = null;

    for await (const roleDefinition of authorizationClient.roleDefinitions.list(listScope, {
      filter
    })) {
      if (normalizeRoleName(roleDefinition.roleName) === normalized) {
        match = roleDefinition;
        break;
      }
    }

    cache.map.set(normalized, match);
    return match;
  })();

  roleDefinitionInflightByKey.set(inflightKey, loadPromise);

  try {
    return await loadPromise;
  } finally {
    roleDefinitionInflightByKey.delete(inflightKey);
  }
};

/**
 * Warm cache for many role names in parallel (filtered lookups).
 */
const loadRoleDefinitionsForSubscription = async (authorizationClient, subscriptionId, roleNames = []) => {
  const names = [...new Set((roleNames || []).map((n) => String(n || '').trim()).filter(Boolean))];
  const scope = `/subscriptions/${subscriptionId}`;

  await Promise.all(
    names.map((roleName) => findMatchingRoleDefinition(authorizationClient, scope, roleName))
  );

  return getOrCreateSubscriptionCache(subscriptionId).map;
};

const createRoleAssignmentWithRetry = async (
  authorizationClient,
  scope,
  assignmentId,
  parameters,
  requestId
) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await authorizationClient.roleAssignments.create(scope, assignmentId, parameters);
    } catch (error) {
      lastError = error;

      // Already exists — treat as success without retry noise.
      if (
        Number(error?.statusCode || error?.status) === 409 ||
        String(error?.code || '').toLowerCase() === 'roleassignmentexists'
      ) {
        return null;
      }

      if (attempt === MAX_ATTEMPTS || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = 400 * 2 ** (attempt - 1);

      logAzureRoleEvent('info', 'azure_role_assign_retry', {
        requestId,
        scope,
        assignmentId,
        attempt,
        nextDelayMs: delayMs,
        errorName: error?.name,
        errorCode: error?.code,
        statusCode: error?.statusCode || error?.status,
        message: error?.message
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
};

const getExistingAzureAssignment = async (authorizationClient, scope, assignmentId) => {
  try {
    return await authorizationClient.roleAssignments.get(scope, assignmentId);
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status);

    if (statusCode === 404) {
      return null;
    }

    throw error;
  }
};

module.exports = {
  buildResourceGroupScope,
  createAuthorizationClient,
  createRoleAssignmentWithRetry,
  findMatchingRoleDefinition,
  getExistingAzureAssignment,
  loadRoleDefinitionsForSubscription,
  logAzureRoleEvent,
  roleAssignmentIdFromSeed
};
