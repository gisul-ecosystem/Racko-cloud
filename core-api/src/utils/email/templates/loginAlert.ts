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

export interface LoginAlertTemplateData {
  email: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  brand?: EmailBrand;
  dashboardUrl?: string;
}

export function buildLoginAlertTemplate(data: LoginAlertTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const dashboardUrl =
    data.dashboardUrl ?? `${config.FRONTEND_URL.replace(/\/$/, '')}/dashboard`;
  const formattedTime = data.timestamp.toUTCString();

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:35%;border-bottom:1px solid #e5e7eb;">Account</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.email)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Time</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(formattedTime)}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">IP Address</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.ipAddress)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Device / Browser</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;">${escapeHtml(data.userAgent)}</td>
      </tr>
    </table>`;

  return buildBrandedEmail(brand, {
    subject: `New login detected on your ${brand.name} account`,
    headline: 'New login detected',
    bodyHtml: `<p style="margin:0;">We noticed a login to your <strong style="color:#111827;">${escapeHtml(brand.name)}</strong> account from a new device or IP address.</p>`,
    ctaLabel: 'Secure my account',
    ctaUrl: dashboardUrl,
    detailsHtml,
    noticeTitle: 'Was this you?',
    noticeBody: 'If this was you, no action is needed. You can safely ignore this email.',
    hero: 'alert',
  });
}
