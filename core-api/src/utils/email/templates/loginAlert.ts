import { config } from '../../../config';

export interface LoginAlertTemplateData {
  email: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  platformName?: string;
}

export function buildLoginAlertTemplate(data: LoginAlertTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const platformName = data.platformName ?? config.SENDGRID_FROM_NAME;
  const dashboardUrl = `${config.FRONTEND_URL}/dashboard`;
  const formattedTime = data.timestamp.toUTCString();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New login detected — ${platformName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0a0f1e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #7c2d12 0%, #431407 100%); padding: 40px 40px 32px; text-align: center; }
    .logo { font-size: 22px; font-weight: 700; color: #fb923c; letter-spacing: -0.5px; }
    .header-title { font-size: 26px; font-weight: 700; color: #f9fafb; margin: 16px 0 8px; }
    .header-sub { font-size: 15px; color: #d1d5db; margin: 0; }
    .body { padding: 40px; }
    .body p { font-size: 15px; color: #d1d5db; line-height: 1.6; margin: 0 0 20px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    .info-table td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #1f2937; }
    .info-table td:first-child { color: #6b7280; width: 40%; }
    .info-table td:last-child { color: #f9fafb; font-weight: 500; }
    .alert-box { background: #1c1917; border: 1px solid #78350f; border-radius: 8px; padding: 16px 20px; margin: 24px 0; }
    .alert-box p { font-size: 14px; color: #fbbf24; margin: 0; }
    .cta-wrapper { text-align: center; margin: 32px 0; }
    .cta-btn { display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 32px; border-radius: 8px; }
    .footer { padding: 24px 40px; text-align: center; border-top: 1px solid #1f2937; }
    .footer p { font-size: 12px; color: #4b5563; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">${platformName}</div>
        <h1 class="header-title">⚠ New login detected</h1>
        <p class="header-sub">A login was detected from an unrecognized device or location</p>
      </div>
      <div class="body">
        <p>We noticed a login to your <strong>${platformName}</strong> account from a new device or IP address. Here are the details:</p>
        <table class="info-table">
          <tr><td>Account</td><td>${data.email}</td></tr>
          <tr><td>Time</td><td>${formattedTime}</td></tr>
          <tr><td>IP Address</td><td>${data.ipAddress}</td></tr>
          <tr><td>Device / Browser</td><td>${data.userAgent}</td></tr>
        </table>
        <div class="alert-box">
          <p>⚠ If this wasn't you, secure your account immediately and contact support.</p>
        </div>
        <div class="cta-wrapper">
          <a href="${dashboardUrl}" class="cta-btn">Secure my account</a>
        </div>
        <p style="font-size:13px;color:#6b7280;text-align:center;">If this was you, no action is needed. You can safely ignore this email.</p>
      </div>
      <div class="footer">
        <p>${platformName} · Enterprise Cloud Infrastructure<br />This is an automated security alert.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
New login detected — ${platformName}

A login was detected on your account from a new device or location.

Account: ${data.email}
Time: ${formattedTime}
IP Address: ${data.ipAddress}
Device: ${data.userAgent}

If this wasn't you, secure your account immediately: ${dashboardUrl}

If this was you, no action is needed.
  `.trim();

  return {
    subject: `New login detected on your ${platformName} account`,
    html,
    text,
  };
}
