import crypto from 'crypto';
import mongoose from 'mongoose';
import Request from '../models/Request.js';
import { sendEmailWithRetry } from '../provisioners/aws/emailProvisioner.js';

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function getPurchaseIntentDelayMs() {
  const hours = Number(process.env.PURCHASE_INTENT_DELAY_HOURS);
  const resolvedHours = Number.isFinite(hours) && hours >= 0 ? hours : 24;
  return resolvedHours * 60 * 60 * 1000;
}

function resolveFrontendBaseUrl() {
  const base =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_PORTAL_URL ||
    'http://localhost:3000';
  return String(base).replace(/\/$/, '');
}

function buildPurchaseIntentEmailHtml({
  requestId,
  projectName,
  accountCount,
  yesUrl,
  noUrl,
}) {
  const shortId = String(requestId).slice(-6);
  const projectLabel = projectName
    ? escapeHtml(projectName)
    : `Request #${escapeHtml(shortId)}`;

  return `
    <!doctype html>
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px;">
          <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #B91C1C;">
            AWS lab purchase
          </p>
          <h1 style="margin: 0 0 12px; font-size: 24px; line-height: 1.25;">
            Do you wish to continue with the purchase?
          </h1>
          <p style="margin: 0 0 16px; font-size: 15px; color: #374151; line-height: 1.5;">
            Your AWS test IDs for <strong>${projectLabel}</strong>
            (request <strong>#${escapeHtml(shortId)}</strong>, ${escapeHtml(accountCount)} accounts)
            have been available for about 24 hours.
          </p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.5;">
            Choose <strong>Yes</strong> to open a purchase form with the same services and permissions
            pre-filled. You can set dates, daily timing, cleanup, budget, and account count.
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
}

async function listDuePurchaseIntentRequests() {
  const now = new Date();
  return Request.find({
    idMode: 'test_ids',
    purchaseIntentDueAt: { $ne: null, $lte: now },
    purchaseIntentSentAt: null,
    purchaseIntentResponse: { $nin: ['no', 'converted'] },
    status: { $nin: ['Expired', 'Failed'] },
    cleanupCompleted: { $ne: true },
  })
    .sort({ purchaseIntentDueAt: 1 })
    .limit(50)
    .lean();
}

async function sendPurchaseIntentEmailForRequest(request, { force = false } = {}) {
  const requestId = String(request._id);
  const rawToken = crypto.randomUUID();
  const tokenHash = hashToken(rawToken);
  const baseUrl = resolveFrontendBaseUrl();
  const yesUrl = `${baseUrl}/console/aws/requests/new?fromTestRequest=${encodeURIComponent(requestId)}&purchaseToken=${encodeURIComponent(rawToken)}`;
  const noUrl = `${baseUrl}/console/aws/purchase-response?token=${encodeURIComponent(rawToken)}&response=no`;

  const html = buildPurchaseIntentEmailHtml({
    requestId,
    projectName: request.projectName || request.requestName,
    accountCount: request.accountCount,
    yesUrl,
    noUrl,
  });

  await sendEmailWithRetry({
    to: request.customerEmail,
    subject: `Continue with AWS purchase? — Request #${requestId.slice(-6)}`,
    html,
  });

  const update = {
    purchaseIntentSentAt: new Date(),
    purchaseIntentTokenHash: tokenHash,
    updatedAt: new Date(),
  };

  if (force) {
    if (request.purchaseIntentResponse !== 'converted') {
      update.purchaseIntentResponse = null;
      update.purchaseIntentRespondedAt = null;
    }
    await Request.findByIdAndUpdate(requestId, { $set: update });
  } else {
    await Request.findOneAndUpdate(
      { _id: requestId, purchaseIntentSentAt: null },
      { $set: update }
    );
  }

  return { requestId, recipientEmail: request.customerEmail };
}

export async function sendPurchaseIntentEmailByRequestId(requestId, { force = true } = {}) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw createError('Invalid request id', 400);
  }

  const request = await Request.findById(requestId).lean();
  if (!request) {
    throw createError('Request not found.', 404);
  }

  if (String(request.idMode || '').toLowerCase() !== 'test_ids') {
    throw createError('Confirmation mail can only be sent for AWS test_ids labs.', 400);
  }

  if (!request.customerEmail) {
    throw createError('Request has no customer email to send confirmation mail to.', 400);
  }

  if (request.purchaseIntentResponse === 'converted') {
    throw createError('This test lab was already converted to a purchase.', 409);
  }

  return sendPurchaseIntentEmailForRequest(request, { force });
}

