const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { validateSmtpEnv } = require('./email/smtpEnv');
const { resolveLicenseDisplayName } = require('../utils/microsoftLicenseNames');

const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const resolveFrontendBaseUrl = () => {
  const baseUrl = String(
    process.env.FRONTEND_URL || process.env.CLIENT_PORTAL_URL || 'http://localhost:3000'
  )
    .trim()
    .replace(/\/+$/, '');

  if (!baseUrl) {
    throw new AppError('FRONTEND_URL is not configured.', 500);
  }

  return baseUrl;
};

const getPurchaseIntentDelayMs = () => {
  const hours = Number(process.env.PURCHASE_INTENT_DELAY_HOURS);
  const resolvedHours = Number.isFinite(hours) && hours >= 0 ? hours : 24;
  return resolvedHours * 60 * 60 * 1000;
};

const createSmtpTransport = () => {
  const smtpConfig = validateSmtpEnv();
  return {
    transporter: nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.auth
    }),
    from: smtpConfig.from
  };
};

const buildPurchaseIntentEmailHtml = ({
  requestId,
  projectName,
  accountCount,
  yesUrl,
  noUrl
}) => {
  const projectLabel = projectName
    ? escapeHtml(projectName)
    : `Request #${escapeHtml(requestId)}`;

  return `
    <!doctype html>
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px;">
          <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #B91C1C;">
            Azure lab purchase
          </p>
          <h1 style="margin: 0 0 12px; font-size: 24px; line-height: 1.25;">
            Do you wish to continue with the purchase?
          </h1>
          <p style="margin: 0 0 16px; font-size: 15px; color: #374151; line-height: 1.5;">
            Your Azure test IDs for <strong>${projectLabel}</strong>
            (request <strong>#${escapeHtml(requestId)}</strong>, ${escapeHtml(accountCount)} accounts)
            have been available for about 24 hours.
          </p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.5;">
            Choose <strong>Yes</strong> to open a purchase form with the same services, permissions,
            and license pre-filled. You can set dates, daily timing, cleanup, budget, and account count.
            Your wallet will be charged when you create the request.
          </p>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <a
              href="${escapeHtml(yesUrl)}"
              style="display: inline-block; background: #15803d; color: #ffffff; text-decoration: none; padding: 14px 22px; border-radius: 10px; font-weight: 700;"
            >
              Yes, continue purchase
            </a>
            <a
              href="${escapeHtml(noUrl)}"
              style="display: inline-block; background: #ffffff; color: #111827; text-decoration: none; padding: 14px 22px; border-radius: 10px; font-weight: 700; border: 1px solid #d1d5db;"
            >
              No, thanks
            </a>
          </div>
          <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280;">
            Sign in to your Racko console if prompted. The purchase page uses your linked wallet.
          </p>
        </div>
      </body>
    </html>
  `;
};

const sendMailWithRetry = async ({ to, subject, html }) => {
  const { transporter, from } = createSmtpTransport();
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await transporter.sendMail({ from, to, subject, html });
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
};

const listDuePurchaseIntentRequests = async () => {
  const result = await db.query(
    `
      SELECT
        id,
        customer_email,
        account_count,
        project_name,
        location
      FROM requests
      WHERE id_mode = 'test_ids'
        AND purchase_intent_due_at IS NOT NULL
        AND purchase_intent_due_at <= NOW()
        AND purchase_intent_sent_at IS NULL
        AND (
          purchase_intent_response IS NULL
          OR purchase_intent_response NOT IN ('no', 'converted')
        )
        AND COALESCE(expired, FALSE) = FALSE
      ORDER BY purchase_intent_due_at ASC
      LIMIT 50
    `
  );

  return result.rows;
};

