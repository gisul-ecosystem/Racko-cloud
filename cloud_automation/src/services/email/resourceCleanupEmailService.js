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

const buildResourceCleanupEmailHtml = ({
  requestName,
  deletedCount,
  affectedCount,
  action,
  cleanedAt,
  nextCleanupAt,
  intervalHours
}) => {
  const isPause = action === 'pause';
  const title = isPause ? 'Lab resources paused' : 'Lab resources cleaned';
  const summaryLine = isPause
    ? `<li><strong>Resources affected:</strong> ${affectedCount} (VMs deallocated, serverless SQL paused, AKS scaled to 0, App Service stopped; Cosmos DB kept)</li>`
    : `<li><strong>Resources deleted:</strong> ${deletedCount} (VMs, disks, databases, and other Azure resources inside your lab)</li>`;
  const bodyLine = isPause
    ? 'Billable compute resources were paused to reduce cost. Cosmos DB accounts are kept because Azure has no pause action for them. Lab accounts and access remain active.'
    : 'Your lab accounts and access are still active. You can create new resources in Azure until your next daily window closes.';

  return `
    <!doctype html>
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
          <h1 style="margin: 0 0 12px; font-size: 24px;">${title}</h1>
          <p style="margin: 0 0 16px;">
            A scheduled resource ${isPause ? 'pause' : 'cleanup'} ran for your lab:
            <strong>${escapeHtml(requestName)}</strong>.
          </p>
          <ul style="margin: 0 0 16px; padding-left: 20px;">
            ${summaryLine}
            <li><strong>${isPause ? 'Paused' : 'Cleaned'} at:</strong> ${escapeHtml(formatUtc(cleanedAt))}</li>
            <li><strong>Next run:</strong> ${escapeHtml(formatUtc(nextCleanupAt))} (every ${intervalHours} hour${intervalHours > 1 ? 's' : ''})</li>
          </ul>
        <p style="margin: 0 0 16px;">
          ${bodyLine}
        </p>
        <p style="margin: 0; color: #6b7280;">— The Racko Team</p>
      </div>
    </body>
  </html>
`;
};

const sendResourceCleanupEmail = async ({
  to,
  requestName,
  deletedCount,
  affectedCount = deletedCount,
  action = 'delete',
  cleanedAt,
  nextCleanupAt,
  intervalHours
}) => {
  const isPause = action === 'pause';
  const subject = isPause
    ? `[Racko] Lab resources paused — ${requestName}`
    : `[Racko] Lab resources cleaned — ${requestName}`;
  const html = buildResourceCleanupEmailHtml({
    requestName,
    deletedCount,
    affectedCount,
    action,
    cleanedAt,
    nextCleanupAt,
    intervalHours
  });
  return sendMailWithRetry({ to, subject, html });
};

module.exports = {
  sendResourceCleanupEmail
};
