const { Resend } = require('resend');
const { validateResendEnv } = require('./resendEnv');

const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let resendClient = null;
let cachedEmailConfig = null;

const getEmailConfig = () => {
  cachedEmailConfig = validateResendEnv();
  return cachedEmailConfig;
};

const getResendClient = () => {
  const config = getEmailConfig();
  if (config.provider !== 'resend') {
    throw new Error('Resend email provider is not enabled.');
  }
  if (!resendClient) {
    resendClient = new Resend(config.apiKey);
  }
  return { client: resendClient, from: config.from, config };
};

const isRetryableEmailError = (error) => {
  const statusCode = Number(
    error?.statusCode || error?.status || error?.response?.status || error?.responseCode
  );
  const errorCode = String(error?.code || error?.name || '').toUpperCase();

  return (
    [408, 421, 429, 450, 451, 452, 454, 455, 500, 502, 503, 504].includes(statusCode) ||
    ['ETIMEDOUT', 'ECONNRESET', 'ESOCKET', 'EAUTH', 'ECONNECTION', 'FETCHERROR'].includes(
      errorCode
    )
  );
};

const guessMimeType = (filename = '') => {
  const lower = String(filename).toLowerCase();
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.xls')) {
    return 'application/vnd.ms-excel';
  }
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.doc')) {
    return 'application/msword';
  }
  if (lower.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.txt')) {
    return 'text/plain';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'text/html';
  }
  return 'application/octet-stream';
};

const toBase64Content = (attachment) => {
  let content = attachment.content;

  if (Buffer.isBuffer(content)) {
    return content.toString('base64');
  }
  if (typeof content === 'string' && attachment.encoding !== 'base64') {
    return Buffer.from(content).toString('base64');
  }
  return content;
};

const normalizeResendAttachments = (attachments = []) =>
  (Array.isArray(attachments) ? attachments : [])
    .filter(Boolean)
    .map((attachment) => {
      const filename = attachment.filename || attachment.name || 'attachment';
      const content = toBase64Content(attachment);
      return {
        filename,
        content
      };
    })
    .filter((attachment) => attachment.content);

const normalizeZohoAttachments = (attachments = []) =>
  (Array.isArray(attachments) ? attachments : [])
    .filter(Boolean)
    .map((attachment) => {
      const filename = attachment.filename || attachment.name || 'attachment';
      const content = toBase64Content(attachment);
      return {
        name: filename,
        content,
        mime_type: attachment.contentType || attachment.mimeType || guessMimeType(filename)
      };
    })
    .filter((attachment) => attachment.content);

const zeptoAuthorizationHeader = (token) =>
  /^zoho-enczapikey\s+/i.test(token) ? token : `Zoho-enczapikey ${token}`;

const sendViaResend = async ({ to, subject, html, text, attachments = [] }) => {
  const { client, from } = getResendClient();
  const recipients = Array.isArray(to) ? to : [to];
  const payload = {
    from,
    to: recipients,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(attachments.length
      ? { attachments: normalizeResendAttachments(attachments) }
      : {})
  };

  const result = await client.emails.send(payload);
  if (result?.error) {
    const error = new Error(result.error.message || 'Resend email send failed.');
    error.statusCode = result.error.statusCode || result.error.status;
    error.code = result.error.name;
    throw error;
  }

  return {
    messageId: result?.data?.id || null,
    provider: 'resend',
    accepted: recipients
  };
};

const sendViaZoho = async ({ to, subject, html, text, attachments = [] }) => {
  const config = getEmailConfig();
  if (config.provider !== 'zoho_zeptomail') {
    throw new Error('Zoho ZeptoMail provider is not enabled.');
  }

  const recipients = Array.isArray(to) ? to : [to];
  const zohoAttachments = normalizeZohoAttachments(attachments);

  const response = await fetch(config.zohoApiUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: zeptoAuthorizationHeader(config.zohoToken)
    },
    body: JSON.stringify({
      from: {
        address: config.fromAddress,
        name: config.fromName
      },
      to: recipients.map((address) => ({
        email_address: { address }
      })),
      subject,
      htmlbody: html,
      ...(text ? { textbody: text } : {}),
      ...(zohoAttachments.length ? { attachments: zohoAttachments } : {})
    })
  });

  const responseBody = await response.text();
  if (!response.ok) {
    const error = new Error(
      `ZeptoMail request failed (${response.status}): ${responseBody.slice(0, 500)}`
    );
    error.statusCode = response.status;
    error.code = 'ZEPTOMAIL_ERROR';
    throw error;
  }

  let messageId = null;
  if (responseBody) {
    try {
      const parsed = JSON.parse(responseBody);
      messageId = parsed.request_id || parsed.data?.[0]?.message_id || null;
    } catch {
      messageId = null;
    }
  }

  return {
    messageId,
    provider: 'zoho_zeptomail',
    accepted: recipients
  };
};

/**
 * Send email via the configured provider (Resend or Zoho ZeptoMail) with retries.
 * Compatible with previous nodemailer / Resend-only call sites.
 */
const sendMailWithRetry = async ({ to, subject, html, text, attachments = [] }) => {
  if (!to) {
    throw new Error('Email recipient (to) is required.');
  }

  const config = getEmailConfig();
  const sendOnce =
    config.provider === 'zoho_zeptomail' ? sendViaZoho : sendViaResend;

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await sendOnce({ to, subject, html, text, attachments });
      return {
        ...result,
        attempt
      };
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS || !isRetryableEmailError(error)) {
        throw error;
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
};

module.exports = {
  sendMailWithRetry,
  isRetryableEmailError,
  getResendClient
};
