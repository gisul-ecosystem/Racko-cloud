import type { TenantBrandingAssetType } from '../../models/tenantBrandingAsset.model';

export const BRANDING_ASSET_PARAM_VALUES = ['logo', 'favicon', 'login-page-image'] as const;
export type BrandingAssetParam = (typeof BRANDING_ASSET_PARAM_VALUES)[number];

const PARAM_TO_TYPE: Record<BrandingAssetParam, TenantBrandingAssetType> = {
  logo: 'logo',
  favicon: 'favicon',
  'login-page-image': 'login_page_image',
};

export function resolveBrandingAssetType(input: unknown): TenantBrandingAssetType | null {
  if (typeof input !== 'string' || !input.trim()) {
    return null;
  }
  return PARAM_TO_TYPE[input.trim() as BrandingAssetParam] ?? null;
}

export function brandingAssetTypeToParam(type: TenantBrandingAssetType): BrandingAssetParam {
  if (type === 'login_page_image') {
    return 'login-page-image';
  }
  return type;
}

export function brandingAssetServeUrl(type: TenantBrandingAssetType): string {
  return `/api/v1/tenant-branding/asset?assetType=${brandingAssetTypeToParam(type)}`;
}
