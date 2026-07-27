import { config } from '../../../config';

export interface PasswordResetTemplateData {
  rawToken: string;
  platformName?: string;
}

export function buildPasswordResetTemplate(data: PasswordResetTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const platformName = data.platformName ?? config.EMAIL_FROM_NAME;
  const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${data.rawToken}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
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
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;">Reset your password</p>
              <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.6;">We received a request to reset the password for your account. Click the button below to set a new password. This link is valid for <strong style="color:#18181b;">1 minute</strong> and can only be used once.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#B91C1C;border-radius:6px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin:0 0 24px;font-size:13px;color:#B91C1C;word-break:break-all;">${resetUrl}</p>
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 24px;" />
              <p style="margin:0;font-size:13px;color:#a1a1aa;">If you didn't request a password reset, you can safely ignore this email. Your password will not change.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">${platformName} &middot; This is an automated message, please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Reset your password — ${platformName}

We received a request to reset your password.

Reset link (valid for 1 minute, single-use):
${resetUrl}

If you didn't request a password reset, ignore this email. Your password will not change.`;

  return { subject: `Reset your password — ${platformName}`, html, text };
}
