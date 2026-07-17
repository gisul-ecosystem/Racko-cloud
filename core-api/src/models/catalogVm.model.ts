import mongoose, { Document, Schema } from 'mongoose';

export type VmCatalogProvider = 'webyne' | 'aws' | 'azure' | 'gcp' | 'oci';
export type VmCatalogCategory = 'linux' | 'windows' | 'gpu';
export type VmCatalogProtocol = 'rdp' | 'ssh';

export type VmCatalogStatus =
  | 'pending_approval'
  | 'approved'
  | 'provisioning'
  | 'fulfilling'
  | 'ready_to_attach'
  | 'active'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'suspended'
  | 'terminated';

export interface VmCatalogSpecs {
  cpu?: string;
  ram?: string;
  disk?: string;
}

export interface VmCatalogTemplate {
  value: string;
  label: string;
}

export interface VmCatalogPricingSnapshot {
  currency: string;
  subtotal?: number;
  tax?: number;
  total: number;
  billingLabel?: string;
}

export interface ICatalogVm extends Document {
  _id: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId;
  provider: VmCatalogProvider;
  category: VmCatalogCategory;
  planId: string;
  planName: string;
  specs: VmCatalogSpecs;
  billing: string;
  quantity: number;
  template: VmCatalogTemplate;
  pricingSnapshot: VmCatalogPricingSnapshot;
  status: VmCatalogStatus;
  chargedAmount?: number;
  walletDebited: boolean;
  hostname?: string;
  ipAddress?: string;
  username?: string;
  /** AES-256-CBC encrypted (same helper as External VM). */
  password?: string;
  protocol?: VmCatalogProtocol;
  externalRef?: string;
  fulfillError?: string;
  providerPurchased: boolean;
  /** Provider-native region (e.g. ap-south-1). Super-admin only in API responses. */
  region?: string;
  /** Real cloud instance id. Super-admin only in API responses. */
  providerInstanceId?: string;
  /** Auto-teardown deadline for short-duration auto-provisioned VMs. */
  expiresAt?: Date;
  /** true = AWS/Azure auto path; false = manual Webyne fulfillment. */
  autoProvisioned: boolean;
  /** Internal margin tracking. Super-admin only in API responses. */
  rawProviderCostPerHr?: number;
  attachedAt?: Date;
  rejectionReason?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const specsSchema = new Schema(
  {
    cpu: { type: String, trim: true },
    ram: { type: String, trim: true },
    disk: { type: String, trim: true },
  },
  { _id: false }
);

const templateSchema = new Schema(
  {
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const pricingSnapshotSchema = new Schema(
  {
    currency: { type: String, required: true, default: 'INR', trim: true },
    subtotal: { type: Number },
    tax: { type: Number },
    total: { type: Number, required: true },
    billingLabel: { type: String, trim: true },
  },
  { _id: false }
);

const catalogVmSchema = new Schema<ICatalogVm>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['webyne', 'aws', 'azure', 'gcp', 'oci'],
      required: true,
      default: 'webyne',
    },
    category: {
      type: String,
      enum: ['linux', 'windows', 'gpu'],
      required: true,
    },
    planId: {
      type: String,
      required: true,
      trim: true,
    },
    planName: {
      type: String,
      required: true,
      trim: true,
    },
    specs: {
      type: specsSchema,
      default: {},
    },
    billing: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    template: {
      type: templateSchema,
      required: true,
    },
    pricingSnapshot: {
      type: pricingSnapshotSchema,
      required: true,
    },
    status: {
      type: String,
      enum: [
        'pending_approval',
        'approved',
        'provisioning',
        'fulfilling',
        'ready_to_attach',
        'active',
        'failed',
        'rejected',
        'cancelled',
        'suspended',
        'terminated',
      ],
      required: true,
      default: 'pending_approval',
      index: true,
    },
    chargedAmount: { type: Number, min: 0 },
    walletDebited: { type: Boolean, default: false },
    hostname: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    username: { type: String, trim: true },
    password: { type: String },
    protocol: { type: String, enum: ['rdp', 'ssh'] },
    externalRef: { type: String, trim: true },
    fulfillError: { type: String, trim: true },
    providerPurchased: { type: Boolean, default: false },
    region: { type: String, trim: true },
    providerInstanceId: { type: String, trim: true },
    expiresAt: { type: Date, index: true },
    autoProvisioned: { type: Boolean, default: false, index: true },
    rawProviderCostPerHr: { type: Number, min: 0 },
    attachedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    strict: true,
    timestamps: false,
    collection: 'catalog_vms',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

catalogVmSchema.index({ adminId: 1, createdAt: -1 });
catalogVmSchema.index({ adminId: 1, status: 1 });
catalogVmSchema.index({ autoProvisioned: 1, status: 1, expiresAt: 1 });

catalogVmSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const CatalogVmModel = mongoose.model<ICatalogVm>('CatalogVm', catalogVmSchema);
