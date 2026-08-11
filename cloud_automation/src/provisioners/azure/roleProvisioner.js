const crypto = require('crypto');
const { AuthorizationManagementClient } = require('@azure/arm-authorization');
const { createAzureCredential, validateAzureEnv } = require('../../config/azure');

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const ROLE_DEFINITION_CACHE_TTL_MS = 30 * 60 * 1000;
/** Azure hard limit — total RBAC assignments across all scopes in one subscription. */
const SUBSCRIPTION_ROLE_ASSIGNMENT_LIMIT = 4000;
const RG_ROLE_ASSIGNMENT_LIMIT = 400;
const SUBSCRIPTION_COUNT_CACHE_TTL_MS = 30 * 1000;

const subscriptionAssignmentCountCache = new Map();

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

const isRoleAssignmentLimitError = (error) => {
  const code = String(error?.code || error?.details?.error?.code || '').toLowerCase();
  return code === 'roleassignmentlimitexceeded';
};

const isSubscriptionRoleLimitError = (error) =>
  isRoleAssignmentLimitError(error) &&
  (String(error?.limitKind || '') === 'subscription' ||
    String(error?.message || '')
      .toLowerCase()
      .includes('subscription role assignment quota exhausted'));

const extractResourceGroupName = (scope) => {
  const match = String(scope || '').match(/\/resourceGroups\/([^/]+)/i);
  return match?.[1] || null;
};

const countRoleAssignmentsForScope = async (authorizationClient, scope, stopAt = Infinity) => {
  let count = 0;
  for await (const _ of authorizationClient.roleAssignments.listForScope(scope)) {
    count += 1;
    if (count >= stopAt) {
      break;
    }
  }
  return count;
};

const getSubscriptionAssignmentCount = async (authorizationClient, subscriptionId) => {
  const cached = subscriptionAssignmentCountCache.get(subscriptionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }

  const count = await countRoleAssignmentsForScope(
    authorizationClient,
    `/subscriptions/${subscriptionId}`,
    SUBSCRIPTION_ROLE_ASSIGNMENT_LIMIT + 1
  );
  subscriptionAssignmentCountCache.set(subscriptionId, {
    count,
    expiresAt: Date.now() + SUBSCRIPTION_COUNT_CACHE_TTL_MS
  });
  return count;
};

const invalidateSubscriptionAssignmentCountCache = (subscriptionId) => {
  subscriptionAssignmentCountCache.delete(subscriptionId);
};

const buildRoleAssignmentLimitError = async (
  authorizationClient,
  scope,
  rawError,
  options = {}
) => {
  const subscriptionId = extractSubscriptionId(scope);
  const rgName = extractResourceGroupName(scope);
  const limitError = new Error('');
  limitError.statusCode = 400;
  limitError.code = 'RoleAssignmentLimitExceeded';
  limitError.limitKind = 'unknown';

  if (!subscriptionId) {
    limitError.message = rawError?.message || 'Azure role assignment limit reached.';
    return limitError;
  }

  const subCount = await getSubscriptionAssignmentCount(authorizationClient, subscriptionId);

  if (subCount >= SUBSCRIPTION_ROLE_ASSIGNMENT_LIMIT) {
    limitError.limitKind = 'subscription';
    limitError.message =
      `Azure subscription role assignment quota exhausted (${subCount}+ of ${SUBSCRIPTION_ROLE_ASSIGNMENT_LIMIT} total across all scopes). ` +
      'New labs cannot assign access until headroom is freed — delete failed or unused lab requests from the Racko portal (org admin delete), which removes that lab’s resource groups and their role assignments. ' +
      'Do not bulk-delete subscription-wide roles in Azure Portal.';
    return limitError;
  }

  if (rgName) {
    const rgCount = await countRoleAssignmentsForScope(
      authorizationClient,
      scope,
      RG_ROLE_ASSIGNMENT_LIMIT + 1
    );
    if (rgCount >= RG_ROLE_ASSIGNMENT_LIMIT) {
      limitError.limitKind = 'resource_group';
      const sharedHint = options.isSharedLab
        ? ' For large shared labs, enable group-based RBAC (Graph Group.ReadWrite.All) or use per-user resource groups.'
        : '';
      limitError.message =
        `Azure role assignment limit reached for resource group ${rgName} (${rgCount}+ of ${RG_ROLE_ASSIGNMENT_LIMIT} at this scope).${sharedHint}`;
      return limitError;
    }
  }

  limitError.message =
    rawError?.message ||
    'Azure role assignment limit reached. Check subscription and resource group assignment counts in Azure Portal.';
  return limitError;
};

