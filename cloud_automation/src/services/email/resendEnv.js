const AppError = require('../../utils/AppError');

const DEFAULT_ZOHO_API_URL = 'https://api.zeptomail.in/v1.1/email';

const getTrimmedEnvValue = (name) => {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
};

const parseBoolFlag = (name, defaultValue) => {
  const raw = getTrimmedEnvValue(name);
  if (!raw) {
    return defaultValue;
  }
  return raw.toLowerCase() === 'true';
};

const resolveEmailEnv = () => {
  const fromAddress =
    getTrimmedEnvValue('EMAIL_FROM_ADDRESS') ||
    getTrimmedEnvValue('EMAIL_FROM') ||
    getTrimmedEnvValue('SMTP_FROM');
  const fromName =
    getTrimmedEnvValue('EMAIL_FROM_NAME') ||
    getTrimmedEnvValue('EMAIL_FROM_DISPLAY_NAME') ||
    'Racko';

  return {
    RESEND_EMAIL_ENABLED: parseBoolFlag('RESEND_EMAIL_ENABLED', true),
    ZOHO_EMAIL_ENABLED: parseBoolFlag('ZOHO_EMAIL_ENABLED', false),
    RESEND_API_KEY: getTrimmedEnvValue('RESEND_API_KEY'),
    ZOHO_ZEPTOMAIL_TOKEN: getTrimmedEnvValue('ZOHO_ZEPTOMAIL_TOKEN'),
    ZOHO_ZEPTOMAIL_API_URL:
      getTrimmedEnvValue('ZOHO_ZEPTOMAIL_API_URL') || DEFAULT_ZOHO_API_URL,
    EMAIL_FROM_ADDRESS: fromAddress,
    EMAIL_FROM_NAME: fromName
  };
};

const collectMissingVars = (envValues) => {
  const missingVars = [];

  if (!envValues.EMAIL_FROM_ADDRESS) {
    missingVars.push('EMAIL_FROM_ADDRESS');
  }
  if (!envValues.EMAIL_FROM_NAME) {
    missingVars.push('EMAIL_FROM_NAME');
  }

  if (envValues.RESEND_EMAIL_ENABLED === envValues.ZOHO_EMAIL_ENABLED) {
    missingVars.push('RESEND_EMAIL_ENABLED|ZOHO_EMAIL_ENABLED');
  } else if (envValues.RESEND_EMAIL_ENABLED && !envValues.RESEND_API_KEY) {
    missingVars.push('RESEND_API_KEY');
  } else if (envValues.ZOHO_EMAIL_ENABLED && !envValues.ZOHO_ZEPTOMAIL_TOKEN) {
    missingVars.push('ZOHO_ZEPTOMAIL_TOKEN');
  }

  return missingVars;
};

/**
 * Validate active transactional email provider (exactly one of Resend / Zoho).
 * Kept as validateResendEnv for call-site compatibility.
 */
const validateResendEnv = () => {
  const envValues = resolveEmailEnv();
  const missingVars = collectMissingVars(envValues);

  if (envValues.RESEND_EMAIL_ENABLED === envValues.ZOHO_EMAIL_ENABLED) {
    throw new AppError(
      'Enable exactly one email provider: RESEND_EMAIL_ENABLED or ZOHO_EMAIL_ENABLED.',
      500
    );
  }

  if (missingVars.length > 0) {
    throw new AppError(
      `Missing required email environment variable(s): ${missingVars.join(', ')}`,
      500
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(envValues.EMAIL_FROM_ADDRESS)) {
    throw new AppError('EMAIL_FROM_ADDRESS must be a valid email address.', 500);
  }

  const provider = envValues.ZOHO_EMAIL_ENABLED ? 'zoho_zeptomail' : 'resend';

  return {
    provider,
    apiKey: envValues.RESEND_API_KEY,
    zohoToken: envValues.ZOHO_ZEPTOMAIL_TOKEN,
    zohoApiUrl: envValues.ZOHO_ZEPTOMAIL_API_URL,
    fromAddress: envValues.EMAIL_FROM_ADDRESS,
    fromName: envValues.EMAIL_FROM_NAME,
    from: `${envValues.EMAIL_FROM_NAME} <${envValues.EMAIL_FROM_ADDRESS}>`
  };
};

const getResendConfigStatus = () => {
  const envValues = resolveEmailEnv();
  const missingVars = collectMissingVars(envValues);
  const provider = envValues.ZOHO_EMAIL_ENABLED
    ? 'zoho_zeptomail'
    : envValues.RESEND_EMAIL_ENABLED
      ? 'resend'
      : null;

  return {
    configured: missingVars.length === 0,
    missingVars,
    provider
  };
};

module.exports = {
  validateResendEnv,
  getResendConfigStatus,
  resolveEmailEnv
};
