'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { readCachedTenantBranding } from '@/lib/tenantBrandingCache';
import { buildSquareFaviconSet, type SquareFaviconSet } from '@/lib/normalizeFavicon';

const TENANT_ICON_ATTR = 'data-tenant-branding';

function removeTenantIconLinks(): void {
  document
    .querySelectorAll<HTMLLinkElement>(`link[${TENANT_ICON_ATTR}='favicon']`)
    .forEach((el) => el.remove());
}

function upsertIconLink(opts: {
  rel: string;
  href: string;
  sizes?: string;
  type?: string;
}): void {
  const link = document.createElement('link');
  link.rel = opts.rel;
  link.href = opts.href;
  if (opts.sizes) link.setAttribute('sizes', opts.sizes);
  if (opts.type) link.type = opts.type;
  link.setAttribute(TENANT_ICON_ATTR, 'favicon');
  document.head.appendChild(link);
}

/**
 * Replace default / previous icons with square variants at explicit sizes.
 * Avoids browsers stretching a non-square upload into a square tab slot.
 */
function applySquareFavicons(set: SquareFaviconSet): void {
  // Retarget any leftover root Racko icons, then remove so only sized links remain.
  document
    .querySelectorAll<HTMLLinkElement>(
      "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
    )
    .forEach((el) => el.remove());

  removeTenantIconLinks();

  upsertIconLink({
    rel: 'icon',
    href: set.icon32,
    sizes: '32x32',
    type: 'image/png',
  });
  upsertIconLink({
    rel: 'icon',
    href: set.icon48,
    sizes: '48x48',
    type: 'image/png',
  });
  upsertIconLink({
    rel: 'shortcut icon',
    href: set.icon32,
    type: 'image/png',
  });
  upsertIconLink({
    rel: 'apple-touch-icon',
    href: set.apple180,
    sizes: '180x180',
  });
}

/** Fast path for cached 64×64 square PNG (already normalized). */
function applyCachedSquareFavicon(href: string): void {
  document
    .querySelectorAll<HTMLLinkElement>(
      "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
    )
    .forEach((el) => el.remove());

  upsertIconLink({ rel: 'icon', href, sizes: '32x32', type: 'image/png' });
  upsertIconLink({ rel: 'icon', href, sizes: '48x48', type: 'image/png' });
  upsertIconLink({ rel: 'shortcut icon', href, type: 'image/png' });
  upsertIconLink({ rel: 'apple-touch-icon', href, sizes: '180x180' });
}

/**
 * Applies per-tenant favicon + document title.
 * Favicons are normalized to square (contain) at 32 / 48 / 180 so tab icons
 * keep the correct shape across sizes.
 */
export function TenantBrandingHead() {
  const { faviconSrc, portalName, loading } = useTenantBranding();
  const appliedSrcRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const cached = readCachedTenantBranding();
    if (!cached) return;

    if (cached.portalName) {
      document.title = cached.portalName;
    }
    if (cached.faviconDataUrl) {
      applyCachedSquareFavicon(cached.faviconDataUrl);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!portalName || portalName === 'Portal') return;
    document.title = portalName;
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
        applySquareFavicons(set);
        appliedSrcRef.current = faviconSrc;
      } catch {
        if (cancelled) return;
        // Fallback: still set something rather than leaving Racko.
        applyCachedSquareFavicon(faviconSrc);
        appliedSrcRef.current = faviconSrc;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [faviconSrc, loading]);

  return null;
}
