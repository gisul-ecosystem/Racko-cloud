import sgMail from '@sendgrid/mail';
import { config } from './index';
import { logger } from '../utils/logger';

export function initializeSendGrid(): void {
  sgMail.setApiKey(config.SENDGRID_API_KEY);
  logger.info('SendGrid initialized');
}

export { sgMail };
