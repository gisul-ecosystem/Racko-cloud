const nodemailer = require('nodemailer');
const { validateSmtpEnv } = require('./smtpEnv');

const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createSmtpTransport = () => {
  const smtpConfig = validateSmtpEnv();

  return {
    transporter: nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.auth
    }),
    from: smtpConfig.from
  };
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const buildLabExpiryWarningEmailHtml = ({ requestLabel, location, expiresAt }) => `
  <!doctype html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 12px; font-size: 24px;">Azure lab expires in 24 hours</h1>
        <p style="margin: 0 0 16px;">
          Your Azure lab <strong>${escapeHtml(requestLabel)}</strong> is scheduled to expire soon.
        </p>
        <ul style="margin: 0 0 16px; padding-left: 20px;">
          <li><strong>Region:</strong> ${escapeHtml(location || '—')}</li>
          <li><strong>Expires:</strong> ${escapeHtml(expiresAt || 'within 24 hours')}</li>
        </ul>
        <p style="margin: 0 0 16px;">
          After expiry, lab access and resources will be cleaned up automatically. No further cleanup emails will be sent after the lab expires.
        </p>
        <p style="margin: 0; color: #6b7280;">— The Racko Team</p>
      </div>
    </body>
  </html>
`;

const isRetryableEmailError = (error) => {
  const statusCode = Number(error?.statusCode || error?.responseCode || error?.status);
  const errorCode = String(error?.code || '').toUpperCase();

  return (
    [421, 450, 451, 452, 454, 455, 500, 502, 503, 504].includes(statusCode) ||
    ['ETIMEDOUT', 'ECONNRESET', 'ESOCKET', 'EAUTH', 'ECONNECTION'].includes(errorCode)
  );
};

const sendLabExpiryWarningEmail = async ({ to, requestLabel, location, expiresAt }) => {
  if (!to) {
    return { sent: false, mode: 'skipped' };
  }

  const { transporter, from } = createSmtpTransport();
  const html = buildLabExpiryWarningEmailHtml({ requestLabel, location, expiresAt });
  const subject = `[Racko] Azure lab expires in 24 hours — ${requestLabel}`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await transporter.sendMail({ from, to, subject, html });
      return { sent: true, mode: 'smtp', attempt };
    } catch (error) {
      lastError = error;
      if (!isRetryableEmailError(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(attempt * 1000);
    }
  }

  throw lastError;
};

module.exports = {
  sendLabExpiryWarningEmail
};
