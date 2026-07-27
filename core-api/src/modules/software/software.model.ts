import mongoose, { Document, Schema } from 'mongoose';

export interface ISoftware extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;          // unique, url-safe key (e.g. "google-chrome")
  description?: string;
  iconUrl?: string;
  version?: string;      // display-only label (e.g. "latest", "126.0")
  installScript: string; // PowerShell script body run via guest agent
  estimatedMinutes: number;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const softwareSchema = new Schema<ISoftware>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    iconUrl: { type: String, trim: true, maxlength: 500 },
    version: { type: String, trim: true, maxlength: 50 },
    installScript: { type: String, required: true, maxlength: 50000 },
    estimatedMinutes: { type: Number, default: 5, min: 1, max: 120 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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

softwareSchema.index({ isActive: 1, name: 1 });

export const Software = mongoose.model<ISoftware>('Software', softwareSchema);
