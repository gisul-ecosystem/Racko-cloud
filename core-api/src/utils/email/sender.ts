import { Resend } from 'resend';
import { config } from '../../config';
import { logger } from '../logger';
import { buildVerifyEmailTemplate } from './templates/verifyEmail';
import { buildLoginAlertTemplate, type LoginAlertTemplateData } from './templates/loginAlert';
import { buildAccountLockedTemplate, type AccountLockedTemplateData } from './templates/accountLocked';
import { buildPasswordResetTemplate } from './templates/passwordReset';

const resend = new Resend(config.RESEND_API_KEY);

async function sendEmail(options: { to: string; subject: string; html: string; text: string }): Promise<void> {
  try {
    await resend.emails.send({
      from: `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM_ADDRESS}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    logger.info('Email sent', { to: options.to, subject: options.subject });
  } catch (error) {
    // Log but don't throw — email failure should not break auth flow
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send email', { to: options.to, subject: options.subject, error: message });
  }
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
