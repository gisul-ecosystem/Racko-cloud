import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from '../../config';
import { Tenant } from '../../models/tenant.model';
import {
  TenantBrandingAsset,
  type ITenantBrandingAsset,
  type TenantBrandingAssetType,
} from '../../models/tenantBrandingAsset.model';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { isValidObjectId } from './tenant.service';
import { brandingAssetServeUrl } from './tenantBrandingAsset.types';

export type { TenantBrandingAssetType } from '../../models/tenantBrandingAsset.model';
export {
  BRANDING_ASSET_PARAM_VALUES,
  brandingAssetServeUrl,
  brandingAssetTypeToParam,
  resolveBrandingAssetType,
} from './tenantBrandingAsset.types';

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

const BRANDING_FIELD: Record<TenantBrandingAssetType, 'logoUrl' | 'faviconUrl' | 'loginPageImageUrl'> = {
  logo: 'logoUrl',
  favicon: 'faviconUrl',
  login_page_image: 'loginPageImageUrl',
};

export function extensionForMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType.toLowerCase()] ?? '.bin';
}

function tenantVolumeDir(tenantId: string): string {
  return path.join(config.TENANT_ASSETS_VOLUME_PATH, tenantId);
}

function volumeFilePath(tenantId: string, assetType: TenantBrandingAssetType, ext: string): string {
  return path.join(tenantVolumeDir(tenantId), `${assetType}${ext}`);
}

async function writeToVolume(
  tenantId: string,
  assetType: TenantBrandingAssetType,
  buffer: Buffer,
  ext: string
): Promise<void> {
  const dir = tenantVolumeDir(tenantId);
  await fs.mkdir(dir, { recursive: true });

  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(`${assetType}.`))
      .map((entry) => fs.unlink(path.join(dir, entry)).catch(() => undefined))
  );

  await fs.writeFile(volumeFilePath(tenantId, assetType, ext), buffer);
}

async function readFromVolumeIfExists(
  tenantId: string,
  assetType: TenantBrandingAssetType,
  ext: string
): Promise<{ buffer: Buffer; mtimeMs: number } | null> {
  const filePath = volumeFilePath(tenantId, assetType, ext);
  try {
    const [buffer, stat] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)]);
    return { buffer, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

async function updateTenantBrandingUrl(
  tenantId: string,
  assetType: TenantBrandingAssetType
): Promise<void> {
  const field = BRANDING_FIELD[assetType];
  const url = brandingAssetServeUrl(assetType);
  await Tenant.findByIdAndUpdate(tenantId, { $set: { [`branding.${field}`]: url } });
}

export interface TenantBrandingAssetPayload {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export interface TenantBrandingPublic {
  logoUrl: string;
  faviconUrl: string;
  loginPageImageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  supportEmail: string;
}

export class TenantBrandingAssetService {
  /**
   * Read asset bytes: volume cache first; on miss, hydrate from MongoDB into volume.
   */
  async getAssetBytes(
    tenantId: string,
    assetType: TenantBrandingAssetType
  ): Promise<TenantBrandingAssetPayload | null> {
    if (!isValidObjectId(tenantId)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    const doc = await TenantBrandingAsset.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      assetType,
    }).lean();

    if (!doc) {
      return null;
    }

    const ext = extensionForMime(doc.mimeType);
    const docUpdatedMs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0;
    const cached = await readFromVolumeIfExists(tenantId, assetType, ext);

    if (cached && (!docUpdatedMs || cached.mtimeMs >= docUpdatedMs)) {
      return { buffer: cached.buffer, mimeType: doc.mimeType, filename: doc.filename };
    }

    await writeToVolume(tenantId, assetType, doc.data, ext);
    return { buffer: doc.data, mimeType: doc.mimeType, filename: doc.filename };
  }

  async uploadAsset(
    tenantId: string,
    assetType: TenantBrandingAssetType,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number }
  ): Promise<ITenantBrandingAsset> {
    if (!isValidObjectId(tenantId)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    if (!file.buffer?.length) {
      throw new ValidationError('Uploaded file is empty.');
    }

    const ext = extensionForMime(file.mimetype);
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const doc = await TenantBrandingAsset.findOneAndUpdate(
      { tenantId: tenantObjectId, assetType },
      {
        tenantId: tenantObjectId,
        assetType,
        data: file.buffer,
        mimeType: file.mimetype,
        filename: file.originalname || `${assetType}${ext}`,
        byteSize: file.size,
      },
      { upsert: true, new: true }
    );

    await writeToVolume(tenantId, assetType, file.buffer, ext);
    await updateTenantBrandingUrl(tenantId, assetType);

    return doc;
  }

  async getPublicBranding(tenantId: string): Promise<TenantBrandingPublic> {
    if (!isValidObjectId(tenantId)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    const tenant = await Tenant.findById(tenantId).select('branding').lean();
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    const branding = tenant.branding ?? {};
    return {
      logoUrl: branding.logoUrl ?? '',
      faviconUrl: branding.faviconUrl ?? '',
      loginPageImageUrl: branding.loginPageImageUrl ?? '',
      primaryColor: branding.primaryColor ?? '',
      secondaryColor: branding.secondaryColor ?? '',
      supportEmail: branding.supportEmail ?? '',
    };
  }
}

export const tenantBrandingAssetService = new TenantBrandingAssetService();
