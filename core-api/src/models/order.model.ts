import mongoose, { Document, Schema } from 'mongoose';

export type OrderStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'fulfilled';

export interface IOrderSpecs {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
}

export interface IOrder extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  templateId: number;
  templateName: string;
  count: number;
  specs: IOrderSpecs;
  calculatedAmount: number;
  status: OrderStatus;
  createdBy: mongoose.Types.ObjectId;
  approvedBy: mongoose.Types.ObjectId | null;
  rejectedBy: mongoose.Types.ObjectId | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderSpecsSchema = new Schema<IOrderSpecs>(
  {
    cpuCores: { type: Number, required: true },
    memoryGb: { type: Number, required: true },
    diskGb: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    templateId: {
      type: Number,
      required: true,
    },
    templateName: {
      type: String,
      required: true,
      trim: true,
    },
    count: {
      type: Number,
      required: true,
      min: 1,
    },
    specs: {
      type: orderSpecsSchema,
      required: true,
    },
    calculatedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending_payment', 'pending_approval', 'approved', 'rejected', 'fulfilled'],
      default: 'pending_payment',
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'TenantUser',
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

orderSchema.index({ tenantId: 1, createdAt: -1 });

export const Order = mongoose.model<IOrder>('Order', orderSchema);
