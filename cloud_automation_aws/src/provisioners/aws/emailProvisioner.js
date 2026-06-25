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

export function buildCredentialsEmailHtml({
  request,
  labRoles,
  portalSession,
  awsAccountId,
  allowedServices,
  region,
}) {
  const portalUrl = `${process.env.CLIENT_PORTAL_URL || 'http://localhost:3000'}/manage-users/aws?token=${portalSession.token}`;

  const userRows = labRoles
    .map(
      (role) => `
    <tr>
      <td style="padding:12px;border:1px solid #e5e7eb;font-family:monospace;">
        labuser${role.userIndex + 1}
      </td>
      <td style="padding:12px;border:1px solid #e5e7eb;">
        ${allowedServices.join(', ') || 'EC2, S3 (as per selection)'}
      </td>
      <td style="padding:12px;border:1px solid #e5e7eb;">
        <span style="background:#dcfce7;color:#166534;padding:4px 8px;border-radius:4px;font-size:12px;">
          Ready
        </span>
      </td>
      <td style="padding:12px;border:1px solid #e5e7eb;">
        Generate from portal
      </td>
    </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;color:#111827;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:720px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <div style="background:#B91C1C;padding:32px;">
      <h1 style="color:#fff;margin:0;font-size:24px;">✅ AWS Lab Access Ready</h1>
      <p style="color:#fca5a5;margin:8px 0 0;">
        Your lab environment is provisioned. Access the manage portal to get user links.
      </p>
    </div>

    <div style="padding:32px;">

      <table style="width:100%;margin-bottom:24px;font-size:14px;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;width:180px;">AWS Account ID</td>
          <td style="padding:8px 0;font-weight:600;">${awsAccountId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Region</td>
          <td style="padding:8px 0;font-weight:600;">${region}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Allowed Services</td>
          <td style="padding:8px 0;font-weight:600;">${allowedServices.join(', ')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Lab Expires</td>
          <td style="padding:8px 0;font-weight:600;">${new Date(request.endDate).toDateString()}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Total Users</td>
          <td style="padding:8px 0;font-weight:600;">${labRoles.length} lab users</td>
        </tr>
      </table>

      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:24px;margin-bottom:24px;text-align:center;">
        <h2 style="color:#B91C1C;margin:0 0 8px;font-size:18px;">
          🖥️ Access Your Manage Portal
        </h2>
        <p style="color:#374151;font-size:13px;margin:0 0 16px;">
          Log in to the manage portal to view all lab users and generate their AWS console access links.
        </p>
        <a href="${portalUrl}"
           style="background:#B91C1C;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;margin-bottom:16px;">
          Open Manage Portal →
        </a>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:16px;text-align:left;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Portal login credentials:</p>
          <table style="font-size:13px;">
            <tr>
              <td style="padding:4px 16px 4px 0;color:#6b7280;">Username</td>
              <td style="font-family:monospace;font-weight:600;">${portalSession.username}</td>
            </tr>
            <tr>
              <td style="padding:4px 16px 4px 0;color:#6b7280;">Password</td>
              <td style="font-family:monospace;font-weight:600;">${portalSession.password}</td>
            </tr>
          </table>
        </div>
      </div>

      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin-bottom:24px;">
        <h3 style="color:#166534;margin:0 0 12px;font-size:14px;">How to give users AWS access</h3>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:#374151;line-height:2.2;">
          <li>Click <strong>Open Manage Portal</strong> above and log in</li>
          <li>You will see all ${labRoles.length} lab users listed</li>
          <li>Click <strong>"Launch AWS Console"</strong> next to any user</li>
          <li>Copy the magic link and share it with that lab user</li>
          <li>Lab user clicks the link → directly into AWS console, no password needed</li>
        </ol>
      </div>

      <h2 style="font-size:15px;margin-bottom:12px;">Lab Users (${labRoles.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:12px;border:1px solid #e5e7eb;text-align:left;">User</th>
            <th style="padding:12px;border:1px solid #e5e7eb;text-align:left;">Services</th>
            <th style="padding:12px;border:1px solid #e5e7eb;text-align:left;">Status</th>
            <th style="padding:12px;border:1px solid #e5e7eb;text-align:left;">Console Access</th>
          </tr>
        </thead>
        <tbody>${userRows}</tbody>
      </table>

      <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px;">
        This is an automated message from Racko Cloud Automation.<br/>
        Lab access expires on ${new Date(request.endDate).toDateString()}.<br/>
        Do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendCredentialsEmail(request, context) {
  const { awsAccountId, labRoles, portalSession } = context;
  const allowedServices = (request.selectedServices || []).map((e) => e.serviceName);

  const html = buildCredentialsEmailHtml({
    request,
    labRoles,
    portalSession,
    awsAccountId,
    allowedServices,
    region: request.region,
  });

  const recipient = String(request.customerEmail).trim();
  const transport = buildTransport();

  if (!transport) {
    console.log(`[emailProvisioner] SMTP not configured`);
    console.log(`Portal: ${process.env.CLIENT_PORTAL_URL || 'http://localhost:3000'}/manage-users/aws?token=${portalSession.token}`);
    console.log(`Login: ${portalSession.username} / ${portalSession.password}`);
    return { sent: false, mode: 'console' };
  }

  try {
    await transport.verify();
  } catch (err) {
    console.error('[emailProvisioner] SMTP verify failed:', err.message);
    console.log(`Portal: ${process.env.CLIENT_PORTAL_URL || 'http://localhost:3000'}/manage-users/aws?token=${portalSession.token}`);
    console.log(`Login: ${portalSession.username} / ${portalSession.password}`);
    return { sent: false, mode: 'console', error: err.message };
  }

  await transport.sendMail({
    from: `"Racko Cloud" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: recipient,
    subject: '✅ AWS Lab Access Ready — Open your manage portal',
    html,
  });

  console.log(`[emailProvisioner] Email sent to ${recipient}`);
  return { sent: true, mode: 'smtp' };
}
