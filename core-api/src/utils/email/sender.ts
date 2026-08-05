import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../../config';
import { logger } from '../logger';
import { buildVerifyEmailTemplate } from './templates/verifyEmail';
import { buildLoginAlertTemplate, type LoginAlertTemplateData } from './templates/loginAlert';
import { buildAccountLockedTemplate, type AccountLockedTemplateData } from './templates/accountLocked';
import { buildPasswordResetTemplate } from './templates/passwordReset';
import { buildStaffInviteTemplate } from './templates/staffInvite';
import { buildTenantOperatorInviteTemplate } from './templates/tenantOperatorInvite';
import type { EmailBrand } from './templates/brandedLayout';
import {
  resolveTenantEmailBrand,
  tenantPortalUrl,
  type TenantEmailContext,
} from './templates/emailBrand';

const resend = config.RESEND_EMAIL_ENABLED ? new Resend(config.RESEND_API_KEY) : null;

const INLINE_EMAIL_IMAGES = [
  { cid: 'racko-logo', filename: 'racko-logo.png' },
  { cid: 'email-mail-check', filename: 'mail-check.png' },
  { cid: 'email-key-check', filename: 'key-check.png' },
  { cid: 'email-alert-check', filename: 'alert-check.png' },
  { cid: 'email-lock-check', filename: 'lock-check.png' },
] as const;

let inlineImageCache:
  | Array<{ cid: string; filename: string; content: string; mimeType: string }>
  | null = null;

function getInlineEmailImages() {
  if (inlineImageCache) return inlineImageCache;
  inlineImageCache = INLINE_EMAIL_IMAGES.map(({ cid, filename }) => ({
    cid,
    filename,
    content: readFileSync(join(__dirname, 'assets', filename)).toString('base64'),
    mimeType: 'image/png',
  }));
  return inlineImageCache;
}

/** Only attach CIDs actually referenced in the HTML — unused ones show up as Gmail attachments. */
function getInlineImagesForHtml(html: string) {
  const used = new Set<string>();
  const re = /cid:([a-zA-Z0-9_-]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    used.add(match[1]);
  }
  return getInlineEmailImages().filter((image) => used.has(image.cid));
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Overrides EMAIL_FROM_NAME (e.g. tenant portal name). */
  fromName?: string;
}

function formatResendError(error: unknown): string {
  if (!error) return 'Unknown Resend error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const err = error as { message?: string; error?: string; name?: string; statusCode?: number };
    const parts = [
      err.name,
      err.statusCode != null ? `status=${err.statusCode}` : null,
      err.message || err.error,
    ].filter(Boolean);
    return parts.join(' | ') || JSON.stringify(error);
  }
  return String(error);
}

