'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchTenantBrandingAssetDataUrl,
  fetchTenantBrandingAssetObjectUrl,
  getTenantBranding,
} from '@/lib/tenantPortalApi';
import { isTenantBrandingAssetPath, resolveTenantBrandingUrl } from '@/lib/tenantBrandingUrl';
import { getTenantDevDomain } from '@/lib/gatewayUrl';
import { writeCachedTenantBranding, readCachedTenantBranding } from '@/lib/tenantBrandingCache';
import { renderSquareFaviconDataUrl } from '@/lib/normalizeFavicon';
import type { TenantBranding, TenantBrandingAssetType } from '@/types/tenantPortal';

const DEFAULT_BRANDING: TenantBranding = {
  name: '',
  logoUrl: '',
  faviconUrl: '',
  loginPageImageUrl: '',
  primaryColor: '#111827',
  secondaryColor: '#22c55e',
  supportEmail: '',
};

const ASSET_TYPES: TenantBrandingAssetType[] = ['logo', 'favicon', 'login-page-image'];

function capitalizePortalSegment(segment: string): string {
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

/** SSR-safe: uses only NEXT_PUBLIC_TENANT_DEV_DOMAIN (same on server + client). */
function resolvePortalNameFromEnv(): string {
  const dev = getTenantDevDomain();
  if (!dev) return 'Portal';
  return capitalizePortalSegment(dev.split('.')[0] ?? 'portal');
}

/** Client-only: derives name from browser hostname (after hydration). */
function resolvePortalNameFromHost(): string {
  const dev = getTenantDevDomain();
  if (dev) return capitalizePortalSegment(dev.split('.')[0] ?? 'portal');

  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'Portal';

  return capitalizePortalSegment(host.split('.')[0] ?? 'portal');
}

interface TenantBrandingState {
  branding: TenantBranding;
  logoSrc: string;
  faviconSrc: string;
  heroSrc: string;
  accentColor: string;
  secondaryColor: string;
  portalName: string;
  tenantNotFound: boolean;
  brandingError: string | null;
  loading: boolean;
}

export const TenantBrandingContext = createContext<TenantBrandingState | null>(null);

function resolveLogoSrc(
  metadata: TenantBranding,
  assetUrls: Partial<Record<TenantBrandingAssetType, string>>
): string {
  if (metadata.logoUrl && !isTenantBrandingAssetPath(metadata.logoUrl)) {
    return resolveTenantBrandingUrl(metadata.logoUrl);
  }
  return assetUrls.logo ?? '';
}

function resolveFaviconSrc(
  metadata: TenantBranding,
  assetUrls: Partial<Record<TenantBrandingAssetType, string>>
): string {
  if (assetUrls.favicon) return assetUrls.favicon;
  if (metadata.faviconUrl && !isTenantBrandingAssetPath(metadata.faviconUrl)) {
    return resolveTenantBrandingUrl(metadata.faviconUrl);
  }
  return '';
}

export function TenantBrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  // Never read localStorage in useState initializers — that mismatches SSR hydration
  // and can crash the client after login/navigation.
  const [assetUrls, setAssetUrls] = useState<Partial<Record<TenantBrandingAssetType, string>>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [tenantNotFound, setTenantNotFound] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [portalName, setPortalName] = useState(resolvePortalNameFromEnv);
  const objectUrlsRef = useRef<string[]>([]);

  useLayoutEffect(() => {
    const cached = readCachedTenantBranding();
    if (!cached) return;
    if (cached.portalName) setPortalName(cached.portalName);
    if (cached.faviconDataUrl) {
      setAssetUrls((prev) =>
        prev.favicon ? prev : { ...prev, favicon: cached.faviconDataUrl }
      );
    }
  }, []);

  useEffect(() => {
    // Don't overwrite a cached / API portal name with hostname guess.
    setPortalName((prev) => {
      const cached = readCachedTenantBranding();
      if (cached?.portalName) return cached.portalName;
      if (prev && prev !== 'Portal') return prev;
      return resolvePortalNameFromHost();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      setTenantNotFound(false);
      setBrandingError(null);

      try {
        const { branding: metadata } = await getTenantBranding();
        if (cancelled) return;

        const merged: TenantBranding = {
          ...DEFAULT_BRANDING,
          ...metadata,
          name: metadata.name?.trim() || '',
          primaryColor: metadata.primaryColor || DEFAULT_BRANDING.primaryColor,
          secondaryColor: metadata.secondaryColor || DEFAULT_BRANDING.secondaryColor,
        };
        setBranding(merged);
        if (merged.name) {
          setPortalName(merged.name);
        }

        const cacheBust = Date.now();

        const entries = await Promise.all(
          ASSET_TYPES.map(async (assetType) => {
            const hasAsset =
              assetType === 'logo'
                ? Boolean(merged.logoUrl)
                : assetType === 'favicon'
                  ? Boolean(merged.faviconUrl)
                  : Boolean(merged.loginPageImageUrl);

            if (!hasAsset) return [assetType, null] as const;

            // Favicon must be a data URL — browsers ignore blob: for <link rel="icon">.
            // Keep the original for high-quality multi-size rendering; cache a square 64.
            if (assetType === 'favicon') {
              const raw = await fetchTenantBrandingAssetDataUrl(assetType, cacheBust);
              if (!raw) return [assetType, null] as const;
              try {
                const cache64 = await renderSquareFaviconDataUrl(raw, 64);
                writeCachedTenantBranding({ faviconDataUrl: cache64 });
              } catch {
                // ignore cache normalize failure
              }
              return [assetType, raw] as const;
            }

            const url = await fetchTenantBrandingAssetObjectUrl(assetType, cacheBust);
            return [assetType, url] as const;
          })
        );

        if (cancelled) return;

        objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        const next: Partial<Record<TenantBrandingAssetType, string>> = {};
        const nextObjectUrls: string[] = [];
        for (const [type, url] of entries) {
          if (url) {
            next[type] = url;
            // Only blob: object URLs need revoke — data URLs for favicon do not.
            if (type !== 'favicon' && url.startsWith('blob:')) {
              nextObjectUrls.push(url);
            }
          }
        }
        objectUrlsRef.current = nextObjectUrls;
        // Keep a previously cached favicon if this fetch omitted it (transient miss).
        setAssetUrls((prev) => ({
          ...next,
          favicon: next.favicon ?? prev.favicon,
        }));

        const resolvedName = merged.name?.trim() || '';
        if (resolvedName) {
          writeCachedTenantBranding({ portalName: resolvedName });
        }
      } catch (err) {
        if (cancelled) return;
        // Do not wipe a working cached favicon on API failure — login/console
        // still need accent defaults, but assets can stay.
        setAssetUrls((prev) => {
          const cached = readCachedTenantBranding();
          if (cached?.faviconDataUrl) {
            return { favicon: cached.faviconDataUrl };
          }
          return prev.favicon ? { favicon: prev.favicon } : {};
        });
        setBranding(DEFAULT_BRANDING);

        if (err instanceof ApiError) {
          const isNotFound =
            err.code === 'TENANT_NOT_FOUND' ||
            err.message === 'TENANT_NOT_FOUND' ||
            err.message.toLowerCase().includes('tenant not found');
          if (isNotFound) {
            setTenantNotFound(true);
            setBrandingError('Tenant not found');
          } else {
            setBrandingError(err.message);
          }
        } else {
          setBrandingError('Failed to load workspace branding.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load(true);

    function onFocus() {
      void load(false);
    }
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  const value = useMemo<TenantBrandingState>(
    () => ({
      branding,
      logoSrc: resolveLogoSrc(branding, assetUrls),
      faviconSrc: resolveFaviconSrc(branding, assetUrls),
      heroSrc: assetUrls['login-page-image'] ?? '',
      accentColor: branding.primaryColor || '#111827',
      secondaryColor: branding.secondaryColor || '#22c55e',
      portalName: branding.name?.trim() || portalName,
      tenantNotFound,
      brandingError,
      loading,
    }),
    [branding, assetUrls, portalName, tenantNotFound, brandingError, loading]
  );

  return (
    <TenantBrandingContext.Provider value={value}>{children}</TenantBrandingContext.Provider>
  );
}

export function useTenantBranding(): TenantBrandingState {
  const ctx = useContext(TenantBrandingContext);
  if (!ctx) {
    throw new Error('useTenantBranding must be used within TenantBrandingProvider');
  }
  return ctx;
}
