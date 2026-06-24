'use client';

import { useEffect } from 'react';
import { useTenantBranding } from '@/context/TenantBrandingContext';

/** Applies per-tenant favicon from GET /api/v1/tenant-branding/asset?assetType=favicon */
export function TenantBrandingHead() {
  const { faviconSrc, loading } = useTenantBranding();

  useEffect(() => {
    if (loading) return;

    const existing = document.querySelector<HTMLLinkElement>("link[rel='icon'][data-tenant-branding]");

    if (!faviconSrc) {
      existing?.remove();
      return;
    }

    const link = existing ?? document.createElement('link');
    link.rel = 'icon';
    link.href = faviconSrc;
    link.setAttribute('data-tenant-branding', 'true');

    if (!link.parentNode) {
      document.head.appendChild(link);
    }

    return () => {
      if (link.parentNode && link.getAttribute('data-tenant-branding')) {
        link.remove();
      }
    };
  }, [faviconSrc, loading]);

  return null;
}
