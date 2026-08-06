const AppError = require('./AppError');

const TENANT_USER_PREFIX = 'tenant:';
const tenantDomainCache = new Map();
const TENANT_DOMAIN_CACHE_TTL_MS = 60_000;

const isLocalhostUrl = (value) => {
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
};

const stripTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

const isLocalHostname = (host) => {
  const hostname = String(host || '').split(':')[0].toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

/** Local hosts have no TLS in dev, so https would fail with ERR_SSL_PROTOCOL_ERROR. */
const resolveProtocolForHost = (host) => {
  if (isLocalHostname(host)) return 'http';
  return String(process.env.TENANT_PORTAL_PROTOCOL || 'https').replace(/:$/, '');
};

/**
 * Build an absolute portal origin from a tenant hostname or absolute URL.
 */
const buildOriginFromDomain = (domainOrUrl) => {
  const raw = String(domainOrUrl || '').trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
    } catch {
      return null;
    }
  }

  const host = raw.replace(/^\/+/, '').split('/')[0].toLowerCase();
  if (!host || host.includes(' ')) return null;

  return `${resolveProtocolForHost(host)}://${host}`;
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

const parseTenantIdFromOwnerId = (ownerId) => {
  const value = String(ownerId || '').trim();
  if (!value.toLowerCase().startsWith(TENANT_USER_PREFIX)) return null;
  const tenantId = value.slice(TENANT_USER_PREFIX.length).trim();
  return tenantId || null;
};

const getCoreApiBaseUrl = () =>
  stripTrailingSlash(
    process.env.CORE_API_URL ||
      process.env.CORE_API_INTERNAL_URL ||
      'http://localhost:8001'
  );

const fetchTenantDomainById = async (tenantId) => {
  const id = String(tenantId || '').trim();
  if (!id) return null;

  const cached = tenantDomainCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.domain;
  }

  const secret = String(process.env.INTERNAL_SERVICE_SECRET || '').trim();
  if (!secret) {
    console.warn(
      '[frontendUrl] INTERNAL_SERVICE_SECRET is not set — cannot resolve tenant portal domain'
    );
    return null;
  }

  try {
    const response = await fetch(`${getCoreApiBaseUrl()}/internal/tenants/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Internal-Secret': secret
      }
    });

    if (!response.ok) {
      console.warn('[frontendUrl] Tenant domain lookup failed', {
        tenantId: id,
        status: response.status
      });
      return null;
    }

    const body = await response.json();
    const domain = String(body?.domain || '').trim().toLowerCase();
    if (!domain) return null;

    tenantDomainCache.set(id, {
      domain,
      expiresAt: Date.now() + TENANT_DOMAIN_CACHE_TTL_MS
    });
    return domain;
  } catch (error) {
    console.warn('[frontendUrl] Tenant domain lookup error', {
      tenantId: id,
      message: error?.message || String(error)
    });
    return null;
  }
};

/**
 * Resolve the public portal origin for email links.
 * Prefers a stored portal base URL, then tenant domain / owner id, then FRONTEND_URL.
 */
const resolvePortalBaseUrl = async ({
  portalBaseUrl = null,
  tenantDomain = null,
  ownerId = null
} = {}) => {
  const stored = buildOriginFromDomain(portalBaseUrl);
  if (stored) return stored;

  const headerDomain = buildOriginFromDomain(tenantDomain);
  if (headerDomain) return headerDomain;

  const tenantId = parseTenantIdFromOwnerId(ownerId);
  if (tenantId) {
    const domain = await fetchTenantDomainById(tenantId);
    const fromTenant = buildOriginFromDomain(domain);
    if (fromTenant) return fromTenant;
  }

  return resolveFrontendBaseUrl();
};

const resolvePortalBaseUrlFromRequestHeaders = (headers = {}) => {
  const domain =
    headers['x-tenant-domain'] ||
    headers['X-Tenant-Domain'] ||
    headers['x-forwarded-host'] ||
    headers['X-Forwarded-Host'] ||
    '';
  return buildOriginFromDomain(String(domain).split(',')[0]);
};

module.exports = {
  resolveFrontendBaseUrl,
  resolvePortalBaseUrl,
  resolvePortalBaseUrlFromRequestHeaders,
  parseTenantIdFromOwnerId,
  buildOriginFromDomain,
  isLocalhostUrl
};
