import { config } from '../../../config';

export interface VerifyEmailTemplateData {
  rawToken: string;
  platformName?: string;
}

export function buildVerifyEmailTemplate(data: VerifyEmailTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const platformName = data.platformName ?? config.SENDGRID_FROM_NAME;
  const verifyUrl = `${config.FRONTEND_URL}/verify-email?token=${data.rawToken}`;
  const expiryHours = config.EMAIL_VERIFICATION_EXPIRES_HOURS;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email — ${platformName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0a0f1e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%); padding: 40px 40px 32px; text-align: center; }
    .logo { font-size: 22px; font-weight: 700; color: #60a5fa; letter-spacing: -0.5px; }
    .header-title { font-size: 28px; font-weight: 700; color: #f9fafb; margin: 16px 0 8px; }
    .header-sub { font-size: 15px; color: #9ca3af; margin: 0; }
    .body { padding: 40px; }
    .body p { font-size: 15px; color: #d1d5db; line-height: 1.6; margin: 0 0 20px; }
    .cta-wrapper { text-align: center; margin: 32px 0; }
    .cta-btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 36px; border-radius: 8px; letter-spacing: 0.2px; }
    .cta-btn:hover { background: #1d4ed8; }
    .divider { border: none; border-top: 1px solid #1f2937; margin: 32px 0; }
    .url-fallback { background: #1f2937; border-radius: 6px; padding: 12px 16px; word-break: break-all; font-size: 13px; color: #6b7280; font-family: monospace; }
    .expiry-note { font-size: 13px; color: #6b7280; text-align: center; margin-top: 24px; }
    .footer { padding: 24px 40px; text-align: center; border-top: 1px solid #1f2937; }
    .footer p { font-size: 12px; color: #4b5563; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">${platformName}</div>
        <h1 class="header-title">Verify your email address</h1>
        <p class="header-sub">One step away from accessing your cloud dashboard</p>
      </div>
      <div class="body">
        <p>Thanks for registering. To activate your account and start managing your infrastructure, please verify your email address by clicking the button below.</p>
        <div class="cta-wrapper">
          <a href="${verifyUrl}" class="cta-btn">Verify Email Address</a>
        </div>
        <hr class="divider" />
        <p style="font-size:13px;color:#6b7280;">If the button doesn't work, copy and paste this URL into your browser:</p>
        <div class="url-fallback">${verifyUrl}</div>
        <p class="expiry-note">⏱ This link expires in ${expiryHours} hours. If it expires, you can request a new one from the login page.</p>
        <hr class="divider" />
        <p style="font-size:13px;color:#6b7280;">If you didn't create an account with ${platformName}, you can safely ignore this email.</p>
      </div>
      <div class="footer">
        <p>${platformName} · Enterprise Cloud Infrastructure<br />This is an automated message, please do not reply.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Verify your email — ${platformName}

Thanks for registering. Please verify your email address to activate your account.

Verification link:
${verifyUrl}

This link expires in ${expiryHours} hours.

If you didn't create an account with ${platformName}, you can safely ignore this email.
  `.trim();

  return {
    subject: `Verify your email — ${platformName}`,
    html,
    text,
  };
}
