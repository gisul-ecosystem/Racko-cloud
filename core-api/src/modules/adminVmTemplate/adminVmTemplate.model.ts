import mongoose, { Document, Schema } from 'mongoose';

export type AdminVmTemplateStatus = 'creating' | 'ready' | 'failed';

export type AdminVmTemplateBuildStep =
  | 'stopping_source'
  | 'cloning'
  | 'starting_source'
  | 'converting'
  | null;

export interface IAdminVmTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId;
  name: string;
  sourceVmId: mongoose.Types.ObjectId;
  sourceVmName: string;
  proxmoxVmid: number;
  node: string;
  status: AdminVmTemplateStatus;
  buildStep: AdminVmTemplateBuildStep;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminVmTemplateSchema = new Schema<IAdminVmTemplate>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    sourceVmId: { type: Schema.Types.ObjectId, ref: 'VM', required: true },
    sourceVmName: { type: String, required: true, trim: true },
    proxmoxVmid: { type: Number },
    node: { type: String, trim: true },
    status: {
      type: String,
      enum: ['creating', 'ready', 'failed'],
      default: 'creating',
      index: true,
    },
    buildStep: {
      type: String,
      enum: ['stopping_source', 'cloning', 'starting_source', 'converting', null],
      default: null,
    },
    errorMessage: { type: String },
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

export const AdminVmTemplate = mongoose.model<IAdminVmTemplate>(
  'AdminVmTemplate',
  adminVmTemplateSchema
);
