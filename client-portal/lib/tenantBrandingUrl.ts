import { getGatewayBaseUrl } from './gatewayUrl';
import type { TenantBrandingAssetType } from '../types/tenantPortal';

export interface TenantBrandingAssetUrlOptions {
  /** Required for super-admin previews on localhost (no host-based tenant resolve). */
  tenantId?: string;
  /** Bust browser HTTP cache after uploads. */
  cacheBust?: string | number;
}

/** Full gateway URL for GET /api/v1/tenant-branding/asset?assetType=… */
export function getTenantBrandingAssetUrl(
  assetType: TenantBrandingAssetType,
  options: TenantBrandingAssetUrlOptions = {}
): string {
  const base = getGatewayBaseUrl();
  const params = new URLSearchParams({ assetType });
  if (options.tenantId) params.set('tenantId', options.tenantId);
  if (options.cacheBust !== undefined) params.set('v', String(options.cacheBust));
  return `${base}/api/v1/tenant-branding/asset?${params.toString()}`;
}

/** True when branding metadata points at the gateway asset serve path (not an external CDN URL). */
export function isTenantBrandingAssetPath(url: string | undefined): boolean {
  return Boolean(url?.includes('/tenant-branding/asset?'));
}

/** Resolve branding metadata URL — external URLs pass through; asset paths become gateway asset URLs. */
export function resolveTenantBrandingUrl(
  relativeUrl: string | undefined,
  options: TenantBrandingAssetUrlOptions = {}
): string {
  if (!relativeUrl) return '';
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  if (isTenantBrandingAssetPath(relativeUrl)) {
    const match = relativeUrl.match(/assetType=([\w-]+)/);
    const assetType = match?.[1] as TenantBrandingAssetType | undefined;
    if (assetType) return getTenantBrandingAssetUrl(assetType, options);
  }
  const base = getGatewayBaseUrl();
  return `${base}${relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`}`;
}
