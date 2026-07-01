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
  const platformName = data.platformName ?? config.EMAIL_FROM_NAME;
  const supportUrl = `${config.FRONTEND_URL}/company/contact`;
  const formattedUnlockTime = data.lockedUntil.toUTCString();
  const minutesRemaining = Math.ceil((data.lockedUntil.getTime() - Date.now()) / 60000);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Account temporarily locked</title>
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
            <td style="background:#fef2f2;border-bottom:1px solid #fecaca;padding:16px 40px;">
              <p style="margin:0;font-size:14px;font-weight:600;color:#991b1b;">&#128274; Your account has been temporarily locked</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;">Account temporarily locked</p>
              <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.6;">Your <strong style="color:#18181b;">${platformName}</strong> account has been temporarily locked due to ${config.MAX_LOGIN_ATTEMPTS} consecutive failed login attempts.</p>
              <!-- Info table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;margin:0 0 24px;">
                <tr style="background:#fafafa;">
                  <td style="padding:12px 16px;font-size:13px;color:#71717a;font-weight:500;width:40%;border-bottom:1px solid #e4e4e7;">Account</td>
                  <td style="padding:12px 16px;font-size:13px;color:#18181b;border-bottom:1px solid #e4e4e7;">${data.email}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#71717a;font-weight:500;border-bottom:1px solid #e4e4e7;">IP Address</td>
                  <td style="padding:12px 16px;font-size:13px;color:#18181b;border-bottom:1px solid #e4e4e7;">${data.ipAddress}</td>
                </tr>
                <tr style="background:#fafafa;">
                  <td style="padding:12px 16px;font-size:13px;color:#71717a;font-weight:500;border-bottom:1px solid #e4e4e7;">Auto-unlock in</td>
                  <td style="padding:12px 16px;font-size:13px;color:#18181b;border-bottom:1px solid #e4e4e7;">${minutesRemaining} minute(s)</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#71717a;font-weight:500;">Unlocks at</td>
                  <td style="padding:12px 16px;font-size:13px;color:#18181b;">${formattedUnlockTime}</td>
                </tr>
              </table>
              <p style="margin:0 0 20px;font-size:14px;color:#71717a;line-height:1.6;">Your account will automatically unlock after the lockout period expires. If this was you, no action is required.</p>
              <p style="margin:0 0 24px;font-size:14px;color:#71717a;line-height:1.6;">If you did not attempt to log in, your account may be under attack. Please contact support immediately.</p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#B91C1C;border-radius:6px;">
                    <a href="${supportUrl}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Contact Support</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">${platformName} &middot; This is an automated security notification.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Account temporarily locked — ${platformName}

Your account has been temporarily locked due to ${config.MAX_LOGIN_ATTEMPTS} consecutive failed login attempts.

Account: ${data.email}
IP Address: ${data.ipAddress}
Auto-unlock in: ${minutesRemaining} minute(s)
Unlocks at: ${formattedUnlockTime}

Your account will automatically unlock after the lockout period.

If you did not attempt to log in, contact support: ${supportUrl}`;

  return { subject: `Your ${platformName} account has been temporarily locked`, html, text };
}
