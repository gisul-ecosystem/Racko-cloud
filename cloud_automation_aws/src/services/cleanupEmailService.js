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

function buildLabExpiryEmailHtml({
  requestLabel,
  deletedCount,
  rolesRemoved,
  usersRemoved,
  cleanedAt,
  endDate,
}) {
  return `<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
    <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
      <h1 style="margin: 0 0 12px; font-size: 24px;">AWS lab expired — full cleanup completed</h1>
      <p style="margin: 0 0 16px;">
        Your AWS lab <strong>${escapeHtml(requestLabel)}</strong> has reached its end date and all associated access and resources have been removed.
      </p>
      <ul style="margin: 0 0 16px; padding-left: 20px;">
        <li><strong>Lab end date:</strong> ${escapeHtml(new Date(endDate).toUTCString())}</li>
        <li><strong>Cleaned at:</strong> ${escapeHtml(cleanedAt.toUTCString())}</li>
        <li><strong>AWS resources removed:</strong> ${deletedCount}</li>
        <li><strong>IAM roles removed:</strong> ${rolesRemoved}</li>
        <li><strong>IAM users removed:</strong> ${usersRemoved}</li>
      </ul>
      <p style="margin: 0 0 16px;">
        All tagged AWS resources, IAM roles, and IAM users for this lab have been deleted. Lab access is no longer available.
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

export async function sendLabExpiryCleanupEmail({
  to,
  requestLabel,
  deletedCount,
  rolesRemoved,
  usersRemoved,
  cleanedAt,
  endDate,
}) {
  if (!to) {
    console.log('[cleanupEmail] No recipient — skipping lab expiry email');
    return { sent: false, mode: 'skipped' };
  }

  return sendEmailWithRetry({
    to,
    subject: `[Racko] AWS lab expired — ${requestLabel}`,
    html: buildLabExpiryEmailHtml({
      requestLabel,
      deletedCount,
      rolesRemoved,
      usersRemoved,
      cleanedAt,
      endDate,
    }),
  });
}
