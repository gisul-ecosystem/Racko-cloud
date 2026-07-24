import mongoose, { Document, Schema } from 'mongoose';

export interface IDedicatedServerSettings extends Document {
  _id: mongoose.Types.ObjectId;
  /** Sell multiplier applied to base monthly + setup fee (e.g. 2 or 3). */
  sellMultiplier: number;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const dedicatedServerSettingsSchema = new Schema<IDedicatedServerSettings>(
  {
    sellMultiplier: { type: Number, required: true, default: 1, min: 0.01, max: 1000 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'dedicated_server_settings' }
);

export const DedicatedServerSettingsModel = mongoose.model<IDedicatedServerSettings>(
  'DedicatedServerSettings',
  dedicatedServerSettingsSchema
);
