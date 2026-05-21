import { config } from '../../../config';

export interface AccountLockedTemplateData {
  email: string;
  lockedUntil: Date;
  ipAddress: string;
  platformName?: string;
}

export function buildAccountLockedTemplate(data: AccountLockedTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const platformName = data.platformName ?? config.SENDGRID_FROM_NAME;
  const supportUrl = `${config.FRONTEND_URL}/company/contact`;
  const formattedUnlockTime = data.lockedUntil.toUTCString();
  const minutesRemaining = Math.ceil((data.lockedUntil.getTime() - Date.now()) / 60000);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Account temporarily locked — ${platformName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0a0f1e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e1b4b 0%, #0f0a2e 100%); padding: 40px 40px 32px; text-align: center; }
    .logo { font-size: 22px; font-weight: 700; color: #818cf8; letter-spacing: -0.5px; }
    .header-title { font-size: 26px; font-weight: 700; color: #f9fafb; margin: 16px 0 8px; }
    .header-sub { font-size: 15px; color: #9ca3af; margin: 0; }
    .body { padding: 40px; }
    .body p { font-size: 15px; color: #d1d5db; line-height: 1.6; margin: 0 0 20px; }
    .info-box { background: #1f2937; border-radius: 8px; padding: 20px 24px; margin: 24px 0; }
    .info-box p { margin: 0 0 8px; font-size: 14px; color: #9ca3af; }
    .info-box p:last-child { margin: 0; }
    .info-box strong { color: #f9fafb; }
    .unlock-badge { display: inline-block; background: #374151; border-radius: 6px; padding: 8px 16px; font-size: 14px; color: #60a5fa; font-weight: 600; margin: 8px 0; }
    .cta-wrapper { text-align: center; margin: 32px 0; }
    .cta-btn { display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 32px; border-radius: 8px; }
    .footer { padding: 24px 40px; text-align: center; border-top: 1px solid #1f2937; }
    .footer p { font-size: 12px; color: #4b5563; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">${platformName}</div>
        <h1 class="header-title">🔒 Account temporarily locked</h1>
        <p class="header-sub">Too many failed login attempts detected</p>
      </div>
      <div class="body">
        <p>Your <strong>${platformName}</strong> account has been temporarily locked due to ${config.MAX_LOGIN_ATTEMPTS} consecutive failed login attempts.</p>
        <div class="info-box">
          <p>Account: <strong>${data.email}</strong></p>
          <p>Triggered from IP: <strong>${data.ipAddress}</strong></p>
          <p>Auto-unlock in: <strong>${minutesRemaining} minute(s)</strong></p>
          <p>Unlock time: <span class="unlock-badge">${formattedUnlockTime}</span></p>
        </div>
        <p>Your account will automatically unlock after the lockout period. No action is required if this was you.</p>
        <p>If you did not attempt to log in, your account may be under a brute-force attack. Please contact support immediately.</p>
        <div class="cta-wrapper">
          <a href="${supportUrl}" class="cta-btn">Contact Support</a>
        </div>
      </div>
      <div class="footer">
        <p>${platformName} · Enterprise Cloud Infrastructure<br />This is an automated security notification.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Account temporarily locked — ${platformName}

Your account has been temporarily locked due to ${config.MAX_LOGIN_ATTEMPTS} consecutive failed login attempts.

Account: ${data.email}
Triggered from IP: ${data.ipAddress}
Auto-unlock in: ${minutesRemaining} minute(s)
Unlock time: ${formattedUnlockTime}

Your account will automatically unlock after the lockout period.

If you did not attempt to log in, contact support: ${supportUrl}
  `.trim();

  return {
    subject: `Your ${platformName} account has been temporarily locked`,
    html,
    text,
  };
}
