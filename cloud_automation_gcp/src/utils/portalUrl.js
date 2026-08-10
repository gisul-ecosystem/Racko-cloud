const stripTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

export function resolveFrontendBaseUrl() {
  const base = process.env.FRONTEND_URL || process.env.CLIENT_PORTAL_URL || 'http://localhost:3000';
  return stripTrailingSlash(base) || 'http://localhost:3000';
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
  return `http://${host}`;
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

export async function resolvePortalBaseUrl({ portalBaseUrl = null } = {}) {
  const stored = buildOriginFromDomain(portalBaseUrl);
  if (stored) return stored;
  return resolveFrontendBaseUrl();
}
