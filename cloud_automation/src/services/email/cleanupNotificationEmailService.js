const { sendMailWithRetry } = require('./mailSender');

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toDate = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (value == null || value === '') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatUtc = (value) => {
  const date = toDate(value);
  return date ? date.toUTCString() : '—';
};

const buildCleanupNotificationEmailHtml = ({
  requestId,
  requestLabel,
  cleanedAt,
  nextCleanupAt,
  intervalHours
}) => `
  <!doctype html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 12px; font-size: 24px;">Scheduled cleanup completed</h1>
        <p style="margin: 0 0 16px;">
          A scheduled cleanup was successfully completed for your lab request:
          <strong>${escapeHtml(requestLabel || `Request #${requestId}`)}</strong>.
        </p>
        <ul style="margin: 0 0 16px; padding-left: 20px;">
          <li><strong>Cleaned at:</strong> ${escapeHtml(formatUtc(cleanedAt))}</li>
          <li><strong>Next cleanup:</strong> ${escapeHtml(formatUtc(nextCleanupAt))} (every ${intervalHours} hour${intervalHours > 1 ? 's' : ''})</li>
        </ul>
        <p style="margin: 0 0 16px;">
          All Azure resources (VMs, resource groups, user accounts) for this request have been removed.
          They can be re-provisioned from the Racko portal when needed.
        </p>
        <p style="margin: 0; color: #6b7280;">— The Racko Team</p>
      </div>
    </body>
  </html>
`;

const sendCleanupNotificationEmailWithRetry = async ({
  to,
  requestId,
  requestLabel,
  cleanedAt,
  nextCleanupAt,
  intervalHours
}) => {
  const subject = `[Racko] Scheduled cleanup completed — ${requestLabel || `Request #${requestId}`}`;
  const html = buildCleanupNotificationEmailHtml({
    requestId,
    requestLabel,
    cleanedAt,
    nextCleanupAt,
    intervalHours
  });
  return sendMailWithRetry({ to, subject, html });
};

module.exports = {
  buildCleanupNotificationEmailHtml,
  sendCleanupNotificationEmailWithRetry
};
