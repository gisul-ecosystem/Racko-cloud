const TENANT_USER_PREFIX = 'tenant:';
const tenantDomainCache = new Map();
const TENANT_DOMAIN_CACHE_TTL_MS = 60_000;

const stripTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

function isLocalHostname(host) {
  const hostname = String(host || '').split(':')[0].toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/** Local hosts have no TLS in dev, so https would fail with ERR_SSL_PROTOCOL_ERROR. */
function resolveProtocolForHost(host) {
  if (isLocalHostname(host)) return 'http';
  return String(process.env.TENANT_PORTAL_PROTOCOL || 'https').replace(/:$/, '');
}

export function buildOriginFromDomain(domainOrUrl) {
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
}

export function resolveFrontendBaseUrl() {
  const base =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_PORTAL_URL ||
    'http://localhost:3000';
  return stripTrailingSlash(base) || 'http://localhost:3000';
}

export function parseTenantIdFromOwnerId(ownerId) {
  const value = String(ownerId || '').trim();
  if (!value.toLowerCase().startsWith(TENANT_USER_PREFIX)) return null;
  const tenantId = value.slice(TENANT_USER_PREFIX.length).trim();
  return tenantId || null;
}

function getCoreApiBaseUrl() {
  return stripTrailingSlash(
    process.env.CORE_API_URL ||
      process.env.CORE_API_INTERNAL_URL ||
      'http://localhost:8001'
  );
}

async function fetchTenantDomainById(tenantId) {
  const id = String(tenantId || '').trim();
  if (!id) return null;

  const cached = tenantDomainCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.domain;
  }

  const secret = String(process.env.INTERNAL_SERVICE_SECRET || '').trim();
  if (!secret) {
    console.warn(
      '[portalUrl] INTERNAL_SERVICE_SECRET is not set — cannot resolve tenant portal domain'
    );
    return null;
  }

  try {
    const response = await fetch(`${getCoreApiBaseUrl()}/internal/tenants/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Internal-Secret': secret,
      },
    });

    if (!response.ok) {
      console.warn('[portalUrl] Tenant domain lookup failed', {
        tenantId: id,
        status: response.status,
      });
      return null;
    }

    const body = await response.json();
    const domain = String(body?.domain || '').trim().toLowerCase();
    if (!domain) return null;

    tenantDomainCache.set(id, {
      domain,
      expiresAt: Date.now() + TENANT_DOMAIN_CACHE_TTL_MS,
    });
    return domain;
  } catch (error) {
    console.warn('[portalUrl] Tenant domain lookup error', {
      tenantId: id,
      message: error?.message || String(error),
    });
    return null;
  }
}

/**
 * Resolve public portal origin for email links (manage portal, purchase intent).
 */
export async function resolvePortalBaseUrl({
  portalBaseUrl = null,
  tenantDomain = null,
  ownerId = null,
} = {}) {
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
}

export function resolvePortalBaseUrlFromRequestHeaders(headers = {}) {
  const domain =
    headers['x-tenant-domain'] ||
    headers['X-Tenant-Domain'] ||
    headers['x-forwarded-host'] ||
    headers['X-Forwarded-Host'] ||
    '';
  return buildOriginFromDomain(String(domain).split(',')[0]);
}