const assertSubscriptionRoleBudget = async (authorizationClient, subscriptionId) => {
  const count = await getSubscriptionAssignmentCount(authorizationClient, subscriptionId);
  if (count >= SUBSCRIPTION_ROLE_ASSIGNMENT_LIMIT) {
    const limitError = await buildRoleAssignmentLimitError(
      authorizationClient,
      `/subscriptions/${subscriptionId}`,
      { code: 'RoleAssignmentLimitExceeded' }
    );
    const err = new Error(limitError.message);
    err.statusCode = 400;
    err.code = 'RoleAssignmentLimitExceeded';
    err.limitKind = 'subscription';
    throw err;
  }

  if (count >= SUBSCRIPTION_ROLE_ASSIGNMENT_LIMIT - 200) {
    logAzureRoleEvent('warn', 'subscription_role_budget_low', {
      count,
      limit: SUBSCRIPTION_ROLE_ASSIGNMENT_LIMIT
    });
  }

  return count;
};

const normalizeRoleName = (value) => String(value || '').trim().toLowerCase();

/** Catalog names that are not real Azure built-in role names. */
const ROLE_NAME_ALIASES = new Map([
  // Azure has Network Contributor, but no built-in "Network Reader".
  ['network reader', 'Reader']
]);

const resolveRoleNameCandidates = (roleName) => {
  const trimmed = String(roleName || '').trim();
  if (!trimmed) return [];

  const candidates = [trimmed];
  const alias = ROLE_NAME_ALIASES.get(normalizeRoleName(trimmed));
  if (alias && normalizeRoleName(alias) !== normalizeRoleName(trimmed)) {
    candidates.push(alias);
  }
  return candidates;
};

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
    let match = null;

    for (const candidate of resolveRoleNameCandidates(roleName)) {
      const candidateNormalized = normalizeRoleName(candidate);
      const filter = `roleName eq '${escapeODataString(candidate)}'`;

      for await (const roleDefinition of authorizationClient.roleDefinitions.list(listScope, {
        filter
      })) {
        if (normalizeRoleName(roleDefinition.roleName) === candidateNormalized) {
          match = roleDefinition;
          break;
        }
      }

      if (match) {
        if (candidateNormalized !== normalized) {
          logAzureRoleEvent('info', 'azure_role_name_aliased', {
            requestedRole: String(roleName).trim(),
            resolvedRole: match.roleName
          });
        }
        break;
      }
    }

    // Cache hits only — caching misses permanently blocked recovery after catalog/alias fixes.
    if (match) {
      cache.map.set(normalized, match);
    }
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
  requestId,
  options = {}
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
        if (isRoleAssignmentLimitError(error)) {
          throw await buildRoleAssignmentLimitError(authorizationClient, scope, error, options);
        }
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
  SUBSCRIPTION_ROLE_ASSIGNMENT_LIMIT,
  RG_ROLE_ASSIGNMENT_LIMIT,
  buildResourceGroupScope,
  createAuthorizationClient,
  createRoleAssignmentWithRetry,
  findMatchingRoleDefinition,
  getExistingAzureAssignment,
  loadRoleDefinitionsForSubscription,
  logAzureRoleEvent,
  roleAssignmentIdFromSeed,
  countRoleAssignmentsForScope,
  getSubscriptionAssignmentCount,
  invalidateSubscriptionAssignmentCountCache,
  assertSubscriptionRoleBudget,
  buildRoleAssignmentLimitError,
  isRoleAssignmentLimitError: (error) => isRoleAssignmentLimitError(error),
  isSubscriptionRoleLimitError: (error) => isSubscriptionRoleLimitError(error)
};
