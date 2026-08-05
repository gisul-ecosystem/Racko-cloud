import { Resend } from 'resend';
import { config } from '../../config';
import { logger } from '../logger';
import { buildVerifyEmailTemplate } from './templates/verifyEmail';
import { buildLoginAlertTemplate, type LoginAlertTemplateData } from './templates/loginAlert';
import { buildAccountLockedTemplate, type AccountLockedTemplateData } from './templates/accountLocked';
import { buildPasswordResetTemplate } from './templates/passwordReset';
import { buildStaffInviteTemplate } from './templates/staffInvite';
import {
  buildVmHostLeaseExpiryTemplate,
  type VmHostLeaseExpiryTemplateData,
} from './templates/vmHostLeaseExpiry';

const resend = new Resend(config.RESEND_API_KEY);

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

async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  try {
    const { data, error } = await resend.emails.send({
      from: `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM_ADDRESS}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    // Resend returns { data, error } and does not throw for API failures.
    if (error) {
      logger.error('Failed to send email', {
        to: options.to,
        subject: options.subject,
        from: config.EMAIL_FROM_ADDRESS,
        error: formatResendError(error),
      });
      return;
    }

    logger.info('Email sent', {
      to: options.to,
      subject: options.subject,
      resendId: data?.id,
    });
  } catch (error) {
    // Network / unexpected failures
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send email', {
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
}): Promise<void> {
  await sendEmail(options);
}

export async function sendVerificationEmail(to: string, rawToken: string): Promise<void> {
  const template = buildVerifyEmailTemplate({ rawToken });
  await sendEmail({ to, ...template });
}

export async function sendLoginAlertEmail(to: string, data: Omit<LoginAlertTemplateData, 'platformName'>): Promise<void> {
  const template = buildLoginAlertTemplate(data);
  await sendEmail({ to, ...template });
}

export async function sendAccountLockedEmail(to: string, data: Omit<AccountLockedTemplateData, 'platformName'>): Promise<void> {
  const template = buildAccountLockedTemplate(data);
  await sendEmail({ to, ...template });
}

export async function sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
  const template = buildPasswordResetTemplate({ rawToken });
  await sendEmail({ to, ...template });
}

export async function sendStaffInviteEmail(input: {
  to: string;
  email: string;
  tempPassword: string;
  verifyToken: string;
  resetToken: string;
}): Promise<void> {
  const template = buildStaffInviteTemplate({
    email: input.email,
    tempPassword: input.tempPassword,
    verifyToken: input.verifyToken,
    resetToken: input.resetToken,
  });
  await sendEmail({ to: input.to, ...template });
}

export async function sendVmHostLeaseExpiryEmail(input: {
  to: string;
  leases: VmHostLeaseExpiryTemplateData['leases'];
  warningDays: number;
}): Promise<void> {
  const template = buildVmHostLeaseExpiryTemplate({
    leases: input.leases,
    warningDays: input.warningDays,
  });
  await sendEmail({ to: input.to, ...template });
}
