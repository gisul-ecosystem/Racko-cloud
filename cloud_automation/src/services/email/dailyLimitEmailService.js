const nodemailer = require('nodemailer');
const AppError = require('../../utils/AppError');

const REQUIRED_SMTP_ENV_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getTrimmedEnvValue = (name) => {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
};

const validateSmtpEnv = () => {
  const smtpPassword = getTrimmedEnvValue('SMTP_PASS') || getTrimmedEnvValue('SMTP_PASSWORD');
  const smtpFrom = getTrimmedEnvValue('SMTP_FROM') || getTrimmedEnvValue('SMTP_USER');
  const envValues = REQUIRED_SMTP_ENV_VARS.reduce((accumulator, name) => {
    accumulator[name] = getTrimmedEnvValue(name);
    return accumulator;
  }, {});

  envValues.SMTP_PASS = smtpPassword;
  envValues.SMTP_FROM = smtpFrom;

  const missingVars = REQUIRED_SMTP_ENV_VARS.filter((name) => !envValues[name]);

  if (missingVars.length > 0) {
    throw new AppError(`Missing required SMTP environment variable(s): ${missingVars.join(', ')}`, 500);
  }

  const smtpPort = Number(envValues.SMTP_PORT);

  if (!Number.isInteger(smtpPort) || smtpPort <= 0) {
    throw new AppError('SMTP_PORT must be a positive integer.', 500);
  }

  const secure = process.env.SMTP_SECURE === undefined
    ? smtpPort === 465
    : ['true', '1', 'yes'].includes(String(process.env.SMTP_SECURE).trim().toLowerCase());

  return {
    host: envValues.SMTP_HOST,
    port: smtpPort,
    secure,
    auth: {
      user: envValues.SMTP_USER,
      pass: envValues.SMTP_PASS
    },
    from: envValues.SMTP_FROM
  };
};

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

const buildDailyLimitReachedEmailHtml = ({ dailyLimitHours, hoursUsed }) => `
  <!doctype html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 12px; font-size: 24px;">Daily usage limit reached</h1>
        <p style="margin: 0 0 16px;">
          You have used <strong>${escapeHtml(hoursUsed)} of ${escapeHtml(dailyLimitHours)} hours</strong>
          allowed for today's lab session.
        </p>
        <p style="margin: 0 0 16px;">
          Your Azure lab account has been <strong>temporarily suspended</strong> for the rest of today.
          All resources inside your lab have been deleted.
        </p>
        <p style="margin: 0 0 16px;">
          Your access will automatically resume at the start of your next scheduled window.
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

const sendDailyLimitReachedEmail = async ({ to, dailyLimitHours, consumedMinutes }) => {
  const hoursUsed = (consumedMinutes / 60).toFixed(1);
  const { transporter, from } = createSmtpTransport();
  const subject = '[Racko] Daily usage limit reached — your lab access has been paused';
  const html = buildDailyLimitReachedEmailHtml({ dailyLimitHours, hoursUsed });

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await transporter.sendMail({
        from,
        to,
        subject,
        html
      });
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
  buildDailyLimitReachedEmailHtml,
  sendDailyLimitReachedEmail
};
