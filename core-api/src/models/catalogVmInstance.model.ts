import mongoose, { Document, Schema } from 'mongoose';

export type CatalogVmInstanceStatus = 'ready_to_attach' | 'active';

export interface ICatalogVmInstance extends Document {
  _id: mongoose.Types.ObjectId;
  catalogVmId: mongoose.Types.ObjectId;
  adminId?: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  instanceOrder: number;
  externalRef?: string;
  hostname?: string;
  ipAddress?: string;
  username?: string;
  /** AES-256-CBC encrypted like catalog_vms.password */
  password?: string;
  protocol?: 'rdp' | 'ssh';
  rawLabel?: string;
  status: CatalogVmInstanceStatus;
  attachedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const catalogVmInstanceSchema = new Schema<ICatalogVmInstance>(
  {
    catalogVmId: {
      type: Schema.Types.ObjectId,
      ref: 'CatalogVm',
      required: true,
      index: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    instanceOrder: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    externalRef: { type: String, trim: true },
    hostname: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    username: { type: String, trim: true },
    password: { type: String },
    protocol: { type: String, enum: ['rdp', 'ssh'] },
    rawLabel: { type: String, trim: true },
    status: {
      type: String,
      enum: ['ready_to_attach', 'active'],
      default: 'ready_to_attach',
      index: true,
    },
    attachedAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    strict: true,
    timestamps: false,
    collection: 'catalog_vm_instances',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

catalogVmInstanceSchema.index({ catalogVmId: 1, instanceOrder: 1 }, { unique: true });
catalogVmInstanceSchema.index(
  { catalogVmId: 1, externalRef: 1 },
  { unique: true, partialFilterExpression: { externalRef: { $exists: true } } }
);
catalogVmInstanceSchema.index({ adminId: 1, createdAt: -1 });
catalogVmInstanceSchema.index({ tenantId: 1, createdAt: -1 });

catalogVmInstanceSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const CatalogVmInstanceModel = mongoose.model<ICatalogVmInstance>(
  'CatalogVmInstance',
  catalogVmInstanceSchema
);
