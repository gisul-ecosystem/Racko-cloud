'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { readCachedTenantBranding } from '@/lib/tenantBrandingCache';
import { buildSquareFaviconSet } from '@/lib/normalizeFavicon';

const TENANT_FLAG = 'data-tenant-branding';

/**
 * Only create/update links WE own. Never mutate or remove Next.js metadata
 * <link> nodes — that causes client-side "Application error" crashes.
 */
function upsertOwnedIcon(opts: {
  key: string;
  rel: string;
  href: string;
  sizes?: string;
  type?: string;
}): void {
  try {
    const selector = `link[${TENANT_FLAG}="${opts.key}"]`;
    let el = document.head.querySelector<HTMLLinkElement>(selector);
    if (!el) {
      el = document.createElement('link');
      el.setAttribute(TENANT_FLAG, opts.key);
      el.rel = opts.rel;
      document.head.appendChild(el);
    }
    el.rel = opts.rel;
    el.href = opts.href;
    if (opts.sizes) el.setAttribute('sizes', opts.sizes);
    else el.removeAttribute('sizes');
    if (opts.type) el.type = opts.type;
  } catch {
    // Never let favicon DOM work take down the app.
  }
}

function applyOwnedFavicons(href32: string, href48?: string, appleHref?: string): void {
  upsertOwnedIcon({
    key: 'icon-32',
    rel: 'icon',
    href: href32,
    sizes: '32x32',
    type: 'image/png',
  });
  upsertOwnedIcon({
    key: 'icon-48',
    rel: 'icon',
    href: href48 || href32,
    sizes: '48x48',
    type: 'image/png',
  });
  upsertOwnedIcon({
    key: 'shortcut',
    rel: 'shortcut icon',
    href: href32,
    type: 'image/png',
  });
  upsertOwnedIcon({
    key: 'apple',
    rel: 'apple-touch-icon',
    href: appleHref || href32,
    sizes: '180x180',
  });
}

/**
 * Applies per-tenant favicon + document title after mount.
 * SSR generateMetadata already sets first paint; this only overlays owned links.
 */
export function TenantBrandingHead() {
  const { faviconSrc, portalName, loading } = useTenantBranding();
  const appliedSrcRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    try {
      const cached = readCachedTenantBranding();
      if (!cached) return;

      if (cached.portalName) {
        document.title = cached.portalName;
      }
      if (cached.faviconDataUrl) {
        applyOwnedFavicons(cached.faviconDataUrl);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!portalName || portalName === 'Portal') return;
    try {
      document.title = portalName;
    } catch {
      // ignore
    }
  }, [portalName, loading]);

  useEffect(() => {
    if (loading) return;
    if (!faviconSrc) return;
    if (appliedSrcRef.current === faviconSrc) return;

    let cancelled = false;
    void (async () => {
      try {
        const set = await buildSquareFaviconSet(faviconSrc);
        if (cancelled) return;
        applyOwnedFavicons(set.icon32, set.icon48, set.apple180);
        appliedSrcRef.current = faviconSrc;
      } catch {
        if (cancelled) return;
        applyOwnedFavicons(faviconSrc);
        appliedSrcRef.current = faviconSrc;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [faviconSrc, loading]);

  return null;
}
