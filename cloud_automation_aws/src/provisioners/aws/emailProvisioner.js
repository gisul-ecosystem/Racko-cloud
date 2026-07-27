import nodemailer from 'nodemailer';

function buildTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function buildRequiredTagsSection({ request, labRoles = [], identityUsers = [] }) {
  const requestId = String(request._id);

  const users = labRoles.length
    ? labRoles.map((role) => ({
        label: `User ${role.userIndex + 1}`,
        userIndex: role.userIndex,
        username: null,
      }))
    : identityUsers.map((user) => ({
        label: `User ${user.userIndex + 1}`,
        userIndex: user.userIndex,
        username: user.username || null,
      }));

  const perUserRows = users
    .flatMap((user) => {
      const rows = [
        `<tr>
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">${user.label}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;"><code>racko:user-index</code></td>
          <td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;">${user.userIndex + 1}</td>
        </tr>`,
      ];

      if (user.username) {
        rows.push(`<tr>
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">${user.label}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;"><code>racko:user</code></td>
          <td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;">${user.username}</td>
        </tr>`);
      }

      return rows;
    })
    .join('');

  return `
      <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:20px;margin-bottom:24px;">
        <h3 style="color:#1e40af;margin:0 0 8px;font-size:14px;">🏷️ Required Tags for Creating Resources</h3>
        <p style="font-size:13px;color:#374151;margin:0 0 12px;">
          When creating EC2, RDS, S3, Lambda, DynamoDB, EKS, and other AWS resources, you <strong>must</strong> apply these tags at creation time. Without them, resource creation will be denied by IAM policy.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
          <tr style="background:#dbeafe;">
            <th style="padding:8px;border:1px solid #93c5fd;text-align:left;color:#1e40af;">Tag Key</th>
            <th style="padding:8px;border:1px solid #93c5fd;text-align:left;color:#1e40af;">Value</th>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;"><code>racko:request</code></td>
            <td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;">${requestId}</td>
          </tr>
        </table>
        ${
          users.length
            ? `<p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Per-user tags (use the values for your assigned user):</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#dbeafe;">
            <th style="padding:8px;border:1px solid #93c5fd;text-align:left;color:#1e40af;">User</th>
            <th style="padding:8px;border:1px solid #93c5fd;text-align:left;color:#1e40af;">Tag Key</th>
            <th style="padding:8px;border:1px solid #93c5fd;text-align:left;color:#1e40af;">Value</th>
          </tr>
          ${perUserRows}
        </table>`
            : ''
        }
        <p style="font-size:12px;color:#6b7280;margin:12px 0 0;">
          Supported services are auto-tagged after creation by the Racko auto-tagger, but tags must be present at create time to pass IAM checks.
        </p>
      </div>`;
}

