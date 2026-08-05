import { config } from '../../../config';
import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface StaffInviteTemplateData {
  email: string;
  tempPassword: string;
  verifyToken: string;
  resetToken: string;
  brand?: EmailBrand;
  verifyUrl?: string;
  resetUrl?: string;
}

export function buildStaffInviteTemplate(data: StaffInviteTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const base = config.FRONTEND_URL.replace(/\/$/, '');
  const verifyUrl = data.verifyUrl ?? `${base}/verify-email?token=${data.verifyToken}`;
  const resetUrl = data.resetUrl ?? `${base}/reset-password?token=${data.resetToken}`;

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:40%;border-bottom:1px solid #e5e7eb;">Sign-in email</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.email)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Temporary password</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;font-weight:600;">${escapeHtml(data.tempPassword)}</td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;text-align:left;">
      After verifying, set your own password:
      <a href="${escapeHtml(resetUrl)}" style="color:${brand.primaryColor};word-break:break-all;">${escapeHtml(resetUrl)}</a>
    </p>`;

  return buildBrandedEmail(brand, {
    subject: `You're invited to ${brand.name}`,
    headline: "You're invited",
    bodyHtml: `<p style="margin:0;">A Super Admin has created a staff account for you on <strong style="color:#111827;">${escapeHtml(brand.name)}</strong>. First verify your email, then set your own password before signing in.</p>`,
    ctaLabel: 'Verify Email Address',
    ctaUrl: verifyUrl,
    detailsHtml,
    expiryText: 'Verification and password links expire in 7 days.',
    noticeTitle: "Didn't expect this invite?",
    noticeBody: 'You can safely ignore this email.',
    hero: 'invite',
  });
}
