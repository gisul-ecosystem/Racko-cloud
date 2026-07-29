import { config } from '../../../config';

export interface StaffInviteTemplateData {
  email: string;
  tempPassword: string;
  verifyToken: string;
  resetToken: string;
  platformName?: string;
}

export function buildStaffInviteTemplate(data: StaffInviteTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const platformName = data.platformName ?? config.EMAIL_FROM_NAME;
  const verifyUrl = `${config.FRONTEND_URL}/verify-email?token=${data.verifyToken}`;
  const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${data.resetToken}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background:#B91C1C;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${platformName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;">You're invited to the Super Admin dashboard</p>
              <p style="margin:0 0 20px;font-size:15px;color:#71717a;line-height:1.6;">A Super Admin has created a staff account for you. First verify your email, then set your own password before signing in.</p>
              <div style="margin:0 0 24px;padding:16px;border-radius:8px;background:#fafafa;border:1px solid #e4e4e7;">
                <p style="margin:0 0 6px;font-size:13px;color:#71717a;">Sign-in email</p>
                <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#18181b;">${data.email}</p>
                <p style="margin:0 0 6px;font-size:13px;color:#71717a;">Temporary password</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#18181b;">${data.tempPassword}</p>
              </div>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
                <tr>
                  <td style="background:#B91C1C;border-radius:6px;">
                    <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Verify email</a>
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#111827;border-radius:6px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Set your password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;">Verification link</p>
              <p style="margin:0 0 16px;font-size:13px;color:#B91C1C;word-break:break-all;">${verifyUrl}</p>
              <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;">Password setup link</p>
              <p style="margin:0 0 24px;font-size:13px;color:#B91C1C;word-break:break-all;">${resetUrl}</p>
              <p style="margin:0;font-size:13px;color:#a1a1aa;">Use the temporary password only as a bootstrap. You must set your own password before the first login.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You're invited to ${platformName}

Email: ${data.email}
Temporary password: ${data.tempPassword}

1. Verify your email:
${verifyUrl}

2. Set your password:
${resetUrl}

You must verify your email and set your own password before signing in.`;

  return { subject: `You're invited to ${platformName}`, html, text };
}
