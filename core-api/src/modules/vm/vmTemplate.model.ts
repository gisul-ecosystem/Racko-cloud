import mongoose, { Document, Schema } from 'mongoose';

export interface IVmTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  vmid: number;
  name: string;
  node: string;
  isEnabled: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vmTemplateSchema = new Schema<IVmTemplate>(
  {
    vmid: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    node: { type: String, required: true, trim: true },
    isEnabled: { type: Boolean, default: false, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

export const VmTemplate = mongoose.model<IVmTemplate>('VmTemplate', vmTemplateSchema);
