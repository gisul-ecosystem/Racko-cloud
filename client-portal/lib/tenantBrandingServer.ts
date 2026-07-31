import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getTenantDevDomain, isLocalDevHost } from '@/lib/gatewayUrl';

interface PublicBranding {
  name?: string;
  faviconUrl?: string;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function gatewayBaseUrl(): string {
  return stripTrailingSlash(
    process.env['GATEWAY_INTERNAL_URL'] ??
      process.env['NEXT_PUBLIC_GATEWAY_URL'] ??
      'http://localhost:8000'
  );
}

function normalizeHost(raw: string): string {
  return raw.split(',')[0]?.trim().replace(/:\d+$/, '').toLowerCase() ?? '';
}

/** Public hostname for the current tenant request (SSR). */
export async function resolveTenantRequestHost(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  let host = normalizeHost(forwarded);

  if (isLocalDevHost(host)) {
    const dev = getTenantDevDomain();
    if (dev) host = normalizeHost(dev);
  }

  return host;
}

/**
 * Fetch public branding for SSR metadata so title/favicon are correct on first paint
 * (avoids flashing root-layout "Racko" defaults on tenant workspace routes).
 */
export async function fetchTenantBrandingForMetadata(): Promise<{
  title: string;
  faviconHref: string | null;
}> {
  const host = await resolveTenantRequestHost();
  const fallbackTitle =
    host && !isLocalDevHost(host)
      ? host.split('.')[0]!.charAt(0).toUpperCase() + host.split('.')[0]!.slice(1)
      : 'Portal';

  if (!host) {
    return { title: fallbackTitle, faviconHref: null };
  }

  try {
    const res = await fetch(`${gatewayBaseUrl()}/api/v1/tenant-branding`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // Gateway resolveHost prefers x-forwarded-host; X-Tenant-Domain covers local gateway.
        'X-Forwarded-Host': host,
        'X-Tenant-Domain': host,
      },
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return { title: fallbackTitle, faviconHref: null };
    }

    const json = (await res.json()) as {
      data?: { branding?: PublicBranding };
      branding?: PublicBranding;
    };
    const branding = json.data?.branding ?? json.branding;
    const name = branding?.name?.trim() || fallbackTitle;

    let faviconHref: string | null = null;
    if (branding?.faviconUrl) {
      // Same-origin asset path works in the browser tab after rewrite; for <link>
      // in metadata prefer absolute URL built from the public host.
      const proto = (await headers()).get('x-forwarded-proto') ?? 'https';
      const publicOrigin =
        isLocalDevHost(host) || host.includes('localhost')
          ? `http://${(await headers()).get('host') ?? 'localhost:3000'}`
          : `${proto}://${host}`;

      if (branding.faviconUrl.startsWith('http')) {
        faviconHref = branding.faviconUrl;
      } else if (branding.faviconUrl.includes('/tenant-branding/asset')) {
        faviconHref = `${publicOrigin}/api/v1/tenant-branding/asset?assetType=favicon`;
      } else if (branding.faviconUrl.startsWith('/')) {
        faviconHref = `${publicOrigin}${branding.faviconUrl}`;
      } else {
        faviconHref = branding.faviconUrl;
      }
    }

    return { title: name, faviconHref };
  } catch {
    return { title: fallbackTitle, faviconHref: null };
  }
}

/** Transparent 1×1 PNG — overrides root Racko icon when tenant has no favicon yet. */
const TRANSPARENT_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export async function buildTenantMetadata(): Promise<Metadata> {
  const { title, faviconHref } = await fetchTenantBrandingForMetadata();
  const icon = faviconHref || TRANSPARENT_ICON;

  return {
    title: {
      default: title,
      template: `%s · ${title}`,
    },
    icons: {
      // Prefer explicit square slots; browser still may letterbox non-square
      // remote assets until client normalization runs.
      icon: [
        { url: icon, sizes: '32x32', type: 'image/png' },
        { url: icon, sizes: '48x48', type: 'image/png' },
      ],
      shortcut: [{ url: icon }],
      apple: [{ url: icon, sizes: '180x180' }],
    },
  };
}
