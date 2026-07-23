const AppError = require('./AppError');

const isLocalhostUrl = (value) => {
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
};

/**
 * Public client-portal origin for emailed links (manage portal, purchase intent, etc.).
 * Production must set FRONTEND_URL / CLIENT_PORTAL_URL to the real portal (never localhost).
 */
const resolveFrontendBaseUrl = () => {
  const configured = String(
    process.env.FRONTEND_URL || process.env.CLIENT_PORTAL_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');

  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const baseUrl = configured || (isProduction ? '' : 'http://localhost:3000');

  if (!baseUrl) {
    throw new AppError(
      'FRONTEND_URL is not configured. Set FRONTEND_URL to the public client portal URL (for example https://dev.racko.ai).',
      500
    );
  }

  try {
    const parsed = new URL(baseUrl);
    if (!parsed.protocol || !parsed.host) {
      throw new Error('invalid url');
    }
  } catch {
    throw new AppError(
      'FRONTEND_URL must be a valid absolute URL (for example https://dev.racko.ai).',
      500
    );
  }

  if (isProduction && isLocalhostUrl(baseUrl)) {
    throw new AppError(
      'FRONTEND_URL cannot be localhost in production. Set FRONTEND_URL to the public client portal URL (for example https://dev.racko.ai).',
      500
    );
  }

  return baseUrl.replace(/\/+$/, '');
};

module.exports = {
  resolveFrontendBaseUrl,
  isLocalhostUrl
};
