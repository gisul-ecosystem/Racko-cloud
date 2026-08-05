import mongoose, { Document, Schema } from 'mongoose';

export interface IVmHostLease extends Document {
  _id: mongoose.Types.ObjectId;
  provider: string;
  ipAddress: string;
  description: string;
  invoiceDate: Date;
  dueDate: Date;
  assignedTo: string;
  vmUsername: string;
  vmPassword: string;
  /** Due-date this lease was last warned for (prevents duplicate reminder emails). */
  expiryWarningFor: Date | null;
  uploadedBy: mongoose.Types.ObjectId;
  sourceFileName: string | null;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vmHostLeaseSchema = new Schema<IVmHostLease>(
  {
    provider: { type: String, required: false, default: 'N/A', trim: true, index: true },
    ipAddress: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: false, default: 'N/A', trim: true },
    invoiceDate: { type: Date, required: false, default: () => new Date(), index: true },
    dueDate: { type: Date, required: true, index: true },
    assignedTo: { type: String, required: false, default: 'N/A', trim: true, index: true },
    vmUsername: { type: String, required: false, default: 'N/A', trim: true },
    vmPassword: { type: String, required: true },
    expiryWarningFor: { type: Date, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceFileName: { type: String, default: null, trim: true },
    deleted: { type: Boolean, default: false, index: true },
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

vmHostLeaseSchema.index({ deleted: 1, dueDate: 1 });
vmHostLeaseSchema.index({ ipAddress: 1, deleted: 1 });
vmHostLeaseSchema.index({ provider: 1, deleted: 1 });
vmHostLeaseSchema.index({ assignedTo: 1, deleted: 1 });
vmHostLeaseSchema.index({ ipAddress: 'text', provider: 'text', assignedTo: 'text' });

export const VmHostLeaseModel = mongoose.model<IVmHostLease>('VmHostLease', vmHostLeaseSchema);
