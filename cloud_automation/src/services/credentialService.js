const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const accessPortalService = require('./accessPortalService');
const { enqueueEmail } = require('./emailQueueService');
const { createNotification, NotificationType } = require('./notificationService');
const {
  buildCredentialEmailHtml,
  buildTestIdsCredentialEmailHtml,
  buildNewUserCredentialEmailHtml
} = require('./email/credentialEmailService');
const {
  buildCredentialSpreadsheetBuffer,
  buildCredentialSpreadsheetFilename
} = require('./email/credentialExcelService');

const DELIVERY_STATUS_QUEUED = 'queued';
const DELIVERY_STATUS_SENT = 'sent';

let credentialDeliverySchemaPromise = null;

const loadCredentialDeliverySchema = async () => {
  if (credentialDeliverySchemaPromise) {
    return credentialDeliverySchemaPromise;
  }

  credentialDeliverySchemaPromise = (async () => {
    const result = await db.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'credential_delivery'
      `
    );

    const columns = new Set(result.rows.map((row) => row.column_name));

    return {
      hasCreatedAt: columns.has('created_at'),
      hasPortalLink: columns.has('portal_link'),
      hasAdminUsername: columns.has('admin_username'),
      hasAdminTemporaryPassword: columns.has('admin_temporary_password'),
      hasPortalExpiresAt: columns.has('portal_expires_at'),
    };
  })().catch((error) => {
    credentialDeliverySchemaPromise = null;
    throw error;
  });

  return credentialDeliverySchemaPromise;
};

const logCredentialEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'credential-delivery',
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

const validateRequestId = (requestId) => {
  if (requestId === undefined || requestId === null || String(requestId).trim() === '') {
    throw new AppError('request_id is required.', 400);
  }
};

const getRequestById = async (client, requestId) => {
  const query = `
    SELECT
      id,
      customer_email,
      account_count,
      status,
      expiry_date,
      expires_at,
      location,
      id_mode,
      project_name,
      costing_mode,
      azure_resource_group_name
    FROM requests
    WHERE id = $1
  `;

  const result = await client.query(query, [requestId]);
  return result.rows[0] || null;
};

const getProvisionedUsersByRequestId = async (client, requestId) => {
  const query = `
    SELECT
      au.azure_user_id,
      au.username,
      au.temporary_password,
      au.status,
      COALESCE(
        NULLIF(TRIM(au.azure_resource_group_name), ''),
        NULLIF(TRIM(r.azure_resource_group_name), ''),
        rurg.azure_resource_group_name
      ) AS resource_group_name
    FROM azure_users au
    JOIN requests r ON r.id = au.request_id
    LEFT JOIN request_user_resource_groups rurg
      ON rurg.request_id = au.request_id
     AND rurg.user_number = (
       CASE
         WHEN au.username ~ '-user-[0-9]+$'
         THEN (regexp_match(au.username, '-user-([0-9]+)$'))[1]::int
         ELSE NULL
       END
     )
    WHERE au.request_id = $1
      AND COALESCE(au.is_deleted, FALSE) = FALSE
    ORDER BY au.username ASC
  `;

  const result = await client.query(query, [requestId]);
  return result.rows;
};

const loadCredentials = async (requestId) => {
  const [request, users] = await Promise.all([
    getRequestById(db, requestId),
    getProvisionedUsersByRequestId(db, requestId)
  ]);

  return {
    request,
    users
  };
};

const upsertDeliveryRecord = async (
  client,
  requestId,
  recipientEmail,
  deliveryStatus,
  deliveryMeta = {}
) => {
  const schema = await loadCredentialDeliverySchema();
  const createdAt = new Date();
  const sentAt = deliveryStatus === DELIVERY_STATUS_SENT ? createdAt : null;
  const portalLink = deliveryMeta.portalLink ?? null;
  const adminUsername = deliveryMeta.adminUsername ?? null;
  const adminTemporaryPassword = deliveryMeta.adminTemporaryPassword ?? null;
  const portalExpiresAt = deliveryMeta.portalExpiresAt ?? null;

  const updateAssignments = [
    'recipient_email = $2',
    'delivery_status = $3',
    'sent_at = $4',
  ];
  const updateParams = [requestId, recipientEmail, deliveryStatus, sentAt];
  let paramIndex = 5;

  if (schema.hasCreatedAt) {
    updateAssignments.push(`created_at = $${paramIndex}`);
    updateParams.push(createdAt);
    paramIndex += 1;
  }

  if (schema.hasPortalLink) {
    updateAssignments.push(`portal_link = COALESCE($${paramIndex}, portal_link)`);
    updateParams.push(portalLink);
    paramIndex += 1;
  }

  if (schema.hasAdminUsername) {
    updateAssignments.push(`admin_username = COALESCE($${paramIndex}, admin_username)`);
    updateParams.push(adminUsername);
    paramIndex += 1;
  }

  if (schema.hasAdminTemporaryPassword) {
    updateAssignments.push(
      `admin_temporary_password = COALESCE($${paramIndex}, admin_temporary_password)`
    );
    updateParams.push(adminTemporaryPassword);
    paramIndex += 1;
  }

  if (schema.hasPortalExpiresAt) {
    updateAssignments.push(`portal_expires_at = COALESCE($${paramIndex}, portal_expires_at)`);
    updateParams.push(portalExpiresAt);
    paramIndex += 1;
  }

  const updateQuery = `
    UPDATE credential_delivery
    SET ${updateAssignments.join(',\n      ')}
    WHERE request_id = $1
    RETURNING request_id, recipient_email, delivery_status, sent_at
  `;

  const updateResult = await client.query(updateQuery, updateParams);

  if (updateResult.rows.length > 0) {
    return updateResult.rows[0];
  }

  const insertColumns = ['request_id', 'recipient_email', 'delivery_status', 'sent_at'];
  const insertValues = ['$1', '$2', '$3', '$4'];
  const insertParams = [requestId, recipientEmail, deliveryStatus, sentAt];
  paramIndex = 5;

  if (schema.hasCreatedAt) {
    insertColumns.push('created_at');
    insertValues.push(`$${paramIndex}`);
    insertParams.push(createdAt);
    paramIndex += 1;
  }

  if (schema.hasPortalLink) {
    insertColumns.push('portal_link');
    insertValues.push(`$${paramIndex}`);
    insertParams.push(portalLink);
    paramIndex += 1;
  }

  if (schema.hasAdminUsername) {
    insertColumns.push('admin_username');
    insertValues.push(`$${paramIndex}`);
    insertParams.push(adminUsername);
    paramIndex += 1;
  }

  if (schema.hasAdminTemporaryPassword) {
    insertColumns.push('admin_temporary_password');
    insertValues.push(`$${paramIndex}`);
    insertParams.push(adminTemporaryPassword);
    paramIndex += 1;
  }

  if (schema.hasPortalExpiresAt) {
    insertColumns.push('portal_expires_at');
    insertValues.push(`$${paramIndex}`);
    insertParams.push(portalExpiresAt);
    paramIndex += 1;
  }

  const insertQuery = `
    INSERT INTO credential_delivery (${insertColumns.join(', ')})
    VALUES (${insertValues.join(', ')})
    RETURNING request_id, recipient_email, delivery_status, sent_at
  `;

  const insertResult = await client.query(insertQuery, insertParams);

  return insertResult.rows[0];
};

const getCredentialDelivery = async (requestId) => {
  validateRequestId(requestId);

  const schema = await loadCredentialDeliverySchema();
  const optionalColumns = [
    schema.hasPortalLink ? 'portal_link' : null,
    schema.hasAdminUsername ? 'admin_username' : null,
    schema.hasAdminTemporaryPassword ? 'admin_temporary_password' : null,
    schema.hasPortalExpiresAt ? 'portal_expires_at' : null,
  ].filter(Boolean);

  const query = `
    SELECT
      request_id,
      recipient_email,
      delivery_status,
      sent_at
      ${optionalColumns.length ? `, ${optionalColumns.join(', ')}` : ''}
    FROM credential_delivery
    WHERE request_id = $1
  `;

  const result = await db.query(query, [requestId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    requestId: row.request_id,
    recipientEmail: row.recipient_email,
    deliveryStatus: row.delivery_status,
    sentAt: row.sent_at,
    portalLink: row.portal_link ?? null,
    adminUsername: row.admin_username ?? null,
    adminTemporaryPassword: row.admin_temporary_password ?? null,
    portalExpiresAt: row.portal_expires_at ?? null,
  };
};

const buildCredentialSpreadsheetForRequest = async (requestId) => {
  validateRequestId(requestId);

  const [delivery, credentials] = await Promise.all([
    getCredentialDelivery(requestId),
    loadCredentials(requestId)
  ]);

  if (!delivery || !['sent', 'queued'].includes(String(delivery.deliveryStatus || '').toLowerCase())) {
    throw new AppError(
      'Credential spreadsheet is available after credentials have been sent for this request.',
      404
    );
  }

  if (!credentials.request) {
    throw new AppError('Request not found.', 404);
  }

  if (!credentials.users.length) {
    throw new AppError('No provisioned users found for this request.', 404);
  }

  const buffer = buildCredentialSpreadsheetBuffer({
    requestId,
    customerEmail: credentials.request.customer_email,
    location: credentials.request.location,
    projectName: credentials.request.project_name,
    idMode: credentials.request.id_mode,
    costingMode: credentials.request.costing_mode,
    expiryDate: credentials.request.expiry_date,
    expiresAt: credentials.request.expires_at,
    sharedResourceGroup: credentials.request.azure_resource_group_name,
    portalLink: delivery.portalLink || '',
    portalExpiresAt: delivery.portalExpiresAt,
    adminCredentials: {
      username: delivery.adminUsername || '',
      temporaryPassword: delivery.adminTemporaryPassword || ''
    },
    users: credentials.users
  });

  return {
    buffer,
    filename: buildCredentialSpreadsheetFilename(requestId)
  };
};

const buildCredentialSpreadsheetAttachment = async (requestId) => {
  const { buffer, filename } = await buildCredentialSpreadsheetForRequest(requestId);

  return {
    filename,
    content: buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
};

const sendCredentials = async (requestId) => {
  validateRequestId(requestId);

  const existingDelivery = await getCredentialDelivery(requestId);
  if (
    existingDelivery &&
    ['queued', 'sent'].includes(String(existingDelivery.deliveryStatus || '').toLowerCase())
  ) {
    logCredentialEvent('info', 'credential_delivery_already_queued', {
      requestId,
      deliveryStatus: existingDelivery.deliveryStatus,
    });

    return {
      success: true,
      requestId,
      portalLink: existingDelivery.portalLink,
      adminUsername: existingDelivery.adminUsername,
      usersSent: (await loadCredentials(requestId)).users.length,
      deliveryStatus: existingDelivery.deliveryStatus,
      spreadsheetFilename: buildCredentialSpreadsheetFilename(requestId),
    };
  }

  const portalPromise = accessPortalService.issueAccessPortalTokenForRequest(requestId);
  const credentialPromise = loadCredentials(requestId);

  const [portal, credentials] = await Promise.all([
    portalPromise,
    credentialPromise
  ]);

  if (!credentials.request) {
    throw new AppError('Request not found.', 404);
  }

  if (!credentials.users.length) {
    throw new AppError('No provisioned users found', 400);
  }

  const request = credentials.request;
  const users = credentials.users;
  const portalLink = portal.manageUrl;
  const adminCredentials = portal.adminCredentials;
  const isTestIds = String(request.id_mode || '').toLowerCase() === 'test_ids';

  const html = isTestIds
    ? buildTestIdsCredentialEmailHtml({
        requestId,
        users,
        adminCredentials,
        portalLink,
        projectName: request.project_name
      })
    : buildCredentialEmailHtml({
        requestId,
        users,
        adminCredentials,
        portalLink,
        expiresAt: portal.expiresAt.toISOString()
      });

  const emailSubject = isTestIds
    ? `Azure Test IDs Ready — Request #${requestId}`
    : `Azure Credentials Ready — Request #${requestId}`;

  const deliveryMeta = {
    portalLink,
    adminUsername: adminCredentials?.username || null,
    adminTemporaryPassword: adminCredentials?.temporaryPassword || null,
    portalExpiresAt: portal.expiresAt
  };

  logCredentialEvent('info', 'credential_delivery_email_started', {
    requestId,
    recipientEmail: request.customer_email,
    manageUrl: portalLink,
    idMode: request.id_mode || null
  });

  try {
    await upsertDeliveryRecord(
      db,
      requestId,
      request.customer_email,
      DELIVERY_STATUS_QUEUED,
      deliveryMeta
    );

    await enqueueEmail({
      recipientEmail: request.customer_email,
      subject: emailSubject,
      html,
      relatedType: 'credential_delivery',
      relatedId: String(requestId),
      onSuccess: async () => {
        await upsertDeliveryRecord(
          db,
          requestId,
          request.customer_email,
          DELIVERY_STATUS_SENT,
          deliveryMeta
        );

        logCredentialEvent('info', 'credential_delivery_email_success', {
          requestId,
          recipientEmail: request.customer_email
        });

        await createNotification({
          type: NotificationType.PROVISIONING_COMPLETE,
          title: isTestIds ? 'Azure test IDs ready' : 'Lab provisioned successfully',
          message: `Lab #${requestId} provisioned for ${request.customer_email} — ${request.account_count} users in ${request.location}`,
          requestId: Number(requestId)
        });
      },
      onFailure: async (error) => {
        await upsertDeliveryRecord(
          db,
          requestId,
          request.customer_email,
          'failed'
        );

        logCredentialEvent('error', 'credential_delivery_email_failed', {
          requestId,
          recipientEmail: request.customer_email,
          message: error?.message
        });
      }
    });

    logCredentialEvent('info', 'credential_delivery_email_queued', {
      requestId,
      recipientEmail: request.customer_email
    });

    return {
      success: true,
      requestId,
      portalLink,
      adminUsername: adminCredentials?.username || null,
      usersSent: users.length,
      deliveryStatus: DELIVERY_STATUS_QUEUED,
      spreadsheetFilename: buildCredentialSpreadsheetFilename(requestId)
    };
  } catch (error) {
    logCredentialEvent('error', 'credential_delivery_failed', {
      requestId,
      errorName: error?.name,
      errorCode: error?.code,
      statusCode: error?.statusCode || error?.status,
      message: error?.message
    });

    throw error;
  }
};

const getProvisionedUserById = async (client, requestId, userId) => {
  const query = `
    SELECT
      au.id,
      au.azure_user_id,
      au.username,
      au.temporary_password,
      au.status,
      COALESCE(
        NULLIF(TRIM(au.azure_resource_group_name), ''),
        NULLIF(TRIM(r.azure_resource_group_name), ''),
        rurg.azure_resource_group_name
      ) AS resource_group_name
    FROM azure_users au
    JOIN requests r ON r.id = au.request_id
    LEFT JOIN request_user_resource_groups rurg
      ON rurg.request_id = au.request_id
     AND rurg.user_number = au.user_number
    WHERE au.request_id = $1
      AND au.id = $2
      AND COALESCE(au.is_deleted, FALSE) = FALSE
    LIMIT 1
  `;

  const result = await client.query(query, [requestId, userId]);
  return result.rows[0] || null;
};

const sendNewUserCredentials = async (requestId, userId) => {
  validateRequestId(requestId);

  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new AppError('userId must be a positive integer.', 400);
  }

  const [request, user, delivery] = await Promise.all([
    getRequestById(db, requestId),
    getProvisionedUserById(db, requestId, normalizedUserId),
    getCredentialDelivery(requestId)
  ]);

  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  if (!user) {
    throw new AppError('Provisioned user not found for this request.', 404);
  }

  let portalLink = delivery?.portalLink || null;
  let adminCredentials = {
    username: delivery?.adminUsername || null,
    temporaryPassword: delivery?.adminTemporaryPassword || null
  };

  if (!portalLink) {
    const portal = await accessPortalService.issueAccessPortalTokenForRequest(requestId);
    portalLink = portal.manageUrl;
    adminCredentials = portal.adminCredentials;

    await upsertDeliveryRecord(db, requestId, request.customer_email, DELIVERY_STATUS_QUEUED, {
      portalLink,
      adminUsername: adminCredentials?.username || null,
      adminTemporaryPassword: adminCredentials?.temporaryPassword || null,
      portalExpiresAt: portal.expiresAt
    });
  }

  const html = buildNewUserCredentialEmailHtml({
    requestId,
    user,
    adminCredentials,
    portalLink,
    costingMode: request.costing_mode
  });

  const emailSubject = `New Azure User Added — Request #${requestId}`;

  logCredentialEvent('info', 'new_user_credential_email_started', {
    requestId,
    userId: normalizedUserId,
    recipientEmail: request.customer_email,
    username: user.username
  });

  await enqueueEmail({
    recipientEmail: request.customer_email,
    subject: emailSubject,
    html,
    relatedType: 'credential_delivery',
    relatedId: `${requestId}:${normalizedUserId}`,
    onSuccess: async () => {
      logCredentialEvent('info', 'new_user_credential_email_success', {
        requestId,
        userId: normalizedUserId,
        recipientEmail: request.customer_email
      });
    },
    onFailure: async (error) => {
      logCredentialEvent('error', 'new_user_credential_email_failed', {
        requestId,
        userId: normalizedUserId,
        recipientEmail: request.customer_email,
        message: error?.message
      });
    }
  });

  return {
    success: true,
    requestId,
    userId: normalizedUserId,
    recipientEmail: request.customer_email,
    username: user.username,
    deliveryStatus: DELIVERY_STATUS_QUEUED
  };
};

module.exports = {
  getCredentialDelivery,
  sendCredentials,
  sendCredentialsForRequest: sendCredentials,
  sendNewUserCredentials,
  buildCredentialSpreadsheetForRequest,
  buildCredentialSpreadsheetAttachment
};
