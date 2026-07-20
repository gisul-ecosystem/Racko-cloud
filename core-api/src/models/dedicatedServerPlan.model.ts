import mongoose, { Document, Schema } from 'mongoose';

export interface IDedicatedServerPlan extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  cpu: string;
  ram: string;
  disk: string;
  location?: string;
  monthlyPrice: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const dedicatedServerPlanSchema = new Schema<IDedicatedServerPlan>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000 },
    cpu: { type: String, required: true, trim: true, maxlength: 100 },
    ram: { type: String, required: true, trim: true, maxlength: 100 },
    disk: { type: String, required: true, trim: true, maxlength: 100 },
    location: { type: String, trim: true, maxlength: 200 },
    monthlyPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', trim: true, maxlength: 8 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'dedicated_server_plans' }
);

dedicatedServerPlanSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });

export const DedicatedServerPlanModel = mongoose.model<IDedicatedServerPlan>(
  'DedicatedServerPlan',
  dedicatedServerPlanSchema
);
