const { Resend } = require('resend');
const { validateResendEnv } = require('./resendEnv');

const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let resendClient = null;
let cachedFrom = null;

const getResendClient = () => {
  const config = validateResendEnv();
  if (!resendClient) {
    resendClient = new Resend(config.apiKey);
  }
  cachedFrom = config.from;
  return { client: resendClient, from: config.from };
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

const normalizeAttachments = (attachments = []) =>
  (Array.isArray(attachments) ? attachments : [])
    .filter(Boolean)
    .map((attachment) => {
      const filename = attachment.filename || attachment.name || 'attachment';
      let content = attachment.content;

      if (Buffer.isBuffer(content)) {
        content = content.toString('base64');
      } else if (typeof content === 'string' && attachment.encoding !== 'base64') {
        // Assume raw string content unless already base64-encoded for nodemailer.
        content = Buffer.from(content).toString('base64');
      }

      return {
        filename,
        content
      };
    })
    .filter((attachment) => attachment.content);

/**
 * Send email via Resend with retries.
 * Compatible with previous nodemailer call sites (to/subject/html/attachments).
 */
const sendMailWithRetry = async ({ to, subject, html, text, attachments = [] }) => {
  if (!to) {
    throw new Error('Email recipient (to) is required.');
  }

  const { client, from } = getResendClient();
  const payload = {
    from: cachedFrom || from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(text ? { text } : {}),
    ...(attachments.length
      ? { attachments: normalizeAttachments(attachments) }
      : {})
  };

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
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
        attempt,
        accepted: payload.to
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
