const crypto = require('crypto');
const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const adminAuthService = require('./adminAuthService');
const { createGraphClient, getVerifiedDomain } = require('../provisioners/azure/userProvisioner');
const { validateAzureEnv } = require('../config/azure');
const {
  buildResourceGroupScope,
  createAuthorizationClient,
  createRoleAssignmentWithRetry,
  findMatchingRoleDefinition,
  getExistingAzureAssignment,
  logAzureRoleEvent,
  roleAssignmentIdFromSeed
} = require('../provisioners/azure/roleProvisioner');
const {
  getResourceGroupNameForUser,
  getResourceGroupNamesForCleanup
} = require('./userResourceGroupService');
const { getUsersForRequest } = require('./userProvisionService');
const { getUserRoleAssignmentsForRequest } = require('./roleProvisionService');
const {
  createCleanupClients,
  startResourceGroupDeletion
} = require('../provisioners/azure/cleanupProvisioner');
const { deleteUserBudget } = require('../provisioners/azure/azureBudgetProvisioner');
const {
  getCustomRoleAssignmentsForRequest,
  revokeCustomRoleAssignment
} = require('./customRoleService');
const usageService = require('./usageService');
const { requestHasUsageWindows } = require('./usageWindowAccessService');
const { runWithConcurrency } = require('../utils/concurrency');
const { getDeleteAzureConcurrency } = require('../utils/provisionConcurrency');

const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const normalizeRoles = (roles = []) =>
  Array.from(
    new Set(
      (Array.isArray(roles) ? roles : [])
        .map((role) => String(role || '').trim())
        .filter(Boolean)
    )
  );

const toDateOnlyString = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const logManagePortalEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'manage-portal',
    level,
    event,
    ...details
  };

  const message = JSON.stringify(entry);

  if (level === 'error') {
    console.error(message);
    return;
  }

  console.log(message);
};

/**
 * Safe insert helper - inspects schema dynamically and inserts only existing columns
 * Never throws errors - returns boolean success indicator
 */
const safeInsert = async (client, tableName, data) => {
  try {
    // Get table columns
    const schemaResult = await client.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
      `,
      [tableName]
    );

    const availableColumns = schemaResult.rows.map((row) => row.column_name);

    if (availableColumns.length === 0) {
      logManagePortalEvent('error', 'safe_insert_no_columns', {
        tableName,
        reason: 'Table not found or has no columns'
      });
      return false;
    }

    // Filter data to only include existing columns
    const insertData = {};
    for (const [key, value] of Object.entries(data)) {
      if (availableColumns.includes(key)) {
        insertData[key] = value;
      }
    }

    if (Object.keys(insertData).length === 0) {
      logManagePortalEvent('error', 'safe_insert_no_matching_columns', {
        tableName,
        requestedColumns: Object.keys(data),
        availableColumns
      });
      return false;
    }

    // Build dynamic INSERT query
    const columns = Object.keys(insertData);
    const values = Object.values(insertData);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const columnList = columns.join(', ');

    const query = `
      INSERT INTO ${tableName} (${columnList})
      VALUES (${placeholders})
    `;

    await client.query(query, values);
    return true;
  } catch (error) {
    logManagePortalEvent('error', 'safe_insert_failed', {
      tableName,
      message: error?.message,
      code: error?.code
    });
    return false;
  }
};

/**
 * Record audit log - ALWAYS executes outside transaction context
 * If called within failed transaction, uses separate client
 */
const recordAuditLog = async (
  client,
  { requestId = null, customerEmail = null, actor = 'customer', action, targetUserId = null, details = null }
) => {
  // If transaction is in error state, use new client
  let effectiveClient = client;
  let shouldRelease = false;

  try {
    // Test if client transaction is aborted
    if (client && client.query) {
      try {
        await client.query('SELECT 1');
      } catch (testError) {
        if (testError?.message?.includes('aborted')) {
          // Transaction aborted, use new client
          effectiveClient = await db.connect();
          shouldRelease = true;
          logManagePortalEvent('info', 'audit_log_using_new_client', {
            reason: 'Previous transaction aborted'
          });
        }
      }
    }

    const success = await safeInsert(effectiveClient, 'access_portal_audit_logs', {
      request_id: requestId,
      customer_email: customerEmail,
      actor,
      action,
      target_user_id: targetUserId,
      details: details ? JSON.stringify(details) : null
    });

    if (!success) {
      logManagePortalEvent('error', 'audit_log_skipped', {
        requestId,
        action,
        reason: 'Safe insert failed'
      });
    }
  } catch (error) {
    logManagePortalEvent('error', 'audit_log_write_failed', {
      requestId,
      customerEmail,
      actor,
      action,
      targetUserId,
      message: error?.message
    });
  } finally {
    if (shouldRelease && effectiveClient) {
      effectiveClient.release();
    }
  }
};

/**
 * Record cleanup log - Never breaks transaction
 * Maps event_name to event if column doesn't exist
 */
const recordCleanupLog = async (client, { requestId, eventName, logLevel, message, details = null }) => {
  try {
    // Try to determine which column exists: event_name or event
    const columnCheckResult = await client.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'cleanup_logs'
        AND column_name IN ('event_name', 'event')
      `,
      []
    );

    const hasEventName = columnCheckResult.rows.some((row) => row.column_name === 'event_name');
    const hasEvent = columnCheckResult.rows.some((row) => row.column_name === 'event');

    const data = {
      request_id: requestId,
      log_level: logLevel,
      message,
      details_json: details ? JSON.stringify(details) : null
    };

    // Map eventName to appropriate column
    if (hasEventName) {
      data.event_name = eventName;
    } else if (hasEvent) {
      data.event = eventName;
    }

    const success = await safeInsert(client, 'cleanup_logs', data);

    if (!success) {
      logManagePortalEvent('error', 'cleanup_log_skipped', {
        requestId,
        eventName,
        reason: 'Safe insert failed'
      });
    }
  } catch (error) {
    // Never throw - just log
    logManagePortalEvent('error', 'cleanup_log_write_failed', {
      requestId,
      eventName,
      message: error?.message
    });
  }
};

const getRequestContext = async (requestId) => {
  const queryWithPortal = `
    SELECT
      r.id,
      r.customer_email,
      r.expiry_date,
      r.status,
      r.racko_user_id,
      r.portal_base_url,
      COUNT(u.id) AS user_count
    FROM requests r
    LEFT JOIN azure_users u
      ON u.request_id = r.id
      AND COALESCE(u.is_deleted, false) = false
    WHERE r.id = $1
    GROUP BY r.id
    LIMIT 1
  `;

  const queryFallback = `
    SELECT
      r.id,
      r.customer_email,
      r.expiry_date,
      r.status,
      r.racko_user_id,
      COUNT(u.id) AS user_count
    FROM requests r
    LEFT JOIN azure_users u
      ON u.request_id = r.id
      AND COALESCE(u.is_deleted, false) = false
    WHERE r.id = $1
    GROUP BY r.id
    LIMIT 1
  `;

  let result;
  try {
    result = await db.query(queryWithPortal, [requestId]);
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.includes('portal_base_url')) {
      throw error;
    }
    result = await db.query(queryFallback, [requestId]);
  }

  if (!result.rows.length) {
    return null;
  }

  return result.rows[0];
};