async function sendViaResend(options: EmailOptions): Promise<string | null> {
  if (!resend) {
    throw new Error('Resend email provider is not enabled.');
  }

  const fromName = options.fromName?.trim() || config.EMAIL_FROM_NAME;
  const { data, error } = await resend.emails.send({
    from: `${fromName} <${config.EMAIL_FROM_ADDRESS}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    attachments: getInlineImagesForHtml(options.html).map((image) => ({
      filename: image.filename,
      content: image.content,
      contentId: image.cid,
      contentType: image.mimeType,
    })),
  });

  // Resend returns { data, error } and does not throw for API failures.
  if (error) {
    throw new Error(formatResendError(error));
  }

  return data?.id ?? null;
}

function zeptoAuthorizationHeader(): string {
  const token = config.ZOHO_ZEPTOMAIL_TOKEN.trim();
  return /^zoho-enczapikey\s+/i.test(token) ? token : `Zoho-enczapikey ${token}`;
}

async function sendViaZoho(options: EmailOptions): Promise<string | null> {
  const fromName = options.fromName?.trim() || config.EMAIL_FROM_NAME;
  const response = await fetch(config.ZOHO_ZEPTOMAIL_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: zeptoAuthorizationHeader(),
    },
    body: JSON.stringify({
      from: {
        address: config.EMAIL_FROM_ADDRESS,
        name: fromName,
      },
      to: [
        {
          email_address: {
            address: options.to,
          },
        },
      ],
      subject: options.subject,
      htmlbody: options.html,
      textbody: options.text,
      inline_images: getInlineImagesForHtml(options.html).map((image) => ({
        content: image.content,
        mime_type: image.mimeType,
        name: image.filename,
        cid: image.cid,
      })),
    }),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `ZeptoMail request failed (${response.status}): ${responseBody.slice(0, 500)}`
    );
  }

  if (!responseBody) return null;
  try {
    const parsed = JSON.parse(responseBody) as {
      request_id?: string;
      data?: Array<{ message_id?: string }>;
    };
    return parsed.request_id ?? parsed.data?.[0]?.message_id ?? null;
  } catch {
    return null;
  }
}

async function sendEmail(options: EmailOptions): Promise<void> {
  const provider = config.ZOHO_EMAIL_ENABLED ? 'zoho_zeptomail' : 'resend';

  try {
    const messageId = config.ZOHO_EMAIL_ENABLED
      ? await sendViaZoho(options)
      : await sendViaResend(options);

    logger.info('Email sent', {
      provider,
      to: options.to,
      subject: options.subject,
      messageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send email', {
      provider,
      to: options.to,
      subject: options.subject,
      from: config.EMAIL_FROM_ADDRESS,
      error: message,
    });
  }
}

export async function sendPlainEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}): Promise<void> {
  await sendEmail(options);
}

export async function sendVerificationEmail(
  to: string,
  rawToken: string,
  brand?: EmailBrand
): Promise<void> {
  const template = buildVerifyEmailTemplate({ rawToken, brand });
  await sendEmail({ to, ...template, fromName: brand?.name });
}

export async function sendLoginAlertEmail(
  to: string,
  data: Omit<LoginAlertTemplateData, 'platformName'>
): Promise<void> {
  const template = buildLoginAlertTemplate(data);
  await sendEmail({ to, ...template, fromName: data.brand?.name });
}

export async function sendAccountLockedEmail(
  to: string,
  data: Omit<AccountLockedTemplateData, 'platformName'>
): Promise<void> {
  const template = buildAccountLockedTemplate(data);
  await sendEmail({ to, ...template, fromName: data.brand?.name });
}

export async function sendPasswordResetEmail(
  to: string,
  rawToken: string,
  brand?: EmailBrand
): Promise<void> {
  const template = buildPasswordResetTemplate({ rawToken, brand });
  await sendEmail({ to, ...template, fromName: brand?.name });
}

export async function sendStaffInviteEmail(input: {
  to: string;
  email: string;
  tempPassword: string;
  verifyToken: string;
  resetToken: string;
  brand?: EmailBrand;
}): Promise<void> {
  const template = buildStaffInviteTemplate({
    email: input.email,
    tempPassword: input.tempPassword,
    verifyToken: input.verifyToken,
    resetToken: input.resetToken,
    brand: input.brand,
  });
  await sendEmail({ to: input.to, ...template, fromName: input.brand?.name });
}

/** Tenant portal password reset (white-labeled). */
export async function sendTenantPasswordResetEmail(input: {
  to: string;
  rawToken: string;
  tenant: TenantEmailContext;
}): Promise<void> {
  const brand = resolveTenantEmailBrand(input.tenant);
  const resetUrl = tenantPortalUrl(
    input.tenant,
    `/console/reset-password?token=${encodeURIComponent(input.rawToken)}`
  );
  const template = buildPasswordResetTemplate({
    rawToken: input.rawToken,
    brand,
    resetUrl,
    expiryLabel: '1 hour',
  });
  await sendEmail({ to: input.to, ...template, fromName: brand.name });
}

/** Tenant console admin/operator invite (white-labeled). */
export async function sendTenantOperatorInviteEmail(input: {
  to: string;
  email: string;
  tempPassword: string;
  verifyToken: string;
  resetToken: string;
  tenant: TenantEmailContext;
  inviteKind?: 'admin' | 'operator';
}): Promise<void> {
  const brand = resolveTenantEmailBrand(input.tenant);
  const verifyUrl = tenantPortalUrl(
    input.tenant,
    `/console/verify-email?token=${encodeURIComponent(input.verifyToken)}`
  );
  const resetUrl = tenantPortalUrl(
    input.tenant,
    `/console/reset-password?token=${encodeURIComponent(input.resetToken)}`
  );
  const template = buildTenantOperatorInviteTemplate({
    email: input.email,
    tempPassword: input.tempPassword,
    verifyUrl,
    resetUrl,
    brand,
    inviteKind: input.inviteKind,
  });
  await sendEmail({ to: input.to, ...template, fromName: brand.name });
}

/** Resend verification for tenant console invite (white-labeled). */
export async function sendTenantVerificationEmail(input: {
  to: string;
  rawToken: string;
  tenant: TenantEmailContext;
}): Promise<void> {
  const brand = resolveTenantEmailBrand(input.tenant);
  const verifyUrl = tenantPortalUrl(
    input.tenant,
    `/console/verify-email?token=${encodeURIComponent(input.rawToken)}`
  );
  const template = buildVerifyEmailTemplate({
    rawToken: input.rawToken,
    brand,
    verifyUrl,
  });
  await sendEmail({ to: input.to, ...template, fromName: brand.name });
}
