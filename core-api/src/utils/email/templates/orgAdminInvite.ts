import { getAppBaseUrl } from '../../requestContext';
import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface OrgAdminInviteTemplateData {
  email: string;
  temporaryPassword: string;
  companyName?: string;
  brand?: EmailBrand;
  loginUrl?: string;
}

/** Super-admin onboard / re-invite for a platform B2B organization admin. */
export function buildOrgAdminInviteTemplate(data: OrgAdminInviteTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const loginUrl = data.loginUrl ?? `${getAppBaseUrl().replace(/\/$/, '')}/login`;
  const companyName = data.companyName?.trim();

  const bodyHtml = companyName
    ? `<p style="margin:0;">A Super Admin has created an organization admin account for <strong style="color:#111827;">${escapeHtml(companyName)}</strong> on <strong style="color:#111827;">${escapeHtml(brand.name)}</strong>. Use the credentials below to sign in.</p>`
    : `<p style="margin:0;">A Super Admin has created an organization admin account for you on <strong style="color:#111827;">${escapeHtml(brand.name)}</strong>. Use the credentials below to sign in.</p>`;

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      ${
        companyName
          ? `<tr style="background:#f9fafb;">
        <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;">Organization</p>
          <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(companyName)}</p>
        </td>
      </tr>`
          : ''
      }
      <tr style="background:${companyName ? '#ffffff' : '#f9fafb'};">
        <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;">Sign-in email</p>
          <p style="margin:0;font-size:14px;color:#111827;font-weight:600;word-break:break-all;">${escapeHtml(data.email)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;">Temporary password</p>
          <p style="margin:0;font-family:Consolas,Monaco,monospace;font-size:15px;color:#111827;font-weight:700;">${escapeHtml(data.temporaryPassword)}</p>
        </td>
      </tr>
    </table>`;

  const afterCtaHtml = `
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
      For security, please change your password after your first login.
    </p>`;

  const { subject, html } = buildBrandedEmail(brand, {
    subject: `Your ${brand.name} organization admin account`,
    headline: 'Welcome to your organization',
    bodyHtml,
    ctaLabel: `Sign in to ${brand.name}`,
    ctaUrl: loginUrl,
    detailsHtml,
    afterCtaHtml,
    noticeTitle: "Didn't expect this invite?",
    noticeBody: 'Contact your Racko Super Admin if you received this by mistake.',
    hero: 'invite',
  });

  const text = [
    `${brand.name} organization admin account`,
    '',
    companyName
      ? `A Super Admin has created an organization admin account for ${companyName} on ${brand.name}.`
      : `A Super Admin has created an organization admin account for you on ${brand.name}.`,
    '',
    `Sign-in email: ${data.email}`,
    `Temporary password: ${data.temporaryPassword}`,
    '',
    `Sign in: ${loginUrl}`,
    '',
    'Please change your password after your first login.',
    '',
    "Didn't expect this invite? Contact your Racko Super Admin if you received this by mistake.",
    brand.websiteLabel,
  ].join('\n');

  return { subject, html, text };
}