const getRequestResourceGroupName = async (requestId) => {
  const result = await db.query(
    `
      SELECT azure_resource_group_name
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  return result.rows[0]?.azure_resource_group_name || null;
};

const getPortalSessionByToken = async (sessionToken) => {
  const sessionHash = sha256Hex(sessionToken);
  const result = await db.query(
    `
      SELECT
        aps.id AS session_id,
        aps.token_id,
        aps.request_id,
        aps.customer_email,
        aps.expires_at,
        aps.revoked,
        COALESCE(aps.actor_type, 'admin') AS actor_type,
        aps.user_id,
        aps.admin_id,
        apt.used
      FROM access_portal_sessions aps
      INNER JOIN access_portal_tokens apt
        ON apt.id = aps.token_id
      WHERE aps.session_hash = $1
        AND aps.revoked = false
        AND aps.expires_at > NOW()
    `,
    [sessionHash]
  );

  return result.rows[0] || null;
};

const normalizeLoginId = (value) => String(value || '').trim().toLowerCase();

const assertManagePortalUserAccessAllowed = (user, messagePrefix = 'This account') => {
  if (user.blocked_until && new Date(user.blocked_until).getTime() > Date.now()) {
    throw new AppError(`${messagePrefix} is temporarily blocked from portal access.`, 403);
  }

  if (user.blocked_reason === 'admin_block' || user.azure_account_enabled === false) {
    throw new AppError(`${messagePrefix} is blocked and cannot sign in.`, 403);
  }

  const normalizedStatus = String(user.status || '').trim().toLowerCase();
  if (normalizedStatus === 'disabled') {
    throw new AppError(`${messagePrefix} is blocked and cannot sign in.`, 403);
  }

  if (normalizedStatus === 'blocked' && user.azure_account_enabled === false) {
    throw new AppError(`${messagePrefix} is blocked and cannot sign in.`, 403);
  }
};

const findAzureUserForPortalLogin = async ({ requestId, loginId }) => {
  const scopedResult = await db.query(
    `
      SELECT
        id,
        request_id,
        azure_user_id,
        username,
        temporary_password,
        status,
        blocked_until,
        blocked_reason,
        azure_account_enabled,
        COALESCE(is_deleted, false) AS is_deleted
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
        AND (
          lower(username) = $2
          OR lower(azure_user_id) = $2
        )
      LIMIT 1
    `,
    [requestId, loginId]
  );

  if (scopedResult.rows[0]) {
    return scopedResult.rows[0];
  }

  const globalResult = await db.query(
    `
      SELECT
        id,
        request_id,
        azure_user_id,
        username,
        temporary_password,
        status,
        blocked_until,
        blocked_reason,
        azure_account_enabled,
        COALESCE(is_deleted, false) AS is_deleted
      FROM azure_users
      WHERE COALESCE(is_deleted, false) = false
        AND (
          lower(username) = $1
          OR lower(azure_user_id) = $1
        )
      LIMIT 1
    `,
    [loginId]
  );

  return globalResult.rows[0] || null;
};

const verifyAzureUserCredentials = async ({ requestId, username, password }) => {
  const loginId = normalizeLoginId(username);

  if (!loginId || !password) {
    throw new AppError('Username and password are required.', 400);
  }

  const user = await findAzureUserForPortalLogin({ requestId, loginId });

  if (!user || String(user.temporary_password) !== String(password)) {
    throw new AppError('Invalid username or password.', 401);
  }

  assertManagePortalUserAccessAllowed(user);

  return {
    id: user.id,
    requestId: user.request_id,
    azureUserId: user.azure_user_id,
    username: user.username
  };
};

const resolvePortalActor = async ({ requestId, customerEmail, username, password }) => {
  try {
    const admin = await adminAuthService.verifyAdminCredentials({
      email: customerEmail,
      username,
      password
    });

    return {
      actorType: 'admin',
      adminId: admin.id,
      userId: null,
      admin
    };
  } catch (adminError) {
    try {
      const azureUser = await verifyAzureUserCredentials({
        requestId,
        username,
        password
      });

      return {
        actorType: 'user',
        adminId: null,
        userId: azureUser.id,
        admin: null,
        azureUser
      };
    } catch (azureError) {
      if (azureError instanceof AppError && azureError.statusCode === 403) {
        throw azureError;
      }

      throw new AppError('Invalid username or password.', 401);
    }
  }
};

const assertAdminPortalSession = (session) => {
  const actorType = session?.actor_type || 'admin';

  if (actorType !== 'admin') {
    throw new AppError('Admin access is required for this action.', 403);
  }
};

const assertSelfOrAdminPortalSession = (session, targetUserId) => {
  const actorType = session?.actor_type || 'admin';

  if (actorType === 'admin') {
    return;
  }

  if (actorType === 'user' && String(session.user_id) === String(targetUserId)) {
    return;
  }

  throw new AppError('You can only access your own account.', 403);
};

const requireSession = async (sessionToken) => {
  const token = String(sessionToken || '').trim();

  if (!token) {
    throw new AppError('Access session is required.', 401);
  }

  const session = await getPortalSessionByToken(token);

  if (!session) {
    throw new AppError('Access session is invalid or expired.', 401);
  }

  return session;
};

const validateSessionForRequest = (session, requestId) => {
  if (String(session.request_id) !== String(requestId)) {
    throw new AppError('Access session does not match this request.', 403);
  }
};

const resolveFrontendBaseUrl = () => {
  const baseUrl = String(
    process.env.FRONTEND_URL || process.env.CLIENT_PORTAL_URL || 'http://localhost:3000'
  )
    .trim()
    .replace(/\/+$/, '');

  if (!baseUrl) {
    throw new AppError(
      'FRONTEND_URL is not configured. Set FRONTEND_URL to the client portal base URL (for example http://localhost:3000).',
      500
    );
  }

  try {
    const parsed = new URL(baseUrl);
    if (!parsed.protocol || !parsed.host) {
      throw new Error('invalid url');
    }
  } catch {
    throw new AppError(
      'FRONTEND_URL must be a valid absolute URL (for example http://localhost:3000).',
      500
    );
  }

  return baseUrl;
};

const buildManageUrl = async (token, request = null) => {
  const { resolvePortalBaseUrl } = require('../utils/frontendUrl');
  const baseUrl = await resolvePortalBaseUrl({
    portalBaseUrl: request?.portal_base_url,
    ownerId: request?.racko_user_id
  }).catch(() => resolveFrontendBaseUrl());

  return `${baseUrl}/manage-users?token=${encodeURIComponent(token)}`;
};

const getManageUsersForRequest = async (client, requestId) => {
  const usersResult = await client.query(
    `
      SELECT
        u.id,
        u.azure_user_id,
        u.username,
        u.status,
        u.created_at,
        r.expiry_date
      FROM azure_users u
      LEFT JOIN requests r
        ON r.id = u.request_id
      WHERE u.request_id = $1
      ORDER BY u.created_at DESC
    `,
    [requestId]
  );

  const rolesResult = await client.query(
    `
      SELECT
        ura.user_id,
        ura.azure_role,
        ura.scope
      FROM user_role_assignments ura
      WHERE ura.request_id = $1
      ORDER BY ura.created_at ASC
    `,
    [requestId]
  );

  const rolesByUserId = new Map();

  for (const row of rolesResult.rows) {
    const userId = String(row.user_id);
    const current = rolesByUserId.get(userId) || [];
    current.push({
      role: row.azure_role,
      scope: row.scope
    });
    rolesByUserId.set(userId, current);
  }

  return usersResult.rows.map((row) => ({
    id: row.id,
    username: row.username,
    azureUserId: row.azure_user_id,
    status: row.status,
    expiryDate: toDateOnlyString(row.expiry_date),
    roles: rolesByUserId.get(String(row.id)) || []
  }));
};

const issueAccessPortalTokenForRequest = async (requestId) => {
  const request = await getRequestContext(requestId);

  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  const rawToken = crypto.randomUUID();
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
  const adminCredentials = await adminAuthService.issueTemporaryAdminCredentials({
    email: request.customer_email,
    name: request.customer_email
  });

  const tokenInsert = `
    INSERT INTO access_portal_tokens(
      id,
      request_id,
      customer_email,
      token_hash,
      expires_at
    )
    VALUES(
      gen_random_uuid(),
      $1,
      $2,
      $3,
      NOW() + INTERVAL '7 days'
    )
    RETURNING id
  `;

  await db.query(tokenInsert, [
    request.id,
    request.customer_email,
    tokenHash
  ]);

  // Record audit log using separate connection to ensure transaction safety
  try {
    const auditClient = await db.connect();
    try {
      await recordAuditLog(auditClient, {
        requestId,
        customerEmail: request.customer_email,
        actor: 'system',
        action: 'portal_token_issued',
        details: {
          expiresAt: expiresAt.toISOString()
        }
      });
    } finally {
      auditClient.release();
    }
  } catch (auditError) {
    logManagePortalEvent('error', 'audit_log_skipped', {
      requestId,
      action: 'portal_token_issued',
      reason: auditError?.message
    });
  }

  const manageUrl = await buildManageUrl(rawToken, request);

  logManagePortalEvent('info', 'portal_token_issued', {
    requestId,
    customerEmail: request.customer_email,
    expiresAt: expiresAt.toISOString()
  });

  return {
    requestId,
    customerEmail: request.customer_email,
    adminCredentials,
    resourceGroup: null,
    manageUrl,
    expiresAt
  };
};

const exchangeAccessToken = async (rawToken, credentials = {}) => {
  const token = String(rawToken || '').trim();

  if (!token) {
    throw new AppError('token is required.', 400);
  }

  const tokenHash = sha256Hex(token);
  const client = await db.connect();
  let transactionSuccess = false;
  let responseData = null;

  try {
    await client.query('BEGIN');

    const tokenResult = await client.query(
      `
        SELECT
          id,
          request_id,
          customer_email,
          expires_at,
          used
        FROM access_portal_tokens
        WHERE token_hash = $1
        FOR UPDATE
      `,
      [tokenHash]
    );

    const portalToken = tokenResult.rows[0] || null;

    if (!portalToken) {
      throw new AppError('Access link is invalid.', 401);
    }

    if (new Date(portalToken.expires_at).getTime() <= Date.now()) {
      throw new AppError('Access link has expired.', 401);
    }

    const actor = await resolvePortalActor({
      requestId: portalToken.request_id,
      customerEmail: portalToken.customer_email,
      username: credentials.username,
      password: credentials.password
    });

    const sessionRequestId =
      actor.actorType === 'user' && actor.azureUser?.requestId
        ? actor.azureUser.requestId
        : portalToken.request_id;

    const sessionToken = crypto.randomUUID();
    const sessionHash = sha256Hex(sessionToken);
    const sessionExpiresAt = new Date(portalToken.expires_at);

    if (!portalToken.used) {
      await client.query(
        `
          UPDATE access_portal_tokens
          SET used = true,
              used_at = NOW()
          WHERE id = $1
        `,
        [portalToken.id]
      );
    }

    await client.query(
      `
        INSERT INTO access_portal_sessions (
          id,
          token_id,
          request_id,
          customer_email,
          session_hash,
          expires_at,
          revoked,
          actor_type,
          user_id,
          admin_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9)
      `,
      [
        crypto.randomUUID(),
        portalToken.id,
        sessionRequestId,
        portalToken.customer_email,
        sessionHash,
        sessionExpiresAt,
        actor.actorType,
        actor.userId,
        actor.adminId
      ]
    );

    const resourceGroup = await getRequestResourceGroupName(sessionRequestId);
    const userId = actor.userId;

    responseData = {
      requestId: sessionRequestId,
      customerEmail: portalToken.customer_email,
      admin: actor.admin,
      azureUser: actor.azureUser || null,
      role: actor.actorType,
      resourceGroup,
      sessionToken,
      expiresAt: sessionExpiresAt,
      userId,
      adminId: actor.adminId,
      adminUsername: actor.admin?.username || null
    };

    await client.query('COMMIT');
    transactionSuccess = true;

    logManagePortalEvent('info', 'portal_token_consumed', {
      requestId: portalToken.request_id,
      customerEmail: portalToken.customer_email,
      userId,
      adminId: actor.adminId,
      role: actor.actorType
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Record audit log AFTER transaction completes (using separate connection)
  if (transactionSuccess && responseData) {
    try {
      const auditClient = await db.connect();
      try {
        await recordAuditLog(auditClient, {
          requestId: responseData.requestId,
          customerEmail: responseData.customerEmail,
          actor: 'customer',
          action: 'portal_token_consumed',
          details: {
            expiresAt: responseData.expiresAt.toISOString(),
            userId: responseData.userId,
            adminId: responseData.adminId,
            adminUsername: responseData.adminUsername,
            role: responseData.role
          }
        });
      } finally {
        auditClient.release();
      }
    } catch (auditError) {
      // Log but don't fail the operation
      logManagePortalEvent('error', 'audit_log_skipped', {
        requestId: responseData.requestId,
        action: 'portal_token_consumed',
        reason: auditError?.message
      });
    }
  }

  return {
    requestId: responseData.requestId,
    customerEmail: responseData.customerEmail,
    admin: responseData.admin,
    azureUser: responseData.azureUser,
    role: responseData.role,
    resourceGroup: responseData.resourceGroup,
    sessionToken: responseData.sessionToken,
    expiresAt: responseData.expiresAt,
    userId: responseData.userId
  };
};

const listPortalUsers = async (sessionToken, requestId) => {
  const session = await requireSession(sessionToken);
  validateSessionForRequest(session, requestId);

  const request = await getRequestContext(requestId);
  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  let users = await getManageUsersForRequest(db, requestId);

  if (session.actor_type === 'user' && session.user_id) {
    users = users.filter((user) => String(user.id) === String(session.user_id));
  }

  // Record audit log using separate connection to ensure transaction safety
  try {
    const auditClient = await db.connect();
    try {
      await recordAuditLog(auditClient, {
        requestId,
        customerEmail: session.customer_email,
        actor: 'customer',
        action: 'manage_request_loaded',
        details: {
          userCount: users.length
        }
      });
    } finally {
      auditClient.release();
    }
  } catch (auditError) {
    logManagePortalEvent('error', 'audit_log_skipped', {
      requestId,
      action: 'manage_request_loaded',
      reason: auditError?.message
    });
  }

  return {
    requestId: Number(requestId),
    role: session.actor_type || 'admin',
    users
  };
};

const getRequestPrimaryScope = async (client, requestId, userId = null) => {
  const resourceGroupName = userId
    ? await getResourceGroupNameForUser(requestId, userId)
    : await getRequestResourceGroupName(requestId);

  if (!resourceGroupName) {
    throw new AppError('Request does not have a provisioned resource group.', 400);
  }

  const { subscriptionId } = createAuthorizationClient();
  return buildResourceGroupScope(subscriptionId, String(resourceGroupName).trim());
};

const getPortalUserRecord = async (client, requestId, userId) => {
  const result = await client.query(
    `
      SELECT
        id,
        request_id,
        azure_user_id,
        username,
        status
      FROM azure_users
      WHERE request_id = $1
        AND id = $2
      LIMIT 1
    `,
    [requestId, userId]
  );

  return result.rows[0] || null;
};

const getPortalAssignmentsForUser = async (client, requestId, userId) => {
  const result = await client.query(
    `
      SELECT
        assignment_id,
        scope,
        azure_role
      FROM user_role_assignments
      WHERE request_id = $1
        AND user_id = $2
      ORDER BY created_at ASC
    `,
    [requestId, userId]
  );

  return result.rows;
};

const deleteAzureUserWithRetry = async (graphClient, azureUserId, requestId) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await graphClient.api(`/users/${encodeURIComponent(azureUserId)}`).delete();
      return true;
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.statusCode || error?.status);
      const errorCode = String(error?.code || '').toUpperCase();

      if (
        statusCode === 404 ||
        (attempt === MAX_ATTEMPTS &&
          !RETRYABLE_STATUS_CODES.has(statusCode) &&
          !['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'REQUESTTIMEOUT'].includes(errorCode))
      ) {
        if (statusCode === 404) {
          return false;
        }

        throw error;
      }

      const delayMs = 500 * 2 ** (attempt - 1);

      logAzureRoleEvent('info', 'portal_user_delete_retry', {
        requestId,
        azureUserId,
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

const deleteRoleAssignmentWithRetry = async (authorizationClient, scope, assignmentId, requestId) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await authorizationClient.roleAssignments.delete(scope, assignmentId);
      return true;
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.statusCode || error?.status);
      const errorCode = String(error?.code || '').toUpperCase();

      if (
        statusCode === 404 ||
        (attempt === MAX_ATTEMPTS &&
          !RETRYABLE_STATUS_CODES.has(statusCode) &&
          !['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'REQUESTTIMEOUT'].includes(errorCode))
      ) {
        if (statusCode === 404) {
          return false;
        }

        throw error;
      }

      const delayMs = 500 * 2 ** (attempt - 1);

      logAzureRoleEvent('info', 'portal_role_delete_retry', {
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

const revokeAssignmentsForUser = async (authorizationClient, assignments, requestId) => {
  for (const assignment of assignments) {
    await deleteRoleAssignmentWithRetry(authorizationClient, assignment.scope, assignment.assignment_id, requestId);
  }
};

const purgeRequestDatabaseRecords = async (requestId) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const requestScopedTables = [
      'processed_azure_signins',
      'request_service_roles',
      'request_services',
      'request_service_instances',
      'provisioned_service_resources',
      'request_custom_services',
      'custom_role_assignments',
      'request_usage_windows',
      'usage_enforcement_logs',
      'window_enforcement_logs',
      'user_usage_sessions',
      'user_role_assignments',
      'daily_usage_tracking',
      'resource_cleanup_logs',
      'cleanup_logs',
      'budget_exceeded_events',
      'lab_history_snapshots',
      'access_portal_sessions',
      'access_portal_tokens',
      'access_portal_audit_logs',
      'notifications',
      'request_user_resource_groups',
      'credential_delivery',
      'user_budget_spend',
      'azure_users'
    ];

    for (const table of requestScopedTables) {
      try {
        await client.query(`DELETE FROM ${table} WHERE request_id = $1`, [requestId]);
      } catch (error) {
        if (error?.message?.includes('does not exist')) {
          continue;
        }
        throw error;
      }
    }

    await client.query(
      'UPDATE admin_access_requests SET request_id = NULL WHERE request_id = $1',
      [requestId]
    );

    const result = await client.query('DELETE FROM requests WHERE id = $1 RETURNING id', [requestId]);

    if (!result.rows.length) {
      throw new AppError('Request not found.', 404);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const deletePortalUserCore = async ({ requestId, userId, auditActor = 'customer', auditEmail = null }) => {
  const targetUserId = String(userId || '').trim();
  if (!targetUserId) {
    throw new AppError('User id is required.', 400);
  }

  const client = await db.connect();
  let deletedUser = null;
  let transactionSuccess = false;
  let customerEmail = auditEmail;

  try {
    await client.query('BEGIN');

    const request = await getRequestContext(requestId);
    const user = await getPortalUserRecord(client, requestId, targetUserId);

    if (!request || !user) {
      throw new AppError('User not found.', 404);
    }

    customerEmail = customerEmail || request.customer_email;
    const assignments = await getPortalAssignmentsForUser(client, requestId, targetUserId);
    const { authorizationClient } = createAuthorizationClient();

    if (assignments.length > 0) {
      await revokeAssignmentsForUser(authorizationClient, assignments, requestId);
    }

    try {
      const { graphClient } = createGraphClient();
      await deleteAzureUserWithRetry(graphClient, user.azure_user_id, requestId);
    } catch (error) {
      logManagePortalEvent('error', 'portal_user_delete_failed', {
        requestId,
        userId: targetUserId,
        azureUserId: user.azure_user_id,
        message: error?.message
      });
      throw error;
    }

    await client.query(
      `
        DELETE FROM user_role_assignments
        WHERE request_id = $1
          AND user_id = $2
      `,
      [requestId, targetUserId]
    );

    await client.query(
      `
        DELETE FROM azure_users
        WHERE request_id = $1
          AND id = $2
      `,
      [requestId, targetUserId]
    );

    await recordCleanupLog(client, {
      requestId,
      eventName: 'manage_user_deleted',
      logLevel: 'info',
      message: `Deleted Azure user ${user.azure_user_id} for request ${requestId}.`,
      details: {
        userId: targetUserId,
        azureUserId: user.azure_user_id,
        assignmentsRemoved: assignments.length,
        actor: auditActor
      }
    });

    deletedUser = {
      id: targetUserId,
      azureUserId: user.azure_user_id,
      assignmentsRemoved: assignments.length
    };

    await client.query('COMMIT');
    transactionSuccess = true;

    logManagePortalEvent('info', 'user_delete_completed', {
      requestId,
      userId: targetUserId,
      azureUserId: user.azure_user_id,
      actor: auditActor
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (transactionSuccess && deletedUser) {
    try {
      const auditClient = await db.connect();
      try {
        await recordAuditLog(auditClient, {
          requestId,
          customerEmail,
          actor: auditActor,
          action: 'manage_user_deleted',
          targetUserId,
          details: {
            azureUserId: deletedUser.azureUserId,
            assignmentsRemoved: deletedUser.assignmentsRemoved
          }
        });
      } finally {
        auditClient.release();
      }
    } catch (auditError) {
      logManagePortalEvent('error', 'audit_log_skipped', {
        requestId,
        action: 'manage_user_deleted',
        reason: auditError?.message
      });
    }
  }

  return {
    id: deletedUser.id,
    azureUserId: deletedUser.azureUserId,
    deleted: true
  };
};

const deleteRequestByOrgAdmin = async ({ adminEmail, requestId }) => {
  const normalizedRequestId = Number(requestId);

  if (!Number.isInteger(normalizedRequestId) || normalizedRequestId <= 0) {
    throw new AppError('Request id must be a positive integer.', 400);
  }

  const request = await getRequestContext(normalizedRequestId);

  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  // Stop schedulers from picking this request / sending cleanup emails during teardown.
  await db.query(
    `
      UPDATE requests
      SET
        cleanup_enabled = FALSE,
        next_cleanup_at = NULL,
        resource_cleanup_enabled = FALSE,
        resource_cleanup_next_run_at = NULL
      WHERE id = $1
    `,
    [normalizedRequestId]
  );

  const requestDetails = await db.query(
    `
      SELECT costing_mode, azure_resource_group_name
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [normalizedRequestId]
  );

  const costingMode = requestDetails.rows[0]?.costing_mode || null;
  const sharedResourceGroupName = requestDetails.rows[0]?.azure_resource_group_name || null;

  const deleteConcurrency = getDeleteAzureConcurrency();
  const customAssignments = await getCustomRoleAssignmentsForRequest(normalizedRequestId);
  let customRolesRevoked = 0;

  await runWithConcurrency(customAssignments, deleteConcurrency, async (assignment) => {
    try {
      await revokeCustomRoleAssignment(assignment.id);
      customRolesRevoked += 1;
    } catch (error) {
      logManagePortalEvent('error', 'custom_role_revoke_failed', {
        requestId: normalizedRequestId,
        assignmentId: assignment.id,
        message: error?.message
      });
    }
  });

  const roleAssignments = await getUserRoleAssignmentsForRequest(normalizedRequestId);
  let rolesRemoved = 0;
  const roleErrors = [];

  try {
    const { authorizationClient, resourceClient, graphClient } = createCleanupClients();

    const validRoleAssignments = roleAssignments.filter((assignment) => {
      const assignmentId = assignment.assignment_id || assignment.assignmentId;
      return Boolean(assignmentId && assignment.scope);
    });

    await runWithConcurrency(validRoleAssignments, deleteConcurrency, async (assignment) => {
      const assignmentId = assignment.assignment_id || assignment.assignmentId;

      try {
        const removed = await deleteRoleAssignmentWithRetry(
          authorizationClient,
          assignment.scope,
          assignmentId,
          normalizedRequestId
        );

        if (removed) {
          rolesRemoved += 1;
        }
      } catch (error) {
        roleErrors.push({
          scope: assignment.scope,
          assignmentId,
          role: assignment.azure_role || null,
          reason: error?.message || 'Role assignment deletion failed'
        });
        logManagePortalEvent('error', 'role_assignment_delete_failed', {
          requestId: normalizedRequestId,
          scope: assignment.scope,
          assignmentId,
          message: error?.message
        });
      }
    });

    const [budgetUsersResult, azureUsers, resourceGroupsToDelete] = await Promise.all([
      db.query(
        `
          SELECT id, azure_resource_group_name, budget_id
          FROM azure_users
          WHERE request_id = $1
        `,
        [normalizedRequestId]
      ),
      getUsersForRequest(normalizedRequestId),
      getResourceGroupNamesForCleanup(normalizedRequestId, costingMode, sharedResourceGroupName)
    ]);

    let budgetsDeleted = 0;
    let usersDeleted = 0;
    let resourceGroupsDeleted = 0;
    const userErrors = [];
    const resourceGroupErrors = [];

    const budgetUsers = budgetUsersResult.rows.filter(
      (user) => user.budget_id && user.azure_resource_group_name
    );

    await Promise.all([
      runWithConcurrency(budgetUsers, deleteConcurrency, async (user) => {
        try {
          await deleteUserBudget({
            resourceGroupName: user.azure_resource_group_name,
            userId: user.id
          });
          budgetsDeleted += 1;
        } catch (error) {
          logManagePortalEvent('error', 'budget_delete_failed', {
            requestId: normalizedRequestId,
            userId: user.id,
            message: error?.message
          });
        }
      }),
      runWithConcurrency(azureUsers, deleteConcurrency, async (user) => {
        if (!user.azureUserId) {
          userErrors.push({
            username: user.username,
            reason: 'Missing Azure user ID'
          });
          return;
        }

        try {
          await deleteAzureUserWithRetry(graphClient, user.azureUserId, normalizedRequestId);
          usersDeleted += 1;
        } catch (error) {
          userErrors.push({
            username: user.username,
            reason: error?.message || 'Azure user deletion failed'
          });
        }
      }),
      runWithConcurrency(resourceGroupsToDelete, deleteConcurrency, async (resourceGroupName) => {
        const started = await startResourceGroupDeletion(
          resourceClient,
          resourceGroupName,
          normalizedRequestId
        );

        if (started) {
          resourceGroupsDeleted += 1;
        } else {
          resourceGroupErrors.push({
            resourceGroupName,
            reason: 'Could not start resource group deletion in Azure'
          });
        }
      })
    ]);

    try {
      const auditClient = await db.connect();

      try {
        await recordAuditLog(auditClient, {
          requestId: null,
          customerEmail: request.customer_email || adminEmail,
          actor: 'super_admin',
          action: 'org_admin_request_deleted',
          targetUserId: null,
          details: {
            deletedRequestId: normalizedRequestId,
            usersDeleted,
            usersTotal: azureUsers.length,
            userErrors,
            rolesRemoved,
            roleErrors,
            customRolesRevoked,
            resourceGroupsDeleted,
            resourceGroupErrors,
            budgetsDeleted,
            adminEmail,
            resourceGroupDeletionMode: 'async'
          }
        });
      } finally {
        auditClient.release();
      }
    } catch (auditError) {
      logManagePortalEvent('error', 'audit_log_skipped', {
        requestId: normalizedRequestId,
        action: 'org_admin_request_deleted',
        reason: auditError?.message
      });
    }

    await purgeRequestDatabaseRecords(normalizedRequestId);

    logManagePortalEvent('info', 'request_delete_completed', {
      requestId: normalizedRequestId,
      usersDeleted,
      usersTotal: azureUsers.length,
      rolesRemoved,
      customRolesRevoked,
      resourceGroupsDeleted,
      budgetsDeleted,
      actor: 'super_admin'
    });

    return {
      requestId: normalizedRequestId,
      deleted: true,
      usersDeleted,
      usersTotal: azureUsers.length,
      userErrors,
      roleErrors,
      resourceGroupErrors,
      rolesRemoved,
      customRolesRevoked,
      resourceGroupsDeleted,
      budgetsDeleted,
      resourceGroupDeletionMode: 'async'
    };
  } catch (error) {
    logManagePortalEvent('error', 'request_delete_failed', {
      requestId: normalizedRequestId,
      message: error?.message
    });

    try {
      await purgeRequestDatabaseRecords(normalizedRequestId);
      logManagePortalEvent('info', 'request_delete_db_purged_after_azure_failure', {
        requestId: normalizedRequestId
      });

      return {
        requestId: normalizedRequestId,
        deleted: true,
        usersDeleted: 0,
        usersTotal: 0,
        userErrors: [{ reason: error?.message || 'Azure cleanup failed before user deletion' }],
        roleErrors,
        resourceGroupErrors: [],
        rolesRemoved,
        customRolesRevoked,
        resourceGroupsDeleted: 0,
        budgetsDeleted: 0,
        resourceGroupDeletionMode: 'async',
        partialAzureCleanup: true
      };
    } catch (purgeError) {
      throw new AppError(
        `Request delete failed: ${error?.message || 'Azure cleanup error'}. ` +
          `Database purge also failed: ${purgeError?.message || 'unknown error'}.`,
        500
      );
    }
  }
};

