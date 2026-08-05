import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface TenantOperatorInviteTemplateData {
  email: string;
  tempPassword: string;
  loginUrl: string;
  brand: EmailBrand;
}

/** Console operator invite for a white-labeled tenant portal. */
export function buildTenantOperatorInviteTemplate(data: TenantOperatorInviteTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = data.brand ?? resolvePlatformEmailBrand();

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
      Sign in, then change your password from account settings.
    </p>`;

  return buildBrandedEmail(brand, {
    subject: `You're invited to ${brand.name}`,
    headline: "You're invited",
    bodyHtml: `<p style="margin:0;">You've been invited as a console operator on <strong style="color:#111827;">${escapeHtml(brand.name)}</strong>. Use the credentials below to sign in.</p>`,
    ctaLabel: 'Sign in to console',
    ctaUrl: data.loginUrl,
    detailsHtml,
    noticeTitle: "Didn't expect this invite?",
    noticeBody: 'You can safely ignore this email.',
    hero: 'invite',
  });
}
