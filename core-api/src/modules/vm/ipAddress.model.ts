import mongoose, { Document, Schema } from 'mongoose';

export type IpAddressStatus = 'available' | 'reserved' | 'assigned';

export interface IIpAddress extends Document {
  _id: mongoose.Types.ObjectId;
  ip: string;
  gateway: string;
  status: IpAddressStatus;
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

export const IpAddress = mongoose.model<IIpAddress>('IpAddress', ipAddressSchema);