const updatePortalUserRolesCore = async ({
  requestId,
  userId,
  roles,
  auditActor = 'customer',
  auditEmail = null
}) => {
  const targetUserId = String(userId || '').trim();
  const normalizedRoles = normalizeRoles(roles);

  if (!targetUserId) {
    throw new AppError('User id is required.', 400);
  }

  if (normalizedRoles.length === 0) {
    throw new AppError('roles must be a non-empty array.', 400);
  }

  const client = await db.connect();
  let transactionSuccess = false;
  let assignedRoles = [];
  let azureUserId = null;
  let customerEmail = auditEmail;

  try {
    await client.query('BEGIN');

    const request = await getRequestContext(requestId);
    const user = await getPortalUserRecord(client, requestId, targetUserId);

    if (!request || !user) {
      throw new AppError('User not found.', 404);
    }

    customerEmail = customerEmail || request.customer_email;
    azureUserId = user.azure_user_id;

    const scope = await getRequestPrimaryScope(client, requestId, targetUserId);
    const currentAssignments = await getPortalAssignmentsForUser(client, requestId, targetUserId);
    const { authorizationClient } = createAuthorizationClient();

    if (currentAssignments.length > 0) {
      await revokeAssignmentsForUser(authorizationClient, currentAssignments, requestId);
    }

    await client.query(
      `
        DELETE FROM user_role_assignments
        WHERE request_id = $1
          AND user_id = $2
      `,
      [requestId, targetUserId]
    );

    for (const roleName of normalizedRoles) {
      const roleDefinition = await findMatchingRoleDefinition(authorizationClient, scope, roleName);

      if (!roleDefinition?.id) {
        throw new AppError(`Unable to resolve Azure role "${roleName}" at the resource group scope.`, 404);
      }

      const assignmentSeed = [requestId, targetUserId, roleDefinition.id, scope].join(':');
      const assignmentId = roleAssignmentIdFromSeed(assignmentSeed);
      const existingAzureAssignment = await getExistingAzureAssignment(authorizationClient, scope, assignmentId);

      if (!existingAzureAssignment) {
        await createRoleAssignmentWithRetry(
          authorizationClient,
          scope,
          assignmentId,
          {
            principalId: user.azure_user_id,
            roleDefinitionId: roleDefinition.id,
            principalType: 'User'
          },
          requestId
        );
      }

      await client.query(
        `
          INSERT INTO user_role_assignments (
            assignment_id,
            request_id,
            user_id,
            azure_role,
            scope,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, NOW())
        `,
        [assignmentId, requestId, targetUserId, roleName, scope]
      );

      assignedRoles.push({
        role: roleName,
        scope
      });
    }

    await client.query('COMMIT');
    transactionSuccess = true;

    logManagePortalEvent('info', 'manage_user_roles_updated', {
      requestId,
      userId: targetUserId,
      roles: assignedRoles.length,
      actor: auditActor
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (transactionSuccess) {
    try {
      const auditClient = await db.connect();
      try {
        await recordAuditLog(auditClient, {
          requestId,
          customerEmail,
          actor: auditActor,
          action: 'manage_user_roles_updated',
          targetUserId,
          details: {
            roles: assignedRoles
          }
        });
      } finally {
        auditClient.release();
      }
    } catch (auditError) {
      logManagePortalEvent('error', 'audit_log_skipped', {
        requestId,
        action: 'manage_user_roles_updated',
        reason: auditError?.message
      });
    }
  }

  return {
    id: targetUserId,
    azureUserId,
    roles: assignedRoles
  };
};

const deletePortalUser = async (sessionToken, requestId, userId) => {
  const session = await requireSession(sessionToken);
  validateSessionForRequest(session, requestId);
  assertAdminPortalSession(session);

  return deletePortalUserCore({
    requestId,
    userId,
    auditActor: 'customer',
    auditEmail: session.customer_email
  });
};

const updatePortalUserRoles = async (sessionToken, requestId, userId, roles) => {
  const session = await requireSession(sessionToken);
  validateSessionForRequest(session, requestId);
  assertAdminPortalSession(session);

  return updatePortalUserRolesCore({
    requestId,
    userId,
    roles,
    auditActor: 'customer',
    auditEmail: session.customer_email
  });
};

const deletePortalUserByOrgAdmin = async ({ adminEmail, requestId, userId }) =>
  deletePortalUserCore({
    requestId,
    userId,
    auditActor: 'org_admin',
    auditEmail: adminEmail
  });

const updatePortalUserRolesByOrgAdmin = async ({ adminEmail, requestId, userId, roles }) =>
  updatePortalUserRolesCore({
    requestId,
    userId,
    roles,
    auditActor: 'org_admin',
    auditEmail: adminEmail
  });

let cachedVerifiedDomain = null;

const resolveAzureVerifiedDomain = async () => {
  const fromEnv = String(process.env.AZURE_VERIFIED_DOMAIN || '').trim();
  if (fromEnv) {
    return fromEnv;
  }

  if (cachedVerifiedDomain) {
    return cachedVerifiedDomain;
  }

  const { graphClient } = createGraphClient();
  cachedVerifiedDomain = await getVerifiedDomain(graphClient);
  return cachedVerifiedDomain;
};

const resolveUserPrincipalName = (username, domain) => {
  const normalized = String(username || '').trim();
  if (!normalized) {
    throw new AppError('Provisioned user username is missing.', 500);
  }

  if (normalized.includes('@')) {
    return normalized;
  }

  return `${normalized}@${domain}`;
};

const buildAzurePortalDeepLink = ({ tenantDomain, subscriptionId, resourceGroupName }) => {
  const encodedGroup = encodeURIComponent(resourceGroupName);
  return `https://portal.azure.com/#@${tenantDomain}/resource/subscriptions/${subscriptionId}/resourceGroups/${encodedGroup}/overview`;
};

// Open Azure Portal with loginHint so the portal runs its own OAuth flow (form_post).
// Hand-built authorize URLs can trigger AADSTS900561 (GET vs POST mismatch).
const buildAzurePortalLaunchUrl = ({ portalRedirectUri, userPrincipalName }) => {
  const normalizedPortalUri = String(portalRedirectUri || 'https://portal.azure.com/').trim();
  const hashIndex = normalizedPortalUri.indexOf('#');
  const baseWithQuery = hashIndex >= 0 ? normalizedPortalUri.slice(0, hashIndex) : normalizedPortalUri;
  const hash = hashIndex >= 0 ? normalizedPortalUri.slice(hashIndex + 1) : '';

  const launchUrl = new URL(baseWithQuery || 'https://portal.azure.com/');
  launchUrl.searchParams.set('loginHint', userPrincipalName);

  const queryString = launchUrl.searchParams.toString();
  const suffix = queryString ? `?${queryString}` : '';

  if (hash) {
    return `${launchUrl.origin}${launchUrl.pathname}${suffix}#${hash}`;
  }

  return `${launchUrl.origin}${launchUrl.pathname}${suffix}`;
};

const getAzureConsoleLaunch = async (sessionToken, requestId, userId) => {
  const session = await requireSession(sessionToken);
  validateSessionForRequest(session, requestId);
  assertSelfOrAdminPortalSession(session, userId);

  const userResult = await db.query(
    `
      SELECT
        id,
        username,
        temporary_password,
        status,
        blocked_until,
        blocked_reason,
        azure_account_enabled,
        COALESCE(is_deleted, false) AS is_deleted
      FROM azure_users
      WHERE id = $1
        AND request_id = $2
      LIMIT 1
    `,
    [userId, requestId]
  );

  const user = userResult.rows[0];

  if (!user || user.is_deleted) {
    throw new AppError('Provisioned user not found.', 404);
  }

  assertManagePortalUserAccessAllowed(user, 'This user');

  const azureConfig = validateAzureEnv();
  const verifiedDomain = await resolveAzureVerifiedDomain();
  const userPrincipalName = resolveUserPrincipalName(user.username, verifiedDomain);
  const resourceGroupName = await getResourceGroupNameForUser(requestId, user.id);
  const portalRedirectUri = resourceGroupName
    ? buildAzurePortalDeepLink({
        tenantDomain: verifiedDomain,
        subscriptionId: azureConfig.subscriptionId,
        resourceGroupName
      })
    : 'https://portal.azure.com/';

  const signInUrl = buildAzurePortalLaunchUrl({
    portalRedirectUri,
    userPrincipalName
  });

  const requestResult = await db.query(
    `
      SELECT enable_daily_usage
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const hasUsageWindows = await requestHasUsageWindows(requestId);

  if (requestResult.rows[0]?.enable_daily_usage || hasUsageWindows) {
    try {
      await usageService.startUsageSession({ requestId, userId: user.id });
      console.log(`[CONSOLE_LAUNCH] Usage session started for user ${user.id}, request ${requestId}`);
    } catch (sessionError) {
      console.error(
        `[CONSOLE_LAUNCH] Could not start usage session for user ${user.id}:`,
        sessionError.message
      );
    }
  }

  try {
    const auditClient = await db.connect();
    try {
      await recordAuditLog(auditClient, {
        requestId,
        customerEmail: session.customer_email,
        actor: 'customer',
        action: 'azure_console_launch_requested',
        targetUserId: String(user.id),
        details: {
          username: user.username,
          userPrincipalName,
          resourceGroup: resourceGroupName
        }
      });
    } finally {
      auditClient.release();
    }
  } catch (auditError) {
    logManagePortalEvent('error', 'audit_log_skipped', {
      requestId,
      action: 'azure_console_launch_requested',
      reason: auditError?.message
    });
  }

  return {
    requestId,
    userId: user.id,
    username: user.username,
    userPrincipalName,
    temporaryPassword: user.temporary_password,
    signInUrl,
    portalUrl: portalRedirectUri,
    resourceGroup: resourceGroupName
  };
};

const endPortalUserUsageSession = async (sessionToken, requestId, userId) => {
  const session = await requireSession(sessionToken);
  validateSessionForRequest(session, requestId);
  assertSelfOrAdminPortalSession(session, userId);

  const userResult = await db.query(
    `
      SELECT id
      FROM azure_users
      WHERE id = $1
        AND request_id = $2
        AND COALESCE(is_deleted, false) = false
      LIMIT 1
    `,
    [userId, requestId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError('Provisioned user not found.', 404);
  }

  const result = await usageService.endUsageSessionIfActive({ requestId, userId });

  return {
    requestId,
    userId,
    ended: Boolean(result),
    session: result
  };
};

const getPortalUserUsageStatus = async (sessionToken, requestId, userId) => {
  const session = await requireSession(sessionToken);
  validateSessionForRequest(session, requestId);
  assertSelfOrAdminPortalSession(session, userId);

  const userResult = await db.query(
    `
      SELECT id
      FROM azure_users
      WHERE id = $1
        AND request_id = $2
        AND COALESCE(is_deleted, false) = false
      LIMIT 1
    `,
    [userId, requestId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError('Provisioned user not found.', 404);
  }

  const status = await usageService.getUsageStatus({ requestId, userId });

  return status;
};

const getUserControlsForRequest = async (sessionToken, requestId) => {
  const session = await requireSession(sessionToken);
  validateSessionForRequest(session, requestId);
  assertAdminPortalSession(session);

  const { rows } = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.azure_user_id,
        COALESCE(au.azure_account_enabled, TRUE) AS azure_account_enabled,
        au.budget_id,
        au.budget_exceeded,
        au.budget_exceeded_at,
        au.cleanup_disabled,
        au.cleanup_interval_override,
        au.budget_top_up_usd,
        au.budget_renewed_at,
        au.budget_renewed_count,
        r.per_user_budget_usd AS base_budget,
        r.resource_cleanup_enabled,
        r.resource_cleanup_interval_hours AS default_cleanup_interval,
        COALESCE(ubs.current_spend, 0) AS current_spend,
        COALESCE(
          ubs.budget_amount,
          r.per_user_budget_usd + COALESCE(au.budget_top_up_usd, 0)
        ) AS total_budget,
        ubs.last_synced_at
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      LEFT JOIN user_budget_spend ubs ON ubs.azure_user_id = au.id
      WHERE au.request_id = $1
        AND COALESCE(au.is_deleted, FALSE) = FALSE
      ORDER BY au.username
    `,
    [requestId]
  );

  return rows;
};

const renewUserBudget = async (sessionToken, userId, topUpAmount) => {
  const session = await requireSession(sessionToken);
  assertAdminPortalSession(session);

  const amountUsd = parseFloat(topUpAmount);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new AppError('topUpAmount must be positive.', 400);
  }

  const { convertUsdToInr, getUsdToInrRate } = require('../utils/usdToInr');
  const amount = convertUsdToInr(amountUsd);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('topUpAmount must be positive.', 400);
  }

  console.log(
    JSON.stringify({
      event: 'budget_topup_converted_usd_to_inr',
      service: 'manage-portal-service',
      userId,
      topUpUsd: amountUsd,
      topUpInr: amount,
      usdToInrRate: getUsdToInrRate()
    })
  );

  const { rows } = await db.query(
    `
      SELECT
        au.id,
        au.azure_user_id,
        au.azure_resource_group_name,
        au.budget_id,
        au.budget_top_up_usd,
        au.budget_exceeded,
        au.request_id,
        r.per_user_budget_usd AS base_budget,
        r.expiry_date
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE au.id = $1
        AND COALESCE(au.is_deleted, FALSE) = FALSE
    `,
    [userId]
  );

  if (!rows.length) {
    throw new AppError('User not found.', 404);
  }

  const user = rows[0];
  validateSessionForRequest(session, user.request_id);

  const previousTopUp = parseFloat(user.budget_top_up_usd || 0);
  const newTopUp = previousTopUp + amount;
  const newTotalBudget = parseFloat(user.base_budget || 0) + newTopUp;

  if (user.azure_resource_group_name) {
    try {
      const { updateUserBudgetAmount } = require('../provisioners/azure/azureBudgetProvisioner');
      await updateUserBudgetAmount({
        resourceGroupName: user.azure_resource_group_name,
        userId: user.id,
        newBudgetAmount: newTotalBudget,
        endDate: new Date(user.expiry_date)
      });
    } catch (azureErr) {
      logManagePortalEvent('error', 'azure_budget_update_failed', {
        userId,
        message: azureErr?.message
      });
    }
  }

  await db.query(
    `
      UPDATE azure_users
      SET budget_top_up_usd = $1,
          budget_exceeded = FALSE,
          budget_exceeded_at = NULL,
          budget_renewed_at = NOW(),
          budget_renewed_count = COALESCE(budget_renewed_count, 0) + 1
      WHERE id = $2
    `,
    [newTopUp, userId]
  );

  await db.query(
    `
      INSERT INTO user_budget_spend
        (azure_user_id, request_id, current_spend, budget_amount, last_synced_at)
      SELECT au.id, au.request_id, COALESCE(ubs.current_spend, 0), $1, NOW()
      FROM azure_users au
      LEFT JOIN user_budget_spend ubs ON ubs.azure_user_id = au.id
      WHERE au.id = $2
      ON CONFLICT (azure_user_id)
      DO UPDATE SET budget_amount = EXCLUDED.budget_amount, last_synced_at = NOW()
    `,
    [newTotalBudget, userId]
  );

  if (user.budget_exceeded && user.azure_user_id) {
    const { graphClient } = createGraphClient();
    await graphClient.api(`/users/${user.azure_user_id}`).patch({ accountEnabled: true });

    await db.query(
      `
        UPDATE azure_users
        SET azure_account_enabled = TRUE
        WHERE id = $1
      `,
      [userId]
    );
  }

  logManagePortalEvent('info', 'budget_renewed', {
    userId,
    topUpAmount: amount,
    newTotalBudget
  });

  return {
    newTotalBudget,
    topUpAmount: amount,
    previousTopUp
  };
};

const updateUserCleanupSettings = async (
  sessionToken,
  userId,
  { cleanupDisabled, cleanupIntervalOverride }
) => {
  const session = await requireSession(sessionToken);
  assertAdminPortalSession(session);

  const userResult = await db.query(
    `
      SELECT request_id
      FROM azure_users
      WHERE id = $1
        AND COALESCE(is_deleted, FALSE) = FALSE
    `,
    [userId]
  );

  if (!userResult.rows.length) {
    throw new AppError('User not found.', 404);
  }

  validateSessionForRequest(session, userResult.rows[0].request_id);

  const updates = [];
  const values = [];
  let idx = 1;

  if (cleanupDisabled !== undefined) {
    updates.push(`cleanup_disabled = $${idx++}`);
    values.push(Boolean(cleanupDisabled));
  }

  if (cleanupIntervalOverride !== undefined) {
    updates.push(`cleanup_interval_override = $${idx++}`);
    values.push(cleanupIntervalOverride);
  }

  if (!updates.length) {
    throw new AppError('No fields to update.', 400);
  }

  values.push(userId);
  await db.query(
    `
      UPDATE azure_users
      SET ${updates.join(', ')}
      WHERE id = $${idx}
    `,
    values
  );

  logManagePortalEvent('info', 'cleanup_settings_updated', {
    userId,
    cleanupDisabled,
    cleanupIntervalOverride
  });
};

const triggerUserCleanup = async (sessionToken, userId, { action } = {}) => {
  const session = await requireSession(sessionToken);
  assertAdminPortalSession(session);

  const { rows } = await db.query(
    `
      SELECT
        au.azure_resource_group_name,
        au.request_id,
        au.azure_user_id,
        au.username,
        au.user_number,
        r.costing_mode,
        r.azure_resource_group_name AS shared_resource_group_name,
        r.resource_cleanup_action,
        (
          SELECT COUNT(*)
          FROM azure_users active_users
          WHERE active_users.request_id = au.request_id
            AND COALESCE(active_users.is_deleted, FALSE) = FALSE
        ) AS active_user_count
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE au.id = $1
        AND COALESCE(au.is_deleted, FALSE) = FALSE
    `,
    [userId]
  );

  if (!rows.length) {
    throw new AppError('User not found.', 404);
  }

  const user = rows[0];
  validateSessionForRequest(session, user.request_id);

  const { runResourceActionForUser } = require('./resourceCleanupService');
  const resolvedAction = action === 'pause' || action === 'delete' ? action : user.resource_cleanup_action || 'delete';

  const affected = await runResourceActionForUser({
    costingMode: user.costing_mode,
    perUserResourceGroupName: user.azure_resource_group_name,
    sharedResourceGroupName: user.shared_resource_group_name,
    entraObjectId: user.azure_user_id,
    username: user.username,
    userNumber: user.user_number,
    activeUserCount: Number(user.active_user_count || 0),
    action: resolvedAction
  });

  await db.query(
    `
      INSERT INTO resource_cleanup_logs (request_id, ran_at, resources_deleted, user_count, status)
      VALUES ($1, NOW(), $2, 1, 'success')
    `,
    [user.request_id, JSON.stringify(affected)]
  );

  logManagePortalEvent('info', 'manual_cleanup_triggered', {
    userId,
    action: resolvedAction,
    affectedCount: affected.length
  });

  return {
    action: resolvedAction,
    affectedCount: affected.length,
    deletedCount: resolvedAction === 'delete' ? affected.length : 0,
    pausedCount:
      resolvedAction === 'pause'
        ? affected.filter((entry) => entry.action && entry.action !== 'skipped' && entry.action !== 'failed').length
        : 0,
    affected
  };
};

module.exports = {
  deletePortalUser,
  deletePortalUserByOrgAdmin,
  deleteRequestByOrgAdmin,
  exchangeAccessToken,
  endPortalUserUsageSession,
  getAzureConsoleLaunch,
  getPortalUserUsageStatus,
  getUserControlsForRequest,
  issueAccessPortalTokenForRequest,
  listPortalUsers,
  renewUserBudget,
  requireSession,
  triggerUserCleanup,
  updatePortalUserRoles,
  updatePortalUserRolesByOrgAdmin,
  updateUserCleanupSettings
};
