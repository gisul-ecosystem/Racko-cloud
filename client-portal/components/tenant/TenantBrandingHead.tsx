'use client';

import { useEffect } from 'react';
import { useTenantBranding } from '@/context/TenantBrandingContext';

const ICON_SELECTOR =
  "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']";

/** Applies per-tenant favicon, replacing root-layout Racko icons while on tenant routes. */
export function TenantBrandingHead() {
  const { faviconSrc, loading } = useTenantBranding();

  useEffect(() => {
    if (loading) return;

    if (!faviconSrc) {
      document
        .querySelectorAll<HTMLLinkElement>("link[data-tenant-branding='favicon']")
        .forEach((el) => el.remove());
      return;
    }

    const existing = Array.from(document.querySelectorAll<HTMLLinkElement>(ICON_SELECTOR));
    const snapshots = existing.map((el) => ({
      el,
      href: el.getAttribute('href'),
      rel: el.getAttribute('rel'),
      type: el.getAttribute('type'),
      hadTenantFlag: el.getAttribute('data-tenant-branding') === 'favicon',
    }));

    // Retarget every default icon link so the browser cannot keep Racko's favicon.
    for (const el of existing) {
      el.setAttribute('href', faviconSrc);
      el.setAttribute('data-tenant-branding', 'favicon');
      if (!el.rel || el.rel === 'shortcut icon') {
        el.rel = 'icon';
      }
    }

    // Guarantee at least one icon link if Next.js metadata hadn't injected any yet.
    let created: HTMLLinkElement | null = null;
    if (existing.length === 0) {
      created = document.createElement('link');
      created.rel = 'icon';
      created.href = faviconSrc;
      created.setAttribute('data-tenant-branding', 'favicon');
      document.head.appendChild(created);
    }

    return () => {
      for (const snap of snapshots) {
        if (!snap.el.parentNode) continue;
        if (snap.hadTenantFlag) {
          snap.el.remove();
          continue;
        }
        if (snap.href != null) snap.el.setAttribute('href', snap.href);
        else snap.el.removeAttribute('href');
        if (snap.rel != null) snap.el.setAttribute('rel', snap.rel);
        if (snap.type != null) snap.el.setAttribute('type', snap.type);
        else snap.el.removeAttribute('type');
        snap.el.removeAttribute('data-tenant-branding');
      }
      created?.remove();
    };
  }, [faviconSrc, loading]);

  return null;
}
