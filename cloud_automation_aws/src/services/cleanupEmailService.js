import { sendEmailWithRetry } from '../provisioners/aws/emailProvisioner.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

function buildResourceCleanupEmailHtml({
  requestLabel,
  deletedCount,
  cleanedAt,
  nextCleanupAt,
  intervalHours,
}) {
  return `<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
    <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
      <h1 style="margin: 0 0 12px; font-size: 24px;">AWS lab resources cleaned</h1>
      <p style="margin: 0 0 16px;">
        A scheduled resource cleanup ran for your lab:
        <strong>${escapeHtml(requestLabel)}</strong>.
      </p>
      <ul style="margin: 0 0 16px; padding-left: 20px;">
        <li><strong>Resources removed:</strong> ${deletedCount} (EC2, RDS, S3, Lambda, and other tagged AWS resources)</li>
        <li><strong>Cleaned at:</strong> ${escapeHtml(cleanedAt.toUTCString())}</li>
        <li><strong>Next cleanup:</strong> ${escapeHtml(nextCleanupAt.toUTCString())} (every ${intervalHours} hour${intervalHours > 1 ? 's' : ''})</li>
      </ul>
      <p style="margin: 0 0 16px;">
        Your lab IAM access is still active. You can create new AWS resources until your lab end date.
      </p>
      <p style="margin: 0; color: #6b7280;">— The Racko Team</p>
    </div>
  </body>
</html>`;
}

export async function sendResourceCleanupEmail({
  to,
  requestLabel,
  deletedCount,
  cleanedAt,
  nextCleanupAt,
  intervalHours,
}) {
  if (!to) {
    console.log('[cleanupEmail] No recipient — skipping resource cleanup email');
    return { sent: false, mode: 'skipped' };
  }

  return sendEmailWithRetry({
    to,
    subject: `[Racko] AWS lab resources cleaned — ${requestLabel}`,
    html: buildResourceCleanupEmailHtml({
      requestLabel,
      deletedCount,
      cleanedAt,
      nextCleanupAt,
      intervalHours,
    }),
  });
}

export async function sendLabExpiryCleanupEmail() {
  // Lab-expiry teardown must never email customers. Only the 1-day-before warning is allowed.
  console.log('[cleanupEmail] Lab expiry cleanup email suppressed (no mail after expiry)');
  return { sent: false, mode: 'suppressed' };
}

export async function sendLabExpiryWarningEmail({ to, requestLabel, region, endDate }) {
  if (!to) {
    console.log('[cleanupEmail] No recipient — skipping lab expiry warning email');
    return { sent: false, mode: 'skipped' };
  }

  const expiresAt = endDate ? new Date(endDate).toUTCString() : 'within 24 hours';

  return sendEmailWithRetry({
    to,
    subject: `[Racko] AWS lab expires in 24 hours — ${requestLabel}`,
    html: `<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
    <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
      <h1 style="margin: 0 0 12px; font-size: 24px;">AWS lab expires in 24 hours</h1>
      <p style="margin: 0 0 16px;">
        Your AWS lab <strong>${escapeHtml(requestLabel)}</strong> is scheduled to expire soon.
      </p>
      <ul style="margin: 0 0 16px; padding-left: 20px;">
        <li><strong>Region:</strong> ${escapeHtml(region || '—')}</li>
        <li><strong>Expires:</strong> ${escapeHtml(expiresAt)}</li>
      </ul>
      <p style="margin: 0 0 16px;">
        After expiry, lab access and resources will be cleaned up automatically. No further cleanup emails will be sent after the lab expires.
      </p>
      <p style="margin: 0; color: #6b7280;">— The Racko Team</p>
    </div>
  </body>
</html>`,
  });
}
