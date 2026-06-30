import mongoose, { Document, Schema } from 'mongoose';

export interface IProxmoxNode extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  displayName: string;
  status: 'active' | 'inactive' | 'maintenance';
  createdAt: Date;
  updatedAt: Date;
}

const proxmoxNodeSchema = new Schema<IProxmoxNode>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

export const ProxmoxNode = mongoose.model<IProxmoxNode>('ProxmoxNode', proxmoxNodeSchema);
