import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { isPerUserCosting } from '../../utils/costingMode.js';
import { provisioningConfig } from '../../config/provisioning.js';

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

function buildAccessToken(requestId, username) {
  const secret =
    process.env.PROVISION_ACCESS_TOKEN_SECRET ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    'dev-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(`${requestId}:${username}`)
    .digest('hex')
    .slice(0, 32);
}

export function buildCredentialsEmailHtml({
  request,
  users,
  awsAccountId,
  allowedServices,
  region,
  identityCenterUrl,
  perUserAccess = false,
}) {
  const userRows = users
    .map(
      (user) => `
      <tr>
        <td style="padding:12px;border:1px solid #e5e7eb;font-family:monospace;">
          ${user.username}
        </td>
        <td style="padding:12px;border:1px solid #e5e7eb;">
          ${user.email}
        </td>
        <td style="padding:12px;border:1px solid #e5e7eb;">
          <span style="background:#fef2f2;color:#B91C1C;padding:4px 8px;border-radius:4px;font-size:12px;">
            Check email for activation link
          </span>
        </td>
        <td style="padding:12px;border:1px solid #e5e7eb;">
          <a href="${identityCenterUrl}"
             style="background:#B91C1C;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;">
            Sign In
          </a>
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

    <!-- Header -->
    <div style="background:#B91C1C;padding:32px;">
      <h1 style="color:#fff;margin:0;font-size:24px;">✅ AWS Lab Access Ready</h1>
      <p style="color:#fca5a5;margin:8px 0 0;">
        Your lab environment has been provisioned. Follow the steps below to sign in.
      </p>
    </div>

    <div style="padding:32px;">

      <!-- Lab details -->
      <table style="width:100%;margin-bottom:24px;font-size:14px;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;">AWS Account ID</td>
          <td style="padding:8px 0;font-weight:600;">${awsAccountId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Region</td>
          <td style="padding:8px 0;font-weight:600;">${region}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Access Mode</td>
          <td style="padding:8px 0;font-weight:600;">
            ${perUserAccess ? 'Per-user permission sets' : 'Shared account'}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Allowed Services</td>
          <td style="padding:8px 0;font-weight:600;">${allowedServices.join(', ')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Lab Expires</td>
          <td style="padding:8px 0;font-weight:600;">
            ${new Date(request.endDate).toDateString()}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Identity Center URL</td>
          <td style="padding:8px 0;">
            <a href="${identityCenterUrl}" style="color:#B91C1C;">${identityCenterUrl}</a>
          </td>
        </tr>
      </table>

      <!-- How to sign in -->
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:20px;margin-bottom:24px;">
        <h3 style="color:#B91C1C;margin:0 0 12px;font-size:15px;">
          🔐 How to sign in (3 steps)
        </h3>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:#374151;line-height:2;">
          <li>
            <strong>Check your email</strong> — AWS has sent an activation email
            to each user's email address listed below. Click the activation link
            to set your password.
          </li>
          <li>
            <strong>Go to Identity Center:</strong>
            <a href="${identityCenterUrl}" style="color:#B91C1C;">
              ${identityCenterUrl}
            </a>
          </li>
          <li>
            <strong>Enter your username</strong> (from the table below) and the
            password you set in step 1. Select your AWS account and permission set.
          </li>
        </ol>
        <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">
          ⚠️ If you don't see the activation email, check your spam folder or
          click "Forgot password?" on the sign-in page to resend it.
        </p>
      </div>

      <!-- User table -->
      <h2 style="font-size:15px;margin-bottom:12px;">Lab Users</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:12px;border:1px solid #e5e7eb;text-align:left;">Username</th>
            <th style="padding:12px;border:1px solid #e5e7eb;text-align:left;">Activation Email Sent To</th>
            <th style="padding:12px;border:1px solid #e5e7eb;text-align:left;">Status</th>
            <th style="padding:12px;border:1px solid #e5e7eb;text-align:left;">Sign In</th>
          </tr>
        </thead>
        <tbody>${userRows}</tbody>
      </table>

      <!-- Forgot password fallback -->
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-top:24px;">
        <h3 style="color:#166534;margin:0 0 8px;font-size:13px;">
          Didn't receive the activation email?
        </h3>
        <p style="font-size:13px;color:#374151;margin:0;">
          Go to
          <a href="${identityCenterUrl}" style="color:#B91C1C;">${identityCenterUrl}</a>,
          enter your username, and click <strong>"Forgot password?"</strong> —
          AWS will resend the activation link to your email.
        </p>
      </div>

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
  const { awsAccountId, identityUsers } = context;
  const perUserAccess = isPerUserCosting(context.costingMode ?? request.costingMode);
  const allowedServices = (request.selectedServices || []).map((e) => e.serviceName);
  const identityCenterUrl =
    process.env.AWS_IDENTITY_CENTER_START_URL ||
    provisioningConfig.identityCenterStartUrl ||
    'https://console.aws.amazon.com/singlesignon';

  const html = buildCredentialsEmailHtml({
    request,
    users: identityUsers,
    awsAccountId,
    allowedServices,
    region: request.region,
    identityCenterUrl,
    perUserAccess,
  });

  const recipient = String(request.customerEmail).trim();
  const transport = buildTransport();

  if (!transport) {
    console.log(`[emailProvisioner] SMTP not configured — credentials for ${recipient}:`);
    identityUsers.forEach((u) => console.log(`  ${u.username} → ${u.email}`));
    return { sent: false, mode: 'console' };
  }

  try {
    await transport.verify();
  } catch (err) {
    console.error('[emailProvisioner] SMTP verify failed:', err.message);
    identityUsers.forEach((u) => console.log(`  ${u.username} → ${u.email}`));
    return { sent: false, mode: 'console', error: err.message };
  }

  await transport.sendMail({
    from: `"Racko Cloud" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: recipient,
    subject: '✅ AWS Lab Access — Activate your accounts',
    html,
  });

  console.log(`[emailProvisioner] Credentials email sent to ${recipient}`);
  return { sent: true, mode: 'smtp' };
}

export function verifyAccessToken(requestId, username, token) {
  const expected = buildAccessToken(requestId, username);
  const provided = String(token || '');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