function buildMagicLinkEmail({ request, labRoles, portalSession, portalUrl, awsAccountId, allowedServices }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;color:#111827;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:720px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#B91C1C;padding:32px;">
      <h1 style="color:#fff;margin:0;font-size:24px;">✅ AWS Lab Access Ready</h1>
      <p style="color:#fca5a5;margin:8px 0 0;">Magic Link Access — ${labRoles.length} users provisioned</p>
    </div>
    <div style="padding:32px;">
      <table style="width:100%;margin-bottom:24px;font-size:14px;">
        <tr><td style="padding:8px 0;color:#6b7280;width:180px;">AWS Account</td><td style="font-weight:600;">${awsAccountId}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Region</td><td style="font-weight:600;">${request.region}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Services</td><td style="font-weight:600;">${allowedServices.join(', ')}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Users</td><td style="font-weight:600;">${labRoles.length} lab users</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Access Type</td><td style="font-weight:600;">🔗 Magic Link (12hr sessions)</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Lab Expires</td><td style="font-weight:600;">${new Date(request.endDate).toDateString()}</td></tr>
      </table>

      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:24px;margin-bottom:24px;text-align:center;">
        <h2 style="color:#B91C1C;margin:0 0 8px;">🖥️ Open Your Manage Portal</h2>
        <p style="color:#374151;font-size:13px;margin:0 0 16px;">
          Log in to generate one-click AWS console links for each lab user.
        </p>
        <a href="${portalUrl}" style="background:#B91C1C;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;margin-bottom:16px;">
          Open Manage Portal →
        </a>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:16px;text-align:left;display:inline-block;min-width:280px;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Portal credentials:</p>
          <table style="font-size:13px;">
            <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Username</td><td style="font-family:monospace;font-weight:600;">${portalSession.username}</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Password</td><td style="font-family:monospace;font-weight:600;">${portalSession.password}</td></tr>
          </table>
        </div>
      </div>

      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin-bottom:24px;">
        <h3 style="color:#166534;margin:0 0 12px;font-size:14px;">How to give users access</h3>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:#374151;line-height:2.2;">
          <li>Open the manage portal with credentials above</li>
          <li>Find the lab user in the table</li>
          <li>Click <strong>Launch AWS Console</strong></li>
          <li>Copy the magic link and share with that lab user</li>
          <li>Lab user clicks link → directly into AWS console (no password)</li>
          <li>Links expire after 12 hours — regenerate as needed</li>
        </ol>
      </div>

      ${buildRequiredTagsSection({ request, labRoles })}

      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;">
        <h3 style="color:#92400e;margin:0 0 8px;font-size:13px;">⚠️ Magic Link Info</h3>
        <p style="font-size:13px;color:#374151;margin:0;">
          Each magic link is valid for 12 hours. When a link expires, return to the manage portal and click Launch AWS Console to generate a fresh link. Budget and cleanup controls are available in the manage portal.
        </p>
      </div>

      <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px;">
        Racko Cloud Automation · Lab expires ${new Date(request.endDate).toDateString()} · Do not reply
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildIdentityCenterEmail({ request, identityUsers, portalSession, portalUrl }) {
  const userRows = identityUsers
    .map(
      (user) => `
    <tr>
      <td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold;">
        User ${user.userIndex + 1}
      </td>
      <td style="padding:10px;border:1px solid #e2e8f0;">
        <a href="${user.consoleUrl}" style="color:#FF9900;">${user.consoleUrl}</a>
      </td>
      <td style="padding:10px;border:1px solid #e2e8f0;">
        <code style="background:#F5F7FA;padding:2px 8px;border-radius:4px;">${user.username}</code>
      </td>
      <td style="padding:10px;border:1px solid #e2e8f0;">
        <code style="background:#F5F7FA;padding:2px 8px;border-radius:4px;">${user.password}</code>
      </td>
    </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:20px;">
  <div style="background:#0F2744;padding:24px;border-radius:8px 8px 0 0;">
    <h1 style="color:#FF9900;margin:0;">Your AWS Lab is Ready</h1>
    <p style="color:#CBD5E0;margin:8px 0 0;">
      Request ID: ${request._id} &nbsp;·&nbsp;
      Valid until: ${new Date(request.endDate).toLocaleDateString()}
    </p>
  </div>
  <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px;">
    <p>Your AWS lab environment has been provisioned with ${identityUsers.length} user account(s).
    Each user can log in directly using the credentials below —
    no additional setup or MFA required.</p>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <thead>
        <tr style="background:#0F2744;">
          <th style="padding:10px;color:#FF9900;text-align:left;border:1px solid #e2e8f0;">User</th>
          <th style="padding:10px;color:#FF9900;text-align:left;border:1px solid #e2e8f0;">Console URL</th>
          <th style="padding:10px;color:#FF9900;text-align:left;border:1px solid #e2e8f0;">Username</th>
          <th style="padding:10px;color:#FF9900;text-align:left;border:1px solid #e2e8f0;">Password</th>
        </tr>
      </thead>
      <tbody>${userRows}</tbody>
    </table>

    <div style="background:#E8F5ED;border-left:4px solid #1A6B3A;padding:12px;border-radius:4px;margin:16px 0;">
      <strong style="color:#1A6B3A;">How to access AWS:</strong>
      <ol style="color:#1A1A2E;margin:8px 0 0;padding-left:20px;line-height:1.8;">
        <li>Click the Console URL for your assigned user</li>
        <li>Enter the Username and Password exactly as shown above</li>
        <li>You are now in your AWS lab environment</li>
        <li>You can log back in anytime using the same credentials</li>
      </ol>
    </div>

    ${buildRequiredTagsSection({ request, identityUsers })}

    <div style="background:#FFF3CD;border-left:4px solid #856404;padding:12px;border-radius:4px;margin:16px 0;">
      <strong style="color:#856404;">Important:</strong>
      <ul style="color:#1A1A2E;margin:8px 0 0;padding-left:20px;line-height:1.8;">
        <li>Share each user's credentials only with that specific user</li>
        <li>Credentials expire on ${new Date(request.endDate).toLocaleDateString()}</li>
        <li>Do not share passwords publicly</li>
      </ul>
    </div>

    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin-top:24px;">
      <h3 style="color:#B91C1C;margin:0 0 8px;font-size:13px;">Manage Portal Access</h3>
      <p style="font-size:13px;color:#374151;margin:0 0 12px;">
        As admin you can manage all users, view costs, suspend/reinstate, and trigger cleanup from the manage portal.
      </p>
      <a href="${portalUrl}" style="background:#B91C1C;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;display:inline-block;">
        Open Manage Portal →
      </a>
      <div style="margin-top:12px;font-size:12px;color:#6b7280;">
        Login: <strong>${portalSession.username}</strong> / <strong>${portalSession.password}</strong>
      </div>
    </div>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="color:#666;font-size:12px;margin:0;">
      Racko Cloud Automation Platform · These accounts will be automatically deleted when the lab ends.
    </p>
  </div>
</body>
</html>`;
}

function buildReinstateCredentialsEmail({ request, user, newPassword }) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
  <h2 style="color:#0F2744;">AWS Lab Access Restored</h2>
  <p>Access for <strong>${user.username}</strong> has been reinstated. Use these updated credentials:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px;color:#666;">Console URL</td><td><a href="${user.consoleUrl}">${user.consoleUrl}</a></td></tr>
    <tr><td style="padding:8px;color:#666;">Username</td><td><code>${user.username}</code></td></tr>
    <tr><td style="padding:8px;color:#666;">Password</td><td><code>${newPassword}</code></td></tr>
  </table>
  <p style="color:#666;font-size:12px;">Lab expires ${new Date(request.endDate).toLocaleDateString()}</p>
</body>
</html>`;
}

const MAX_EMAIL_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableEmailError(error) {
  const statusCode = Number(error?.statusCode || error?.responseCode || error?.status);
  const errorCode = String(error?.code || '').toUpperCase();

  return (
    [421, 450, 451, 452, 454, 455, 500, 502, 503, 504].includes(statusCode) ||
    ['ETIMEDOUT', 'ECONNRESET', 'ESOCKET', 'EAUTH', 'ECONNECTION'].includes(errorCode)
  );
}

async function sendEmail({ to, subject, html }) {
  const transport = buildTransport();
  if (!transport) {
    console.log('[emailProvisioner] SMTP not configured — email not sent');
    return { sent: false, mode: 'console' };
  }

  await transport.verify();
  await transport.sendMail({
    from: `"Racko Cloud" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });

  return { sent: true, mode: 'smtp' };
}

