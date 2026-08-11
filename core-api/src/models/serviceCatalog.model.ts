import mongoose, { Document, Schema } from 'mongoose';

export type ServiceCatalogKind = 'product' | 'utility';
export type ServiceCatalogScope = 'admin' | 'tenant';
export type ServiceCatalogStatus = 'active' | 'deprecated' | 'hidden';

export interface IServiceCatalog extends Document {
  _id: mongoose.Types.ObjectId;
  key: string;
  label: string;
  description: string;
  kind: ServiceCatalogKind;
  scopes: ServiceCatalogScope[];
  status: ServiceCatalogStatus;
  sortOrder: number;
  defaultLimits: Record<string, unknown>;
  defaultPricing: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const serviceCatalogSchema = new Schema<IServiceCatalog>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      immutable: true,
      index: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    kind: {
      type: String,
      enum: ['product', 'utility'],
      required: true,
      index: true,
    },
    scopes: {
      type: [String],
      enum: ['admin', 'tenant'],
      default: ['admin', 'tenant'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'deprecated', 'hidden'],
      default: 'active',
      required: true,
      index: true,
    },
    sortOrder: { type: Number, default: 0, required: true },
    defaultLimits: { type: Schema.Types.Mixed, default: () => ({}) },
    defaultPricing: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  {
    timestamps: true,
    collection: 'service_catalog',
  }
);

serviceCatalogSchema.index({ kind: 1, status: 1, sortOrder: 1 });

export const ServiceCatalogModel = mongoose.model<IServiceCatalog>(
  'ServiceCatalog',
  serviceCatalogSchema
);
