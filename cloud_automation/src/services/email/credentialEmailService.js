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
    return 'This secure link expires in 7 days.';
  }

  const parsed = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (!Number.isFinite(parsed.getTime())) {
    return 'This secure link expires in 7 days.';
  }

  return `This secure link expires on ${parsed.toUTCString()} (when the lab ends).`;
};

const buildCredentialEmailHtml = ({ requestId, users, adminCredentials, portalLink, expiresAt }) => {
  const rowsHtml = users
    .map(
      (user, index) => `
        <tr>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px;">${index + 1}</td>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px;">${escapeHtml(user.username)}</td>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px;">${escapeHtml(user.temporary_password)}</td>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px;">${escapeHtml(user.azure_user_id)}</td>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px;">${escapeHtml(user.status || 'active')}</td>
        </tr>
      `
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px;">
          <h1 style="margin: 0 0 8px; font-size: 26px; line-height: 1.2;">Your Azure Access Portal</h1>
          <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">Provisioning completed for request <strong>#${escapeHtml(requestId)}</strong>.</p>
          <div style="overflow-x: auto;">
          <table style="border-collapse: collapse; width: 100%; min-width: 680px; border: 1px solid #e5e7eb; border-radius: 12px;">
            <thead>
              <tr>
                <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">#</th>
                <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Username</th>
                <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Temporary Password</th>
                <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Azure User ID</th>
                <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          </div>
          <div style="margin-top: 24px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 14px; background: #f9fafb;">
            <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #374151;">Admin Portal Login</p>
            <table style="border-collapse: collapse; width: 100%; margin: 0 0 16px;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; width: 150px;">Username</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(adminCredentials?.username || '')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Temporary Password</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(adminCredentials?.temporaryPassword || '')}</td>
              </tr>
            </table>
            <a
              href="${escapeHtml(portalLink)}"
              style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 700;"
            >
              Open Admin Portal
            </a>
            <p style="margin: 14px 0 0; font-size: 14px; word-break: break-all;">
              <a href="${escapeHtml(portalLink)}" style="color: #2563eb;">${escapeHtml(portalLink)}</a>
            </p>
          </div>
          <p style="margin: 18px 0 0; font-size: 13px; color: #6b7280;">
            Attachments included:
          </p>
          <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 13px; color: #6b7280;">
            <li style="margin-bottom: 4px;"><strong>Excel</strong> — portal link plus all learner usernames and passwords for distribution.</li>
            <li><strong>Word guide</strong> — step-by-step Manage Portal login and how to open the Azure Portal.</li>
          </ul>
          <p style="margin: 12px 0 0; font-size: 13px; color: #6b7280;">
            ${escapeHtml(formatPortalExpiryText(expiresAt))}
          </p>
          <p style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">
            Use the temporary admin credentials above to sign in before managing users.
          </p>
        </div>
      </body>
    </html>
  `;
};

const buildTestIdsCredentialEmailHtml = ({
  requestId,
  users,
  adminCredentials,
  portalLink,
  projectName
}) => {
  const rowsHtml = users
    .map(
      (user, index) => `
        <tr>
          <td style="border-bottom: 1px solid #fde68a; padding: 12px 10px;">${index + 1}</td>
          <td style="border-bottom: 1px solid #fde68a; padding: 12px 10px; font-family: Consolas, monospace;">${escapeHtml(user.username)}</td>
          <td style="border-bottom: 1px solid #fde68a; padding: 12px 10px; font-family: Consolas, monospace;">${escapeHtml(user.temporary_password)}</td>
          <td style="border-bottom: 1px solid #fde68a; padding: 12px 10px;">${escapeHtml(user.status || 'Created')}</td>
        </tr>
      `
    )
    .join('');

  const projectLabel = projectName ? escapeHtml(projectName) : `Request #${escapeHtml(requestId)}`;

  return `
    <!doctype html>
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fffbeb; margin: 0; padding: 24px;">
        <div style="max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #f59e0b; border-radius: 16px; padding: 28px;">
          <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #b45309;">
            Azure test IDs
          </p>
          <h1 style="margin: 0 0 8px; font-size: 26px; line-height: 1.2; color: #92400e;">
            Your Azure Test Lab is Ready
          </h1>
          <p style="margin: 0 0 20px; font-size: 16px; color: #78350f;">
            Short-lived test IDs for <strong>${projectLabel}</strong> (request <strong>#${escapeHtml(requestId)}</strong>) are provisioned.
            Sign in to the manage portal below to access Azure with the same credentials.
          </p>
          <div style="overflow-x: auto;">
          <table style="border-collapse: collapse; width: 100%; min-width: 640px; border: 1px solid #fde68a; border-radius: 12px;">
            <thead>
              <tr>
                <th style="border-bottom: 1px solid #f59e0b; text-align: left; padding: 12px 10px; background: #fffbeb; font-size: 12px; text-transform: uppercase; color: #92400e;">#</th>
                <th style="border-bottom: 1px solid #f59e0b; text-align: left; padding: 12px 10px; background: #fffbeb; font-size: 12px; text-transform: uppercase; color: #92400e;">Username</th>
                <th style="border-bottom: 1px solid #f59e0b; text-align: left; padding: 12px 10px; background: #fffbeb; font-size: 12px; text-transform: uppercase; color: #92400e;">Temporary Password</th>
                <th style="border-bottom: 1px solid #f59e0b; text-align: left; padding: 12px 10px; background: #fffbeb; font-size: 12px; text-transform: uppercase; color: #92400e;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          </div>
          <div style="margin-top: 24px; padding: 20px; border: 1px solid #f59e0b; border-radius: 14px; background: #fffbeb;">
            <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #92400e;">Manage Portal Login</p>
            <table style="border-collapse: collapse; width: 100%; margin: 0 0 16px;">
              <tr>
                <td style="padding: 8px 0; color: #a16207; width: 150px;">Username</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(adminCredentials?.username || '')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a16207;">Temporary Password</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(adminCredentials?.temporaryPassword || '')}</td>
              </tr>
            </table>
            <a
              href="${escapeHtml(portalLink)}"
              style="display: inline-block; background: #b45309; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 700;"
            >
              Open Manage Portal
            </a>
            <p style="margin: 14px 0 0; font-size: 14px; word-break: break-all;">
              <a href="${escapeHtml(portalLink)}" style="color: #b45309;">${escapeHtml(portalLink)}</a>
            </p>
          </div>
          <p style="margin: 18px 0 0; font-size: 13px; color: #92400e;">
            Attachments: Excel credentials for distribution, plus a Word guide covering Manage Portal login and Azure Portal access.
          </p>
          <p style="margin: 8px 0 0; font-size: 13px; color: #92400e;">
            This is a 24-hour test lab. We will email you shortly about continuing with a full purchase.
          </p>
        </div>
      </body>
    </html>
  `;
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

const buildNewUserCredentialEmailHtml = ({
  requestId,
  user,
  adminCredentials,
  portalLink,
  costingMode
}) => {
  const isPerUser = String(costingMode || '').toLowerCase() === 'per_user';
  const resourceGroupLine = user.resource_group_name
    ? `<p style="margin: 0 0 12px; font-size: 14px; color: #374151;">
         Resource group: <strong>${escapeHtml(user.resource_group_name)}</strong>
       </p>`
    : '';

  return `
    <!doctype html>
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px;">
          <h1 style="margin: 0 0 8px; font-size: 24px; line-height: 1.2;">New Azure Lab User Added</h1>
          <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">
            A new learner account was added to request <strong>#${escapeHtml(requestId)}</strong>.
          </p>
          ${isPerUser ? '<p style="margin: 0 0 12px; font-size: 14px; color: #374151;">This lab uses per-user resource groups — a dedicated resource group was created for this user.</p>' : ''}
          <div style="padding: 20px; border: 1px solid #e5e7eb; border-radius: 14px; background: #f9fafb;">
            <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #374151;">New User Credentials</p>
            <table style="border-collapse: collapse; width: 100%; margin: 0 0 8px;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; width: 150px;">Username</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(user.username)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Azure User ID</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(user.azure_user_id || '')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Temporary Password</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(user.temporary_password)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Status</td>
                <td style="padding: 8px 0; color: #111827;">${escapeHtml(user.status || 'Created')}</td>
              </tr>
            </table>
            ${resourceGroupLine}
          </div>
          <div style="margin-top: 24px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 14px; background: #f9fafb;">
            <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #374151;">Manage Portal Login</p>
            <table style="border-collapse: collapse; width: 100%; margin: 0 0 16px;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; width: 150px;">Username</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(adminCredentials?.username || '')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Temporary Password</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(adminCredentials?.temporaryPassword || '')}</td>
              </tr>
            </table>
            <a
              href="${escapeHtml(portalLink)}"
              style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 700;"
            >
              Open Manage Portal
            </a>
            <p style="margin: 14px 0 0; font-size: 14px; word-break: break-all;">
              <a href="${escapeHtml(portalLink)}" style="color: #2563eb;">${escapeHtml(portalLink)}</a>
            </p>
          </div>
          <p style="margin: 18px 0 0; font-size: 13px; color: #6b7280;">
            This user has the same Azure roles and permissions as the other learners in this lab.
          </p>
        </div>
      </body>
    </html>
  `;
};

const buildBulkNewUserCredentialEmailHtml = ({
  requestId,
  users,
  adminCredentials,
  portalLink,
  costingMode
}) => {
  const isPerUser = String(costingMode || '').toLowerCase() === 'per_user';
  const rowsHtml = users
    .map(
      (user, index) => `
        <tr>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px;">${index + 1}</td>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px; font-family: Consolas, monospace;">${escapeHtml(user.username)}</td>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px; font-family: Consolas, monospace;">${escapeHtml(user.azure_user_id || '')}</td>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px; font-family: Consolas, monospace;">${escapeHtml(user.temporary_password)}</td>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 10px;">${escapeHtml(user.status || 'Created')}</td>
        </tr>
      `
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px;">
          <h1 style="margin: 0 0 8px; font-size: 24px; line-height: 1.2;">New Azure Lab Users Added</h1>
          <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">
            ${users.length} new learner account${users.length === 1 ? '' : 's'} ${users.length === 1 ? 'was' : 'were'} added to request <strong>#${escapeHtml(requestId)}</strong>.
          </p>
          ${isPerUser ? '<p style="margin: 0 0 12px; font-size: 14px; color: #374151;">This lab uses per-user resource groups — a dedicated resource group was created for each user.</p>' : ''}
          <div style="overflow-x: auto;">
            <table style="border-collapse: collapse; width: 100%; min-width: 680px; border: 1px solid #e5e7eb; border-radius: 12px;">
              <thead>
                <tr>
                  <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">#</th>
                  <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Username</th>
                  <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Azure User ID</th>
                  <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Temporary Password</th>
                  <th style="border-bottom: 1px solid #d1d5db; text-align: left; padding: 12px 10px; background: #f9fafb; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div style="margin-top: 24px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 14px; background: #f9fafb;">
            <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #374151;">Manage Portal Login</p>
            <table style="border-collapse: collapse; width: 100%; margin: 0 0 16px;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; width: 150px;">Username</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(adminCredentials?.username || '')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Temporary Password</td>
                <td style="padding: 8px 0; font-family: Consolas, monospace; color: #111827;">${escapeHtml(adminCredentials?.temporaryPassword || '')}</td>
              </tr>
            </table>
            <a
              href="${escapeHtml(portalLink)}"
              style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 700;"
            >
              Open Manage Portal
            </a>
            <p style="margin: 14px 0 0; font-size: 14px; word-break: break-all;">
              <a href="${escapeHtml(portalLink)}" style="color: #2563eb;">${escapeHtml(portalLink)}</a>
            </p>
          </div>
          <p style="margin: 18px 0 0; font-size: 13px; color: #6b7280;">
            These users have the same Azure roles and permissions as the other learners in this lab.
          </p>
        </div>
      </body>
    </html>
  `;
};

const sendCredentialEmailWithRetry = async ({ to, subject, html, attachments = [] }) =>
  sendMailWithRetry({ to, subject, html, attachments });

module.exports = {
  buildCredentialEmailHtml,
  buildTestIdsCredentialEmailHtml,
  buildAccessPortalEmailHtml,
  buildNewUserCredentialEmailHtml,
  buildBulkNewUserCredentialEmailHtml,
  sendCredentialEmailWithRetry
};
