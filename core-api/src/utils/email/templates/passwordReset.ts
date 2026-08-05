import { config } from '../../../config';
import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

export interface PasswordResetTemplateData {
  rawToken: string;
  brand?: EmailBrand;
  /** Override reset URL (tenant portals). Defaults to platform FRONTEND_URL. */
  resetUrl?: string;
  /** Human-readable expiry, e.g. "1 minute" or "1 hour". */
  expiryLabel?: string;
}

export function buildPasswordResetTemplate(data: PasswordResetTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const resetUrl =
    data.resetUrl ??
    `${config.FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${data.rawToken}`;
  const expiryLabel = data.expiryLabel ?? '1 minute';

  return buildBrandedEmail(brand, {
    subject: `Reset your password — ${brand.name}`,
    headline: 'Reset your password',
    bodyHtml: `<p style="margin:0;">We received a request to reset the password for your account. Click the button below to set a new password. This link is valid for <strong style="color:#111827;">${expiryLabel}</strong> and can only be used once.</p>`,
    ctaLabel: 'Reset Password',
    ctaUrl: resetUrl,
    expiryText: `This link expires in ${expiryLabel}.`,
    noticeTitle: "Didn't request a reset?",
    noticeBody: 'You can safely ignore this email. Your password will not change.',
    hero: 'reset',
  });
}
