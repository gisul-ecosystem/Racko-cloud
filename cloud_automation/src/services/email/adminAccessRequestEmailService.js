const { sendMailWithRetry } = require('./mailSender');

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const buildRolesListHtml = (roles = []) => {
  if (!roles.length) {
    return '<p style="margin: 0;">No specific roles were matched from your request.</p>';
  }

  return `
    <ul style="margin: 0; padding-left: 20px;">
      ${roles.map((role) => `<li>${escapeHtml(role)}</li>`).join('')}
    </ul>
  `;
};

const buildApprovedEmailHtml = ({
  serviceName,
  requestedAccess,
  grantedRoles,
  accessApplied,
  reviewNotes
}) => `
  <!doctype html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 12px; font-size: 24px;">Admin Access Request Approved</h1>
        <p style="margin: 0 0 16px;">
          Your request for elevated access to <strong>${escapeHtml(serviceName)}</strong> has been approved.
        </p>
        <p style="margin: 0 0 8px; font-weight: 600;">Requested access</p>
        <p style="margin: 0 0 16px; white-space: pre-wrap;">${escapeHtml(requestedAccess)}</p>
        <p style="margin: 0 0 8px; font-weight: 600;">
          ${accessApplied ? 'Permissions granted' : 'Permissions scheduled'}
        </p>
        ${buildRolesListHtml(grantedRoles)}
        <p style="margin: 16px 0 0; color: #374151;">
          ${
            accessApplied
              ? 'These permissions have been applied to your Azure user account(s). You can sign in and use the elevated access now.'
              : 'These permissions will be applied automatically once your Azure environment is ready.'
          }
        </p>
        ${
          reviewNotes
            ? `<p style="margin: 16px 0 0; padding: 12px; background: #f3f4f6; border-radius: 8px;"><strong>Review notes:</strong> ${escapeHtml(reviewNotes)}</p>`
            : ''
        }
      </div>
    </body>
  </html>
`;

const buildRejectedEmailHtml = ({ serviceName, requestedAccess, reviewNotes }) => `
  <!doctype html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 12px; font-size: 24px;">Admin Access Request Update</h1>
        <p style="margin: 0 0 16px;">
          Your request for elevated access to <strong>${escapeHtml(serviceName)}</strong> was not approved at this time.
        </p>
        <p style="margin: 0 0 8px; font-weight: 600;">Requested access</p>
        <p style="margin: 0 0 16px; white-space: pre-wrap;">${escapeHtml(requestedAccess)}</p>
        ${
          reviewNotes
            ? `<p style="margin: 0; padding: 12px; background: #f3f4f6; border-radius: 8px;"><strong>Review notes:</strong> ${escapeHtml(reviewNotes)}</p>`
            : '<p style="margin: 0; color: #374151;">Contact your organization admin if you need more details.</p>'
        }
      </div>
    </body>
  </html>
`;

const sendAdminAccessDecisionEmailWithRetry = async ({ to, subject, html }) =>
  sendMailWithRetry({ to, subject, html });

const sendAdminAccessDecisionEmail = async ({
  customerEmail,
  serviceName,
  requestedAccess,
  status,
  grantedRoles = [],
  accessApplied = false,
  reviewNotes = null
}) => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const isApproved = normalizedStatus === 'approved';
  const html = isApproved
    ? buildApprovedEmailHtml({
        serviceName,
        requestedAccess,
        grantedRoles,
        accessApplied,
        reviewNotes
      })
    : buildRejectedEmailHtml({
        serviceName,
        requestedAccess,
        reviewNotes
      });

  await sendAdminAccessDecisionEmailWithRetry({
    to: customerEmail,
    subject: isApproved
      ? `Admin Access Approved — ${serviceName}`
      : `Admin Access Request Update — ${serviceName}`,
    html
  });
};

module.exports = {
  buildApprovedEmailHtml,
  buildRejectedEmailHtml,
  sendAdminAccessDecisionEmail,
  sendAdminAccessDecisionEmailWithRetry
};
