import { Resend } from 'resend';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const resend = config.RESEND_EMAIL_ENABLED ? new Resend(config.RESEND_API_KEY) : null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function supportTicketUrl(ticketNumber: string): string {
  const adminUrl = (process.env.ADMIN_URL ?? '').replace(/\/$/, '');
  return `${adminUrl}/support/tickets/${encodeURIComponent(ticketNumber)}`;
}

function emailFooter(): string {
  return '<p style="margin-top:24px;color:#666;font-size:12px;">Racko Support System</p>';
}

async function sendSupportEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  context: string;
}): Promise<void> {
  try {
    if (!resend) {
      logger.warn('Support email skipped — Resend is not enabled.', { context: options.context });
      return;
    }

    const { data, error } = await resend.emails.send({
      from: `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM_ADDRESS}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      throw new Error(formatResendError(error));
    }

    logger.info('Support email sent.', {
      context: options.context,
      to: options.to,
      messageId: data?.id ?? null,
    });
  } catch (error) {
    logger.warn('Support email failed.', {
      context: options.context,
      to: options.to,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function sendTicketAssignedEmail(params: {
  agentEmail: string;
  agentName: string;
  ticketNumber: string;
  subject: string;
  type: string;
  priority: string;
  tenantName?: string;
}): Promise<void> {
  const ticketNumber = escapeHtml(params.ticketNumber);
  const subject = escapeHtml(params.subject);
  const type = escapeHtml(params.type);
  const priority = escapeHtml(params.priority);
  const agentName = escapeHtml(params.agentName);
  const tenantLine = params.tenantName
    ? `<p><strong>Tenant:</strong> ${escapeHtml(params.tenantName)}</p>`
    : '';
  const ticketUrl = supportTicketUrl(params.ticketNumber);

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;max-width:560px;">
      <h2 style="margin:0 0 16px;">You have a new support ticket</h2>
      <p>Hi ${agentName},</p>
      <p><strong>Ticket:</strong> ${ticketNumber}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Type:</strong> ${type}</p>
      <p><strong>Priority:</strong> ${priority}</p>
      ${tenantLine}
      <p><a href="${ticketUrl}">View ticket</a></p>
      ${emailFooter()}
    </div>
  `.trim();

  const text = [
    'You have a new support ticket',
    `Ticket: ${params.ticketNumber}`,
    `Subject: ${params.subject}`,
    `Type: ${params.type}`,
    `Priority: ${params.priority}`,
    params.tenantName ? `Tenant: ${params.tenantName}` : null,
    `View ticket: ${ticketUrl}`,
    'Racko Support System',
  ]
    .filter(Boolean)
    .join('\n');

  await sendSupportEmail({
    to: params.agentEmail,
    subject: `[Racko Support] New ticket assigned to you — ${params.ticketNumber}`,
    html,
    text,
    context: 'sendTicketAssignedEmail',
  });
}

export async function sendTicketStatusUpdateEmail(params: {
  requesterEmail: string;
  requesterName: string;
  ticketNumber: string;
  subject: string;
  newStatus: string;
}): Promise<void> {
  const requesterName = escapeHtml(params.requesterName);
  const ticketNumber = escapeHtml(params.ticketNumber);
  const subject = escapeHtml(params.subject);
  const newStatus = escapeHtml(params.newStatus);

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;max-width:560px;">
      <h2 style="margin:0 0 16px;">Your ticket has been updated</h2>
      <p>Hi ${requesterName},</p>
      <p>Your support ticket <strong>${ticketNumber}</strong> has a new status.</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>New status:</strong> ${newStatus}</p>
      ${emailFooter()}
    </div>
  `.trim();

  const text = [
    'Your ticket has been updated',
    `Ticket: ${params.ticketNumber}`,
    `Subject: ${params.subject}`,
    `New status: ${params.newStatus}`,
    'Racko Support System',
  ].join('\n');

  await sendSupportEmail({
    to: params.requesterEmail,
    subject: `[Racko Support] Your ticket ${params.ticketNumber} has been updated`,
    html,
    text,
    context: 'sendTicketStatusUpdateEmail',
  });
}

export async function sendTicketEscalatedEmail(params: {
  agentEmail: string;
  agentName: string;
  ticketNumber: string;
  subject: string;
  escalatedByName: string;
  note?: string;
}): Promise<void> {
  const agentName = escapeHtml(params.agentName);
  const ticketNumber = escapeHtml(params.ticketNumber);
  const subject = escapeHtml(params.subject);
  const escalatedByName = escapeHtml(params.escalatedByName);
  const noteLine = params.note
    ? `<p><strong>Note:</strong> ${escapeHtml(params.note)}</p>`
    : '';
  const ticketUrl = supportTicketUrl(params.ticketNumber);

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;max-width:560px;">
      <h2 style="margin:0 0 16px;">Escalated ticket assigned to you</h2>
      <p>Hi ${agentName},</p>
      <p>Ticket <strong>${ticketNumber}</strong> was escalated to the platform team.</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Escalated by:</strong> ${escalatedByName}</p>
      ${noteLine}
      <p><a href="${ticketUrl}">View ticket</a></p>
      ${emailFooter()}
    </div>
  `.trim();

  const text = [
    'Escalated ticket assigned to you',
    `Ticket: ${params.ticketNumber}`,
    `Subject: ${params.subject}`,
    `Escalated by: ${params.escalatedByName}`,
    params.note ? `Note: ${params.note}` : null,
    `View ticket: ${ticketUrl}`,
    'Racko Support System',
  ]
    .filter(Boolean)
    .join('\n');

  await sendSupportEmail({
    to: params.agentEmail,
    subject: `[Racko Support] Escalated ticket assigned to you — ${params.ticketNumber}`,
    html,
    text,
    context: 'sendTicketEscalatedEmail',
  });
}

export async function sendNewTicketAcknowledgementEmail(params: {
  requesterEmail: string;
  requesterName: string;
  ticketNumber: string;
  subject: string;
}): Promise<void> {
  const requesterName = escapeHtml(params.requesterName);
  const ticketNumber = escapeHtml(params.ticketNumber);
  const subject = escapeHtml(params.subject);

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;max-width:560px;">
      <h2 style="margin:0 0 16px;">We received your request</h2>
      <p>Hi ${requesterName},</p>
      <p>Thank you for contacting Racko Support. We have received your ticket and will respond soon.</p>
      <p><strong>Ticket:</strong> ${ticketNumber}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      ${emailFooter()}
    </div>
  `.trim();

  const text = [
    'We received your request',
    `Ticket: ${params.ticketNumber}`,
    `Subject: ${params.subject}`,
    'Racko Support System',
  ].join('\n');

  await sendSupportEmail({
    to: params.requesterEmail,
    subject: `[Racko Support] We received your request — ${params.ticketNumber}`,
    html,
    text,
    context: 'sendNewTicketAcknowledgementEmail',
  });
}
