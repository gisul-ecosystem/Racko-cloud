const AppError = require('../../utils/AppError');

const REQUIRED_RESEND_ENV_VARS = ['RESEND_API_KEY', 'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME'];

const getTrimmedEnvValue = (name) => {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
};

const resolveResendEnv = () => {
  const fromAddress =
    getTrimmedEnvValue('EMAIL_FROM_ADDRESS') ||
    getTrimmedEnvValue('EMAIL_FROM') ||
    getTrimmedEnvValue('SMTP_FROM');
  const fromName =
    getTrimmedEnvValue('EMAIL_FROM_NAME') ||
    getTrimmedEnvValue('EMAIL_FROM_DISPLAY_NAME') ||
    'Racko';

  return {
    RESEND_API_KEY: getTrimmedEnvValue('RESEND_API_KEY'),
    EMAIL_FROM_ADDRESS: fromAddress,
    EMAIL_FROM_NAME: fromName
  };
};

const validateResendEnv = () => {
  const envValues = resolveResendEnv();
  const missingVars = REQUIRED_RESEND_ENV_VARS.filter((name) => !envValues[name]);

  if (missingVars.length > 0) {
    throw new AppError(
      `Missing required email environment variable(s): ${missingVars.join(', ')}`,
      500
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(envValues.EMAIL_FROM_ADDRESS)) {
    throw new AppError('EMAIL_FROM_ADDRESS must be a valid email address.', 500);
  }

  return {
    apiKey: envValues.RESEND_API_KEY,
    fromAddress: envValues.EMAIL_FROM_ADDRESS,
    fromName: envValues.EMAIL_FROM_NAME,
    from: `${envValues.EMAIL_FROM_NAME} <${envValues.EMAIL_FROM_ADDRESS}>`
  };
};

const getResendConfigStatus = () => {
  const envValues = resolveResendEnv();
  const missingVars = REQUIRED_RESEND_ENV_VARS.filter((name) => !envValues[name]);

  return {
    configured: missingVars.length === 0,
    missingVars
  };
};

module.exports = {
  validateResendEnv,
  getResendConfigStatus
};
