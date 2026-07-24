/**
 * Client-side cache of tenant title + favicon so reloads / hydration don't
 * flash the root-layout Racko defaults while branding API is in flight.
 */

export interface CachedTenantBranding {
  portalName: string;
  faviconDataUrl: string;
  updatedAt: number;
}

const CACHE_PREFIX = 'racko_tenant_branding_v1:';

function cacheKey(hostname: string): string {
  return `${CACHE_PREFIX}${hostname.toLowerCase().trim()}`;
}

export function readCachedTenantBranding(hostname?: string): CachedTenantBranding | null {
  if (typeof window === 'undefined') return null;
  const host = (hostname ?? window.location.hostname).toLowerCase().trim();
  if (!host) return null;

  try {
    const raw = localStorage.getItem(cacheKey(host));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTenantBranding;
    if (!parsed?.portalName && !parsed?.faviconDataUrl) return null;
    return {
      portalName: typeof parsed.portalName === 'string' ? parsed.portalName : '',
      faviconDataUrl: typeof parsed.faviconDataUrl === 'string' ? parsed.faviconDataUrl : '',
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeCachedTenantBranding(
  cache: { portalName?: string; faviconDataUrl?: string },
  hostname?: string
): void {
  if (typeof window === 'undefined') return;
  const host = (hostname ?? window.location.hostname).toLowerCase().trim();
  if (!host) return;

  const prev = readCachedTenantBranding(host);
  const next: CachedTenantBranding = {
    portalName: (cache.portalName ?? prev?.portalName ?? '').trim(),
    faviconDataUrl: cache.faviconDataUrl ?? prev?.faviconDataUrl ?? '',
    updatedAt: Date.now(),
  };

  if (!next.portalName && !next.faviconDataUrl) return;

  try {
    localStorage.setItem(cacheKey(host), JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore; SSR metadata still covers first paint.
  }
}
