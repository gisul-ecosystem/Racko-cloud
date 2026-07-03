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

  return { 'X-Tenant-Domain': devDomain };
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
 * Direct gateway URL for browser SSE streams.
 * Bypasses Next.js rewrites, which buffer long-lived text/event-stream responses.
 */
export function getSseGatewayBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const configured = process.env['NEXT_PUBLIC_GATEWAY_URL']?.trim();
    if (configured) return stripTrailingSlash(configured);
    return DEFAULT_GATEWAY;
  }
  return getServerGatewayBaseUrl();
}
