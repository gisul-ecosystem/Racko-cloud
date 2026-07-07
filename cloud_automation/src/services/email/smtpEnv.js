const AppError = require('../../utils/AppError');

const REQUIRED_SMTP_ENV_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];

const getTrimmedEnvValue = (name) => {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
};

const resolveSmtpEnv = () => {
  const smtpPassword =
    getTrimmedEnvValue('SMTP_PASS') ||
    getTrimmedEnvValue('SMTP_PASSWORD');
  const smtpFrom =
    getTrimmedEnvValue('SMTP_FROM') ||
    getTrimmedEnvValue('EMAIL_FROM') ||
    getTrimmedEnvValue('SMTP_USER');

  const envValues = REQUIRED_SMTP_ENV_VARS.reduce((accumulator, name) => {
    accumulator[name] = getTrimmedEnvValue(name);
    return accumulator;
  }, {});

  envValues.SMTP_PASS = smtpPassword;
  envValues.SMTP_FROM = smtpFrom;

  return envValues;
};

const validateSmtpEnv = () => {
  const envValues = resolveSmtpEnv();
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

const getSmtpConfigStatus = () => {
  const envValues = resolveSmtpEnv();
  const missingVars = REQUIRED_SMTP_ENV_VARS.filter((name) => !envValues[name]);

  return {
    configured: missingVars.length === 0,
    missingVars
  };
};

module.exports = {
  validateSmtpEnv,
  getSmtpConfigStatus
};
