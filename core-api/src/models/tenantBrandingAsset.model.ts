import mongoose, { Document, Schema } from 'mongoose';

export type TenantBrandingAssetType = 'logo' | 'favicon' | 'login_page_image';

export interface ITenantBrandingAsset extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  assetType: TenantBrandingAssetType;
  data: Buffer;
  mimeType: string;
  filename: string;
  byteSize: number;
  updatedAt: Date;
  createdAt: Date;
}

const tenantBrandingAssetSchema = new Schema<ITenantBrandingAsset>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    assetType: {
      type: String,
      enum: ['logo', 'favicon', 'login_page_image'],
      required: true,
    },
    data: {
      type: Buffer,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    byteSize: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { timestamps: true }
);

tenantBrandingAssetSchema.index({ tenantId: 1, assetType: 1 }, { unique: true });

export const TenantBrandingAsset = mongoose.model<ITenantBrandingAsset>(
  'TenantBrandingAsset',
  tenantBrandingAssetSchema
);