export async function sendEmailWithRetry({ to, subject, html }) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_EMAIL_ATTEMPTS; attempt += 1) {
    try {
      return await sendEmail({ to, subject, html });
    } catch (error) {
      lastError = error;

      if (attempt === MAX_EMAIL_ATTEMPTS || !isRetryableEmailError(error)) {
        throw error;
      }

      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

export async function sendReinstateCredentialsEmail(request, user, newPassword) {
  const html = buildReinstateCredentialsEmail({ request, user, newPassword });
  const recipient = String(request.customerEmail).trim();

  try {
    const result = await sendEmail({
      to: recipient,
      subject: `AWS Lab Access Restored — ${user.username}`,
      html,
    });
    console.log(`[emailProvisioner] Reinstate email sent to ${recipient}`);
    return result;
  } catch (err) {
    console.error('[emailProvisioner] Reinstate email failed:', err.message);
    return { sent: false, error: err.message };
  }
}

export async function sendCredentialsEmail(request, context) {
  const {
    awsAccountId,
    labRoles = [],
    identityUsers = [],
    portalSession,
    isMagicLink,
  } = context;

  const allowedServices = (request.selectedServices || []).map((entry) => entry.serviceName);
  const portalUrl = `${process.env.CLIENT_PORTAL_URL || 'http://localhost:3000'}/manage-users/aws?token=${portalSession.token}`;

  const html = isMagicLink
    ? buildMagicLinkEmail({ request, labRoles, portalSession, portalUrl, awsAccountId, allowedServices })
    : buildIdentityCenterEmail({
        request,
        identityUsers,
        portalSession,
        portalUrl,
      });

  const recipient = String(request.customerEmail).trim();
  const transport = buildTransport();

  if (!transport) {
    console.log('[emailProvisioner] SMTP not configured');
    console.log(`Portal URL: ${portalUrl}`);
    console.log(`Portal login: ${portalSession.username} / ${portalSession.password}`);
    if (!isMagicLink) {
      identityUsers.forEach((user) =>
        console.log(`IAM User: ${user.username} → ${user.consoleUrl} / ${user.password}`)
      );
    }
    return { sent: false, mode: 'console' };
  }

  try {
    await transport.verify();
  } catch (err) {
    console.error('[emailProvisioner] SMTP verify failed:', err.message);
    return { sent: false, mode: 'console', error: err.message };
  }

  await transport.sendMail({
    from: `"Racko Cloud" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: recipient,
    subject: `✅ AWS Lab Access Ready — ${isMagicLink ? 'Magic Link' : 'Direct IAM'} Access`,
    html,
  });

  console.log(`[emailProvisioner] Email sent to ${recipient}`);
  return { sent: true, mode: 'smtp' };
}

// Backward-compatible export for tests
export function buildCredentialsEmailHtml(props) {
  return buildMagicLinkEmail({
    ...props,
    portalUrl: `${process.env.CLIENT_PORTAL_URL || 'http://localhost:3000'}/manage-users/aws?token=${props.portalSession.token}`,
  });
}
