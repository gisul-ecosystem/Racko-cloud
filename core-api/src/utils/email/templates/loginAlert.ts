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
  const platformName = data.platformName ?? config.EMAIL_FROM_NAME;
  const dashboardUrl = `${config.FRONTEND_URL}/dashboard`;
  const formattedTime = data.timestamp.toUTCString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New login detected</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
          <!-- Header -->
          <tr>
            <td style="background:#B91C1C;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${platformName}</p>
            </td>
          </tr>
          <!-- Alert banner -->
          <tr>
            <td style="background:#fef3c7;border-bottom:1px solid #fde68a;padding:16px 40px;">
              <p style="margin:0;font-size:14px;font-weight:600;color:#92400e;">&#9888; New login detected on your account</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;">New login detected</p>
              <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.6;">We noticed a login to your <strong style="color:#18181b;">${platformName}</strong> account from a new device or IP address.</p>
              <!-- Info table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;margin:0 0 24px;">
                <tr style="background:#fafafa;">
                  <td style="padding:12px 16px;font-size:13px;color:#71717a;font-weight:500;width:35%;border-bottom:1px solid #e4e4e7;">Account</td>
                  <td style="padding:12px 16px;font-size:13px;color:#18181b;border-bottom:1px solid #e4e4e7;">${data.email}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#71717a;font-weight:500;border-bottom:1px solid #e4e4e7;">Time</td>
                  <td style="padding:12px 16px;font-size:13px;color:#18181b;border-bottom:1px solid #e4e4e7;">${formattedTime}</td>
                </tr>
                <tr style="background:#fafafa;">
                  <td style="padding:12px 16px;font-size:13px;color:#71717a;font-weight:500;border-bottom:1px solid #e4e4e7;">IP Address</td>
                  <td style="padding:12px 16px;font-size:13px;color:#18181b;border-bottom:1px solid #e4e4e7;">${data.ipAddress}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#71717a;font-weight:500;">Device / Browser</td>
                  <td style="padding:12px 16px;font-size:13px;color:#18181b;">${data.userAgent}</td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#B91C1C;border-radius:6px;">
                    <a href="${dashboardUrl}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Secure my account</a>
                  </td>
                </tr>
              </table>
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 20px;" />
              <p style="margin:0;font-size:13px;color:#a1a1aa;">If this was you, no action is needed. You can safely ignore this email.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">${platformName} &middot; This is an automated security alert.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `New login detected — ${platformName}

A login was detected on your account from a new device or location.

Account: ${data.email}
Time: ${formattedTime}
IP Address: ${data.ipAddress}
Device: ${data.userAgent}

If this wasn't you, secure your account: ${dashboardUrl}

If this was you, no action is needed.`;

  return { subject: `New login detected on your ${platformName} account`, html, text };
}
