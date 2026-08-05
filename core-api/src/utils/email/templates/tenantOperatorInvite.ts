import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type TenantConsoleInviteKind = 'admin' | 'operator';

export interface TenantOperatorInviteTemplateData {
  email: string;
  tempPassword: string;
  verifyUrl: string;
  resetUrl: string;
  brand: EmailBrand;
  inviteKind?: TenantConsoleInviteKind;
}

/** Console admin/operator invite for a white-labeled tenant portal. */
export function buildTenantOperatorInviteTemplate(data: TenantOperatorInviteTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const inviteKind = data.inviteKind ?? 'operator';
  const bodyHtml =
    inviteKind === 'admin'
      ? `<p style="margin:0;">A Super Admin has created a tenant admin account for you on <strong style="color:#111827;">${escapeHtml(brand.name)}</strong>. First verify your email, then set your own password before signing in.</p>`
      : `<p style="margin:0;">You've been invited as a console operator on <strong style="color:#111827;">${escapeHtml(brand.name)}</strong>. First verify your email, then set your own password before signing in.</p>`;

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;">Sign-in email</p>
          <p style="margin:0;font-size:14px;color:#111827;font-weight:600;word-break:break-all;">${escapeHtml(data.email)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;">Temporary password</p>
          <p style="margin:0;font-family:Consolas,Monaco,monospace;font-size:15px;color:#111827;font-weight:700;">${escapeHtml(data.tempPassword)}</p>
        </td>
      </tr>
    </table>`;

  const afterCtaHtml = `
    <p style="margin:0 0 10px;font-size:13px;color:#6b7280;line-height:1.5;">
      After verifying your email, complete setup by creating your own password.
    </p>
    <a href="${escapeHtml(data.resetUrl)}" style="display:inline-block;padding:11px 22px;border:1px solid ${brand.primaryColor};border-radius:9px;color:${brand.primaryColor};font-size:14px;font-weight:600;text-decoration:none;">Set Your Password →</a>`;

  return buildBrandedEmail(brand, {
    subject: `You're invited to ${brand.name}`,
    headline: "You're invited",
    bodyHtml,
    ctaLabel: 'Verify Email Address',
    ctaUrl: data.verifyUrl,
    detailsHtml,
    afterCtaHtml,
    expiryText: 'Verification and password links expire in 7 days.',
    noticeTitle: "Didn't expect this invite?",
    noticeBody: 'You can safely ignore this email.',
    hero: 'invite',
  });
}
