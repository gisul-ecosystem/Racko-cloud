const DEFAULT_GATEWAY = 'http://localhost:8000';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function getGatewayPort(): string {
  const envBase = process.env['NEXT_PUBLIC_GATEWAY_URL'] ?? DEFAULT_GATEWAY;
  try {
    const parsed = new URL(envBase);
    if (parsed.port) return parsed.port;
    return parsed.protocol === 'https:' ? '443' : '80';
  } catch {
    return '8000';
  }
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
 * Resolve gateway base URL from a hostname (server-side or tests).
 * Custom hostnames use the same host with the gateway port from env.
 */
export function getGatewayBaseUrlFromHost(hostname: string, protocol = 'http:'): string {
  const envBase = process.env['NEXT_PUBLIC_GATEWAY_URL'] ?? DEFAULT_GATEWAY;
  if (isLocalDevHost(hostname)) return envBase;

  const port = getGatewayPort();
  return `${protocol}//${normalizeHost(hostname)}:${port}`;
}

/**
 * Browser gateway URL:
 * - localhost → NEXT_PUBLIC_GATEWAY_URL
 * - custom host + env points to a public URL (e.g. https://labs.gisul.co.in) → use env as-is
 * - custom host + env is localhost (hosts-file dev) → same browser host, gateway port from env
 */
export function getGatewayBaseUrl(): string {
  const envBase = stripTrailingSlash(process.env['NEXT_PUBLIC_GATEWAY_URL'] ?? DEFAULT_GATEWAY);
  if (typeof window === 'undefined') return envBase;

  const browserHost = normalizeHost(window.location.hostname);
  if (isLocalDevHost(browserHost)) return envBase;

  try {
    const envHost = normalizeHost(new URL(envBase).hostname);
    // Production / explicit gateway hostname — do not append :8000
    if (!isLocalDevHost(envHost)) {
      return envBase;
    }
  } catch {
    // fall through to hosts-file derivation
  }

  return stripTrailingSlash(
    getGatewayBaseUrlFromHost(browserHost, window.location.protocol)
  );
}
