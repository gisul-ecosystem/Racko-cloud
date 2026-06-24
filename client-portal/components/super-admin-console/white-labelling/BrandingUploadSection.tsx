'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { uploadTenantBrandingAsset } from '@/lib/tenantApi';
import { resolveTenantBrandingUrl } from '@/lib/tenantBrandingUrl';
import type { BrandingAssetType, Tenant } from '@/lib/tenantTypes';

const ASSET_OPTIONS: Array<{ type: BrandingAssetType; label: string }> = [
  { type: 'logo', label: 'Logo' },
  { type: 'favicon', label: 'Favicon' },
  { type: 'login-page-image', label: 'Login page image' },
];

interface BrandingUploadSectionProps {
  tenantId: string;
  tenant: Tenant;
  onUpdated: (tenant: Tenant) => void;
  onFlash?: (msg: string) => void;
  onFlashErr?: (msg: string) => void;
}

function brandingPreviewUrl(
  tenant: Tenant,
  assetType: BrandingAssetType,
  cacheBust?: string | number
): string {
  const b = tenant.branding;
  const options = { tenantId: tenant.id, cacheBust };
  if (assetType === 'logo') return resolveTenantBrandingUrl(b.logoUrl, options);
  if (assetType === 'favicon') return resolveTenantBrandingUrl(b.faviconUrl, options);
  return resolveTenantBrandingUrl(b.loginPageImageUrl, options);
}

export function BrandingUploadSection({
  tenantId,
  tenant,
  onUpdated,
  onFlash,
  onFlashErr,
}: BrandingUploadSectionProps) {
  const fileRefs = useRef<Record<BrandingAssetType, HTMLInputElement | null>>({
    logo: null,
    favicon: null,
    'login-page-image': null,
  });
  const [uploading, setUploading] = useState<BrandingAssetType | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);

  async function handleUpload(assetType: BrandingAssetType, file: File) {
    setUploading(assetType);
    try {
      const updated = await uploadTenantBrandingAsset(tenantId, assetType, file);
      onUpdated(updated);
      setPreviewVersion((v) => v + 1);
      onFlash?.(`${ASSET_OPTIONS.find((o) => o.type === assetType)?.label} uploaded.`);
    } catch (err) {
      onFlashErr?.(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        Branding file upload
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {ASSET_OPTIONS.map(({ type, label }) => {
          const preview = brandingPreviewUrl(tenant, type, previewVersion || tenant.updatedAt);
          const busy = uploading === type;
          return (
            <div key={type} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-medium text-gray-700">{label}</p>
              <div className="mt-2 flex h-20 items-center justify-center overflow-hidden rounded-md bg-gray-50">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={label} className="max-h-full max-w-full object-contain" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-gray-300" />
                )}
              </div>
              <input
                ref={(el) => {
                  fileRefs.current[type] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(type, file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRefs.current[type]?.click()}
                className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Uploading…
                  </span>
                ) : (
                  'Upload file'
                )}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400">
        PNG, JPG, WebP, GIF, SVG, or ICO. Max 2 MB. Public URLs are served via tenant-branding API.
      </p>
    </div>
  );
}
