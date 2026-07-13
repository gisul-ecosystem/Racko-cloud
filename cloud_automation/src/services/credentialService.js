const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const accessPortalService = require('./accessPortalService');
const { enqueueEmail } = require('./emailQueueService');
const { createNotification, NotificationType } = require('./notificationService');
const {
  buildCredentialEmailHtml,
} = require('./email/credentialEmailService');
const {
  buildCredentialSpreadsheetBuffer,
  buildCredentialSpreadsheetFilename
} = require('./email/credentialExcelService');

const DELIVERY_STATUS_QUEUED = 'queued';
const DELIVERY_STATUS_SENT = 'sent';

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
      location
    FROM requests
    WHERE id = $1
  `;

  const result = await client.query(query, [requestId]);
  return result.rows[0] || null;
};

const getProvisionedUsersByRequestId = async (client, requestId) => {
  const query = `
    SELECT
      azure_user_id,
      username,
      temporary_password,
      status
    FROM azure_users
    WHERE request_id = $1
      AND COALESCE(is_deleted, FALSE) = FALSE
    ORDER BY username ASC
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
  const createdAt = new Date();
  const sentAt = deliveryStatus === DELIVERY_STATUS_SENT ? createdAt : null;
  const portalLink = deliveryMeta.portalLink ?? null;
  const adminUsername = deliveryMeta.adminUsername ?? null;
  const adminTemporaryPassword = deliveryMeta.adminTemporaryPassword ?? null;
  const portalExpiresAt = deliveryMeta.portalExpiresAt ?? null;

  const updateQuery = `
    UPDATE credential_delivery
    SET
      recipient_email = $2,
      delivery_status = $3,
      sent_at = $4,
      created_at = $5,
      portal_link = COALESCE($6, portal_link),
      admin_username = COALESCE($7, admin_username),
      admin_temporary_password = COALESCE($8, admin_temporary_password),
      portal_expires_at = COALESCE($9, portal_expires_at)
    WHERE request_id = $1
    RETURNING request_id, recipient_email, delivery_status, sent_at
  `;

  const updateResult = await client.query(updateQuery, [
    requestId,
    recipientEmail,
    deliveryStatus,
    sentAt,
    createdAt,
    portalLink,
    adminUsername,
    adminTemporaryPassword,
    portalExpiresAt
  ]);

  if (updateResult.rows.length > 0) {
    return updateResult.rows[0];
  }

  const insertQuery = `
    INSERT INTO credential_delivery (
      request_id,
      recipient_email,
      delivery_status,
      sent_at,
      created_at,
      portal_link,
      admin_username,
      admin_temporary_password,
      portal_expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING request_id, recipient_email, delivery_status, sent_at
  `;

  const insertResult = await client.query(insertQuery, [
    requestId,
    recipientEmail,
    deliveryStatus,
    sentAt,
    createdAt,
    portalLink,
    adminUsername,
    adminTemporaryPassword,
    portalExpiresAt
  ]);

  return insertResult.rows[0];
};

const getCredentialDelivery = async (requestId) => {
  validateRequestId(requestId);

  const query = `
    SELECT
      request_id,
      recipient_email,
      delivery_status,
      sent_at,
      portal_link,
      admin_username,
      admin_temporary_password,
      portal_expires_at
    FROM credential_delivery
    WHERE request_id = $1
  `;

  const result = await db.query(query, [requestId]);

  if (result.rows.length === 0) {
    return null;
  }

  return {
    requestId: result.rows[0].request_id,
    recipientEmail: result.rows[0].recipient_email,
    deliveryStatus: result.rows[0].delivery_status,
    sentAt: result.rows[0].sent_at,
    portalLink: result.rows[0].portal_link,
    adminUsername: result.rows[0].admin_username,
    adminTemporaryPassword: result.rows[0].admin_temporary_password,
    portalExpiresAt: result.rows[0].portal_expires_at
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

  const html = buildCredentialEmailHtml({
    requestId,
    users,
    adminCredentials,
    portalLink,
    expiresAt: portal.expiresAt.toISOString()
  });

  const deliveryMeta = {
    portalLink,
    adminUsername: adminCredentials?.username || null,
    adminTemporaryPassword: adminCredentials?.temporaryPassword || null,
    portalExpiresAt: portal.expiresAt
  };

  logCredentialEvent('info', 'credential_delivery_email_started', {
    requestId,
    recipientEmail: request.customer_email,
    manageUrl: portalLink
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
      subject: `Azure Credentials Ready — Request #${requestId}`,
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
          title: 'Lab provisioned successfully',
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

module.exports = {
  getCredentialDelivery,
  sendCredentials,
  sendCredentialsForRequest: sendCredentials,
  buildCredentialSpreadsheetForRequest,
  buildCredentialSpreadsheetAttachment
};
