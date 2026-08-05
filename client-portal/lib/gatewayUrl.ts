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
 * Bypasses Next.js rewrites, which can reset sockets on slow provision calls.
 * Never use Docker-internal hostnames from the browser.
 */
export function getDirectGatewayBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const configured = process.env['NEXT_PUBLIC_GATEWAY_URL']?.trim();
    if (configured) {
      const url = stripTrailingSlash(configured);
      const host = (() => {
        try {
          return new URL(url).hostname.toLowerCase();
        } catch {
          return '';
        }
      })();

      const isDockerInternal =
        host === 'cloud-gateway' ||
        host.endsWith('.internal') ||
        (host.endsWith('.local') && host.includes('gateway'));

      if (!isDockerInternal) {
        return url;
      }
    }

    if (isLocalDevHost(window.location.hostname)) {
      return DEFAULT_GATEWAY;
    }

    // Production fallback: same public origin (nginx should proxy /api → gateway).
    return stripTrailingSlash(window.location.origin);
  }

  return getServerGatewayBaseUrl();
}

/** Alias for SSE streams and other long-lived direct gateway connections.
 * SSE must bypass the Next.js proxy — Next.js buffers HTTP responses and
 * cannot stream SSE. We always call the public API gateway URL directly.
 *
 * Resolution order:
 *  1. NEXT_PUBLIC_GATEWAY_URL if set and not Docker-internal
 *  2. Same origin with /api paths going directly to nginx → gateway (api-dev.racko.ai etc)
 *     via the nginx proxy_pass which DOES support streaming (proxy_buffering off on SSE paths).
 *
 * In practice on dev.racko.ai: NEXT_PUBLIC_GATEWAY_URL is not set in docker-compose,
 * so this falls back to same origin. The nginx `api-dev.racko.ai` block proxies /api
 * to core-api with streaming support, which is correct.
 * The key difference from regular requests: SSE paths are EXCLUDED from the Next.js
 * rewrite rule (next.config.mjs), so they bypass Next.js buffering entirely and go
 * directly to nginx → core-api.
 */
export function getSseGatewayBaseUrl(): string {
  if (typeof window === 'undefined') return getServerGatewayBaseUrl();

  // Use NEXT_PUBLIC_GATEWAY_URL if it is a real public URL (not Docker-internal)
  const configured = process.env['NEXT_PUBLIC_GATEWAY_URL']?.trim();
  if (configured) {
    const url = stripTrailingSlash(configured);
    const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
    const isDockerInternal = host === 'cloud-gateway' || host.endsWith('.internal') || (host.endsWith('.local') && host.includes('gateway'));
    if (!isDockerInternal) return url;
  }

  // Production fallback: same origin — SSE paths are excluded from Next.js rewrites
  // so these requests go directly to nginx which streams them correctly.
  return stripTrailingSlash(window.location.origin);
}