const sendPurchaseIntentEmailForRequest = async (request, { force = false } = {}) => {
  const requestId = Number(request.id);
  const rawToken = crypto.randomUUID();
  const tokenHash = hashToken(rawToken);
  const baseUrl = resolveFrontendBaseUrl();
  const yesUrl = `${baseUrl}/console/azure/requests/new?fromTestRequest=${requestId}&purchaseToken=${encodeURIComponent(rawToken)}`;
  const noUrl = `${baseUrl}/console/azure/purchase-response?token=${encodeURIComponent(rawToken)}&response=no`;

  const html = buildPurchaseIntentEmailHtml({
    requestId,
    projectName: request.project_name,
    accountCount: request.account_count,
    yesUrl,
    noUrl
  });

  await sendMailWithRetry({
    to: request.customer_email,
    subject: `Continue with Azure purchase? — Request #${requestId}`,
    html
  });

  if (force) {
    await db.query(
      `
        UPDATE requests
        SET
          purchase_intent_sent_at = NOW(),
          purchase_intent_token_hash = $2,
          purchase_intent_response = CASE
            WHEN purchase_intent_response = 'converted' THEN purchase_intent_response
            ELSE NULL
          END,
          purchase_intent_responded_at = CASE
            WHEN purchase_intent_response = 'converted' THEN purchase_intent_responded_at
            ELSE NULL
          END
        WHERE id = $1
      `,
      [requestId, tokenHash]
    );
  } else {
    await db.query(
      `
        UPDATE requests
        SET
          purchase_intent_sent_at = NOW(),
          purchase_intent_token_hash = $2
        WHERE id = $1
          AND purchase_intent_sent_at IS NULL
      `,
      [requestId, tokenHash]
    );
  }

  return { requestId, recipientEmail: request.customer_email };
};

const sendPurchaseIntentEmailByRequestId = async (requestId, { force = true } = {}) => {
  const id = Number(requestId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('requestId must be a positive integer.', 400);
  }

  const result = await db.query(
    `
      SELECT
        id,
        customer_email,
        account_count,
        project_name,
        location,
        id_mode,
        purchase_intent_response
      FROM requests
      WHERE id = $1
    `,
    [id]
  );

  const request = result.rows[0];
  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  if (String(request.id_mode || '').toLowerCase() !== 'test_ids') {
    throw new AppError('Confirmation mail can only be sent for Azure test_ids labs.', 400);
  }

  if (!request.customer_email) {
    throw new AppError('Request has no customer email to send confirmation mail to.', 400);
  }

  if (request.purchase_intent_response === 'converted') {
    throw new AppError('This test lab was already converted to a purchase.', 409);
  }

  return sendPurchaseIntentEmailForRequest(request, { force });
};

const processDuePurchaseIntentEmails = async () => {
  const due = await listDuePurchaseIntentRequests();
  const results = [];

  for (const request of due) {
    try {
      const sent = await sendPurchaseIntentEmailForRequest(request);
      results.push({ ...sent, success: true });
    } catch (error) {
      results.push({
        requestId: request.id,
        success: false,
        message: error?.message || 'Failed to send purchase intent email'
      });
    }
  }

  return results;
};

const getRequestByPurchaseToken = async (rawToken) => {
  const token = String(rawToken || '').trim();
  if (!token) {
    throw new AppError('Purchase token is required.', 400);
  }

  const result = await db.query(
    `
      SELECT *
      FROM requests
      WHERE purchase_intent_token_hash = $1
        AND id_mode = 'test_ids'
      LIMIT 1
    `,
    [hashToken(token)]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Invalid or expired purchase link.', 404);
  }

  return row;
};

const recordPurchaseIntentResponse = async (rawToken, response) => {
  const normalized = String(response || '').toLowerCase();
  if (normalized !== 'yes' && normalized !== 'no') {
    throw new AppError("response must be 'yes' or 'no'.", 400);
  }

  const request = await getRequestByPurchaseToken(rawToken);

  if (request.purchase_intent_response === 'converted') {
    return {
      requestId: request.id,
      response: 'converted',
      alreadyHandled: true
    };
  }

  await db.query(
    `
      UPDATE requests
      SET
        purchase_intent_response = $2,
        purchase_intent_responded_at = NOW()
      WHERE id = $1
    `,
    [request.id, normalized]
  );

  return {
    requestId: request.id,
    response: normalized,
    alreadyHandled: false
  };
};

