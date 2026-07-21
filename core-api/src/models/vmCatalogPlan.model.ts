import mongoose, { Document, Schema } from 'mongoose';

export interface IVmCatalogPlan extends Document {
  _id: mongoose.Types.ObjectId;
  /** Display / provider reference number from sheet (may duplicate). */
  sno?: number;
  name: string;
  vcpu: number;
  ramGb: number;
  ssdGb: number;
  hourly?: number | null;
  monthly?: number | null;
  quarterly?: number | null;
  yearly?: number | null;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vmCatalogPlanSchema = new Schema<IVmCatalogPlan>(
  {
    sno: { type: Number },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    vcpu: { type: Number, required: true, min: 1 },
    ramGb: { type: Number, required: true, min: 1 },
    ssdGb: { type: Number, required: true, min: 1 },
    hourly: { type: Number, min: 0, default: null },
    monthly: { type: Number, min: 0, default: null },
    quarterly: { type: Number, min: 0, default: null },
    yearly: { type: Number, min: 0, default: null },
    currency: { type: String, default: 'INR', trim: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'vm_catalog_plans' }
);

vmCatalogPlanSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });
vmCatalogPlanSchema.index({ name: 1 });

export const VmCatalogPlan = mongoose.model<IVmCatalogPlan>(
  'VmCatalogPlan',
  vmCatalogPlanSchema
);
