import { config } from '../../../config';
import { getAppBaseUrl } from '../../requestContext';
import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

export interface VerifyEmailTemplateData {
  rawToken: string;
  brand?: EmailBrand;
  /** Override verify URL (tenant portals). Defaults to the caller's portal origin. */
  verifyUrl?: string;
}

export function buildVerifyEmailTemplate(data: VerifyEmailTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const verifyUrl =
    data.verifyUrl ?? `${getAppBaseUrl()}/verify-email?token=${data.rawToken}`;
  const expiryHours = config.EMAIL_VERIFICATION_EXPIRES_HOURS;

  return buildBrandedEmail(brand, {
    subject: `Verify your email — ${brand.name}`,
    headline: 'Verify your email address',
    bodyHtml: `<p style="margin:0;">Thanks for signing up. Click the button below to verify your email address and activate your account.</p>`,
    ctaLabel: 'Verify Email Address',
    ctaUrl: verifyUrl,
    expiryText: `This link expires in ${expiryHours} hours.`,
    noticeTitle: "Didn't create an account?",
    noticeBody: 'You can safely ignore this email.',
    hero: 'verify',
  });
}