export async function processDuePurchaseIntentEmails() {
  const due = await listDuePurchaseIntentRequests();
  const results = [];

  for (const request of due) {
    try {
      const sent = await sendPurchaseIntentEmailForRequest(request);
      results.push({ ...sent, success: true });
    } catch (error) {
      results.push({
        requestId: String(request._id),
        success: false,
        message: error?.message || 'Failed to send purchase intent email',
      });
    }
  }

  return results;
}

async function getRequestByPurchaseToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) {
    throw createError('Purchase token is required.', 400);
  }

  const request = await Request.findOne({
    purchaseIntentTokenHash: hashToken(token),
    idMode: 'test_ids',
  }).lean();

  if (!request) {
    throw createError('Invalid or expired purchase link.', 404);
  }

  return request;
}

export async function recordPurchaseIntentResponse(rawToken, response) {
  const normalized = String(response || '').toLowerCase();
  if (normalized !== 'yes' && normalized !== 'no') {
    throw createError("response must be 'yes' or 'no'.", 400);
  }

  const request = await getRequestByPurchaseToken(rawToken);

  if (request.purchaseIntentResponse === 'converted') {
    return {
      requestId: String(request._id),
      response: 'converted',
      alreadyHandled: true,
    };
  }

  await Request.findByIdAndUpdate(request._id, {
    $set: {
      purchaseIntentResponse: normalized,
      purchaseIntentRespondedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return {
    requestId: String(request._id),
    response: normalized,
    alreadyHandled: false,
  };
}

function buildClonePayloadFromRequest(request) {
  return {
    sourceRequestId: String(request._id),
    projectName: request.projectName || request.requestName || '',
    customerEmail: request.customerEmail || '',
    accountCount: request.accountCount || 1,
    region: request.region || '',
    costingMode: request.costingMode || 'shared',
    accessType: request.accessType || 'magic_link',
    usageWindows: request.usageWindows || [],
    enableDailyUsage: Boolean(request.enableDailyUsage),
    resourceCleanupEnabled: Boolean(request.enableResourceCleanup),
    resourceCleanupTime: request.resourceCleanupTime || '',
    resourceCleanupTimezone: request.resourceCleanupTimezone || request.timezone || 'Asia/Kolkata',
    resourceCleanupIntervalHours: request.resourceCleanupIntervalHours || null,
    perUserBudgetUsd: request.perUserBudgetUsd ?? null,
    timezone: request.timezone || 'Asia/Kolkata',
    selectedServices: (request.selectedServices || []).map((service) => ({
      serviceId: String(service.serviceId || service._id || ''),
      serviceName: service.serviceName,
      instanceType: service.instanceType || null,
      pricingType: service.pricingType || 'instance',
    })),
    permissions: (request.permissions || []).map((entry) => ({
      serviceId: String(entry.serviceId || ''),
      serviceName: entry.serviceName,
      policies: entry.policies || [],
    })),
  };
}

export async function getClonePayloadByPurchaseToken(rawToken) {
  const request = await getRequestByPurchaseToken(rawToken);

  if (request.purchaseIntentResponse === 'converted') {
    throw createError('This test lab was already converted to a purchase.', 409);
  }

  if (request.purchaseIntentResponse !== 'yes') {
    await Request.findByIdAndUpdate(request._id, {
      $set: {
        purchaseIntentResponse: 'yes',
        purchaseIntentRespondedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  return buildClonePayloadFromRequest(request);
}

export async function markRequestConverted(sourceRequestId, newRequestId) {
  if (!mongoose.Types.ObjectId.isValid(sourceRequestId)) return;

  await Request.findByIdAndUpdate(sourceRequestId, {
    $set: {
      purchaseIntentResponse: 'converted',
      purchaseIntentRespondedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  if (mongoose.Types.ObjectId.isValid(newRequestId)) {
    await Request.findByIdAndUpdate(newRequestId, {
      $set: {
        convertedFromRequestId: sourceRequestId,
        updatedAt: new Date(),
      },
    });
  }
}
