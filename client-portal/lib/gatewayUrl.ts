const DEFAULT_GATEWAY = 'http://localhost:8000';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function getServerGatewayBaseUrl(): string {
  return stripTrailingSlash(
    process.env['GATEWAY_INTERNAL_URL'] ??
      process.env['NEXT_PUBLIC_GATEWAY_URL'] ??
      DEFAULT_GATEWAY
  );
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().trim();
}

/** Super-admin / platform hostname (e.g. admin.racko.local). Set in .env.local. */
export function getPlatformDomain(): string | undefined {
  const raw = process.env['NEXT_PUBLIC_PLATFORM_DOMAIN']?.trim();
  return raw ? normalizeHost(raw) : undefined;
}

/**
 * Local dev only: tenant domain to simulate when browsing on localhost.
 * Must match the tenant's `domain` field in super-admin (e.g. labs.aaptor.com).
 */
export function getTenantDevDomain(): string | undefined {
  const raw = process.env['NEXT_PUBLIC_TENANT_DEV_DOMAIN']?.trim();
  return raw ? normalizeHost(raw) : undefined;
}

/**
 * Sent on localhost when NEXT_PUBLIC_TENANT_DEV_DOMAIN is set so the gateway
 * can resolve the tenant without DNS / hosts-file mapping.
 */
export function getTenantDomainHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  if (!isLocalDevHost(window.location.hostname)) return {};

  const devDomain = getTenantDevDomain();
  if (!devDomain) return {};

  return {
    'X-Tenant-Domain': devDomain,
    // Prefer forwarded host so resolve works even when gateway NODE_ENV=production.
    'X-Forwarded-Host': devDomain,
  };
}

/**
 * Identity headers for tenant cloud calls when the gateway Host is not the
 * tenant domain (e.g. direct provision calls to localhost:8000).
 */
export function getTenantGatewayIdentityHeaders(gatewayBaseUrl?: string): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const pageHost = normalizeHost(window.location.hostname);
  const tenantHost =
    isLocalDevHost(pageHost) && getTenantDevDomain() ? getTenantDevDomain()! : pageHost;

  const headers: Record<string, string> = { ...getTenantDomainHeaders() };

  let gatewayHost = '';
  try {
    gatewayHost = normalizeHost(new URL(gatewayBaseUrl ?? getDirectGatewayBaseUrl()).hostname);
  } catch {
    return headers;
  }

  // Cross-origin / direct gateway: forward the portal's tenant host for resolve.
  if (gatewayHost && gatewayHost !== pageHost) {
    headers['X-Forwarded-Host'] = tenantHost;
    headers['X-Tenant-Domain'] = tenantHost;
  }

  return headers;
}

export function isLocalDevHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return host === 'localhost' || host === '127.0.0.1';
}

export function isPlatformHost(hostname?: string): boolean {
  const platform = getPlatformDomain();
  if (!platform) return false;
  const host =
    hostname !== undefined
      ? normalizeHost(hostname)
      : typeof window !== 'undefined'
        ? normalizeHost(window.location.hostname)
        : '';
  return host === platform;
}

/**
 * Manage portal (/manage-users) tenant chrome is host-based only.
 * Platform domains and localhost (admin app) always stay Racko — even when
 * NEXT_PUBLIC_TENANT_DEV_DOMAIN is set for tenant dashboard work.
 * Real tenant hostnames (e.g. labs.kanonkode.com) get tenant branding.
 */
export function shouldUseTenantManagePortalBranding(hostname?: string): boolean {
  const host =
    hostname !== undefined
      ? normalizeHost(hostname)
      : typeof window !== 'undefined'
        ? normalizeHost(window.location.hostname)
        : '';

  if (!host) return false;
  if (isPlatformHost(host)) return false;
  if (isLocalDevHost(host)) return false;
  return true;
}

/**
 * Gateway base URL for API calls.
 * Browser: same origin (Next.js rewrites /api → cloud-gateway) so HttpOnly cookies work.
 * Server: direct gateway URL (Docker internal network when GATEWAY_INTERNAL_URL is set).
 */
export function getGatewayBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return stripTrailingSlash(window.location.origin);
  }
  return getServerGatewayBaseUrl();
}

/**
 * Direct gateway URL for long-running browser requests.
 * Local dev: bypass Next.js rewrites and call localhost:8000 directly.
 * Deployed portals: prefer same-origin (/api → nginx → gateway) so instance-policy
 * and other slow provision steps are not cut off by CDN timeouts on api-* subdomains.
 */
export function getDirectGatewayBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const pageOrigin = stripTrailingSlash(window.location.origin);

    if (isLocalDevHost(window.location.hostname)) {
      return DEFAULT_GATEWAY;
    }

    const configured = process.env['NEXT_PUBLIC_GATEWAY_URL']?.trim();
    if (configured) {
      try {
        const configuredHost = normalizeHost(new URL(configured).hostname);
        const pageHost = normalizeHost(window.location.hostname);

        const isDockerInternal =
          configuredHost === 'cloud-gateway' ||
          configuredHost.endsWith('.internal') ||
          (configuredHost.endsWith('.local') && configuredHost.includes('gateway'));

        if (!isDockerInternal && configuredHost === pageHost) {
          return stripTrailingSlash(configured);
        }
      } catch {
        // fall through to same-origin
      }
    }

    return pageOrigin;
  }

  return getServerGatewayBaseUrl();
}

/** Alias for SSE streams and other long-lived direct gateway connections. */
export function getSseGatewayBaseUrl(): string {
  return getDirectGatewayBaseUrl();
}
