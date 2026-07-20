import mongoose, { Document, Schema } from 'mongoose';

export type DedicatedServerStatus =
  | 'provisioning'
  | 'active'
  | 'rejected'
  | 'cancelled'
  | 'suspended';

export type DedicatedServerProtocol = 'rdp' | 'ssh';

export interface IDedicatedServerRequest extends Document {
  _id: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  planName: string;
  specs: {
    cpu: string;
    ram: string;
    disk: string;
    location?: string;
  };
  monthlyPrice: number;
  currency: string;
  notes?: string;
  status: DedicatedServerStatus;
  chargedAmount?: number;
  walletDebited: boolean;
  hostname?: string;
  ipAddress?: string;
  username?: string;
  password?: string;
  protocol?: DedicatedServerProtocol;
  rejectionReason?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  attachedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const dedicatedServerRequestSchema = new Schema<IDedicatedServerRequest>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'DedicatedServerPlan', required: true },
    planName: { type: String, required: true, trim: true },
    specs: {
      cpu: { type: String, required: true },
      ram: { type: String, required: true },
      disk: { type: String, required: true },
      location: { type: String },
    },
    monthlyPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    notes: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['provisioning', 'active', 'rejected', 'cancelled', 'suspended'],
      default: 'provisioning',
      index: true,
    },
    chargedAmount: { type: Number },
    walletDebited: { type: Boolean, default: false },
    hostname: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    username: { type: String, trim: true },
    password: { type: String },
    protocol: { type: String, enum: ['rdp', 'ssh'] },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    attachedAt: { type: Date },
  },
  { timestamps: true, collection: 'dedicated_server_requests' }
);

dedicatedServerRequestSchema.index({ adminId: 1, createdAt: -1 });
dedicatedServerRequestSchema.index({ adminId: 1, status: 1 });
dedicatedServerRequestSchema.index({ status: 1, createdAt: -1 });

export const DedicatedServerRequestModel = mongoose.model<IDedicatedServerRequest>(
  'DedicatedServerRequest',
  dedicatedServerRequestSchema
);