const buildClonePayloadFromRequest = async (requestId) => {
  const requestResult = await db.query(`SELECT * FROM requests WHERE id = $1`, [requestId]);
  const request = requestResult.rows[0];
  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  const [servicesResult, instancesResult, rolesResult, windowsResult] = await Promise.all([
    db.query(
      `
        SELECT s.id, s.name
        FROM request_services rs
        JOIN services s ON s.id = rs.service_id
        WHERE rs.request_id = $1
        ORDER BY s.id
      `,
      [requestId]
    ),
    db.query(
      `
        SELECT service_id, instance_option
        FROM request_service_instances
        WHERE request_id = $1
      `,
      [requestId]
    ),
    db.query(
      `
        SELECT service_id, azure_role
        FROM request_service_roles
        WHERE request_id = $1
      `,
      [requestId]
    ),
    db.query(
      `
        SELECT
          day_of_week,
          window_start_time,
          window_end_time,
          timezone,
          daily_limit_hours
        FROM request_usage_windows
        WHERE request_id = $1
        ORDER BY day_of_week
      `,
      [requestId]
    )
  ]);

  const rolesByService = new Map();
  for (const row of rolesResult.rows) {
    const serviceId = Number(row.service_id);
    const list = rolesByService.get(serviceId) || [];
    if (row.azure_role) list.push(row.azure_role);
    rolesByService.set(serviceId, list);
  }

  const selectedRoles = [...rolesByService.entries()].map(([serviceId, roles]) => ({
    serviceId,
    roles
  }));

  return {
    sourceRequestId: Number(request.id),
    projectName: request.project_name || `Purchase from test #${request.id}`,
    customerEmail: request.customer_email,
    accountCount: Number(request.account_count) || 1,
    location: request.location,
    costingMode: request.costing_mode || 'shared',
    perUserBudgetUsd:
      request.per_user_budget_usd != null ? Number(request.per_user_budget_usd) : undefined,
    resourceCleanupEnabled: request.resource_cleanup_enabled === true,
    resourceCleanupIntervalHours:
      request.resource_cleanup_interval_hours != null
        ? Number(request.resource_cleanup_interval_hours)
        : undefined,
    resourceCleanupAction: request.resource_cleanup_action === 'pause' ? 'pause' : 'delete',
    microsoftLicenseSkuId: request.microsoft_license_sku_id || null,
    microsoftLicenseSkuPartNumber: request.microsoft_license_sku_part_number || null,
    microsoftLicenseName: request.microsoft_license_sku_part_number
      ? resolveLicenseDisplayName(request.microsoft_license_sku_part_number)
      : null,
    serviceIds: servicesResult.rows.map((row) => Number(row.id)),
    services: servicesResult.rows.map((row) => ({
      id: Number(row.id),
      name: row.name
    })),
    selectedInstances: instancesResult.rows.map((row) => ({
      serviceId: Number(row.service_id),
      instanceOption: row.instance_option
    })),
    selectedRoles,
    usageWindows: windowsResult.rows.map((row) => ({
      day_of_week: Number(row.day_of_week),
      window_start_time: String(row.window_start_time).slice(0, 5),
      window_end_time: String(row.window_end_time).slice(0, 5),
      timezone: row.timezone || 'Asia/Kolkata',
      daily_limit_hours:
        row.daily_limit_hours != null ? Number(row.daily_limit_hours) : undefined
    })),
    idMode: 'azure_ids'
  };
};

const getClonePayloadByPurchaseToken = async (rawToken) => {
  const request = await getRequestByPurchaseToken(rawToken);

  if (request.purchase_intent_response === 'no') {
    throw new AppError('This purchase offer was declined.', 410);
  }

  if (request.purchase_intent_response === 'converted') {
    throw new AppError('This test lab was already converted to a purchase.', 410);
  }

  await db.query(
    `
      UPDATE requests
      SET
        purchase_intent_response = COALESCE(purchase_intent_response, 'yes'),
        purchase_intent_responded_at = COALESCE(purchase_intent_responded_at, NOW())
      WHERE id = $1
        AND (purchase_intent_response IS NULL OR purchase_intent_response = 'yes')
    `,
    [request.id]
  );

  return buildClonePayloadFromRequest(request.id);
};

const markRequestConverted = async (sourceRequestId, newRequestId) => {
  await db.query(
    `
      UPDATE requests
      SET
        purchase_intent_response = 'converted',
        purchase_intent_responded_at = NOW()
      WHERE id = $1
    `,
    [sourceRequestId]
  );

  await db.query(
    `
      UPDATE requests
      SET converted_from_request_id = $2
      WHERE id = $1
    `,
    [newRequestId, sourceRequestId]
  );
};

module.exports = {
  getPurchaseIntentDelayMs,
  processDuePurchaseIntentEmails,
  sendPurchaseIntentEmailByRequestId,
  recordPurchaseIntentResponse,
  getClonePayloadByPurchaseToken,
  buildClonePayloadFromRequest,
  markRequestConverted,
  hashToken
};
