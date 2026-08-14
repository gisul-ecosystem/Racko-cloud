const { sendMailWithRetry } = require('./mailSender');

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatPortalExpiryText = (expiresAt) => {
  if (!expiresAt) {
    return 'Link expires in 7 days.';
  }

  const parsed = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (!Number.isFinite(parsed.getTime())) {
    return 'Link expires in 7 days.';
  }

  return `Link expires on ${parsed.toUTCString()} (when the lab ends).`;
};

const buildAccessPortalEmailHtml = ({ requestId, manageUrl, expiresAt }) => `
  <!doctype html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 12px; font-size: 24px;">Your Azure Access Portal</h1>
        <p style="margin: 0 0 16px;">Provisioning completed for request <strong>#${escapeHtml(requestId)}</strong>.</p>
        <p style="margin: 0 0 20px;">
          Manage users here:
          <a href="${escapeHtml(manageUrl)}" style="color: #2563eb; word-break: break-all;">${escapeHtml(manageUrl)}</a>
        </p>
        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          ${escapeHtml(formatPortalExpiryText(expiresAt))}
        </p>
      </div>
    </body>
  </html>
`;

const sendAccessPortalEmailWithRetry = async ({ to, subject, html }) =>
  sendMailWithRetry({ to, subject, html });

module.exports = {
  buildAccessPortalEmailHtml,
  sendAccessPortalEmailWithRetry
};
