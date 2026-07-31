import mongoose, { Document, Schema } from 'mongoose';

export type IpAddressStatus = 'available' | 'reserved' | 'assigned';
export type IpPoolType = 'public' | 'private';

export interface IIpAddress extends Document {
  _id: mongoose.Types.ObjectId;
  ip: string;
  gateway: string;
  status: IpAddressStatus;
  /** public: internet-routable pool (bridge vmbr0). private: internal-only pool on custnet1. */
  poolType: IpPoolType;
  vmId?: string;
  reservedAt?: Date;
  assignedAt?: Date;
}

const ipAddressSchema = new Schema<IIpAddress>(
  {
    ip: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    gateway: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['available', 'reserved', 'assigned'],
      default: 'available',
      required: true,
      index: true,
    },
    poolType: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
      required: true,
      index: true,
    },
    vmId: {
      type: String,
      default: null,
      index: true,
    },
    reservedAt: {
      type: Date,
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
  },
  {
    strict: true,
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// Supports allocateIP()'s atomic findOneAndUpdate, which filters by status +
// poolType and sorts by ip — keeps allocation fast as each pool grows.
ipAddressSchema.index({ status: 1, poolType: 1, ip: 1 });

export const IpAddress = mongoose.model<IIpAddress>('IpAddress', ipAddressSchema);
