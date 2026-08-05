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

export interface AccountLockedTemplateData {
  email: string;
  lockedUntil: Date;
  ipAddress: string;
  brand?: EmailBrand;
  supportUrl?: string;
}

export function buildAccountLockedTemplate(data: AccountLockedTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const supportUrl =
    data.supportUrl ?? `${config.FRONTEND_URL.replace(/\/$/, '')}/company/contact`;
  const formattedUnlockTime = data.lockedUntil.toUTCString();
  const minutesRemaining = Math.max(
    1,
    Math.ceil((data.lockedUntil.getTime() - Date.now()) / 60000)
  );

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:40%;border-bottom:1px solid #e5e7eb;">Account</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.email)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">IP Address</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.ipAddress)}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Auto-unlock in</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${minutesRemaining} minute(s)</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Unlocks at</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;">${escapeHtml(formattedUnlockTime)}</td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;line-height:1.6;text-align:left;">
      Your account will automatically unlock after the lockout period. If you did not attempt to log in, contact support immediately.
    </p>`;

  return buildBrandedEmail(brand, {
    subject: `Your ${brand.name} account has been temporarily locked`,
    headline: 'Account temporarily locked',
    bodyHtml: `<p style="margin:0;">Your <strong style="color:#111827;">${escapeHtml(brand.name)}</strong> account has been temporarily locked due to ${config.MAX_LOGIN_ATTEMPTS} consecutive failed login attempts.</p>`,
    ctaLabel: 'Contact Support',
    ctaUrl: supportUrl,
    detailsHtml,
    noticeTitle: 'Was this you?',
    noticeBody: 'If this was you, wait for the lockout to end — no further action is required.',
    hero: 'locked',
  });
}
