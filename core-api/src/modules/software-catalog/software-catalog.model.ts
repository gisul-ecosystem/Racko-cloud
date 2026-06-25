import mongoose, { Document, Schema } from 'mongoose';
import type { MachineOS } from '../machine-manager/machine-manager.model';

// Install method determines how the agent installs this software.
export type InstallMethod = 'apt' | 'brew' | 'choco' | 'msi' | 'exe' | 'zip' | 'script';

export interface ISoftwareCatalog extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  version: string;
  supportedOS: MachineOS[];
  installMethod: InstallMethod;
  // Package manager IDs (used when installMethod is winget/apt/brew/choco)
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  // File-based installs (msi/exe/zip/script) — URL to download the file
  fileUrl?: string;
  fileName?: string;
  // Extra CLI args appended to the install command (optional)
  installArgs?: string;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const softwareCatalogSchema = new Schema<ISoftwareCatalog>(
  {
    name: { type: String, required: true, trim: true },
    version: { type: String, required: true, trim: true },
    supportedOS: {
      type: [{ type: String, enum: ['windows', 'linux', 'macos'] }],
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'At least one supported OS is required.',
      },
    },
    installMethod: {
      type: String,
      enum: ['apt', 'brew', 'choco', 'msi', 'exe', 'zip', 'script'],
      required: true,
    },
    wingetId:    { type: String, trim: true }, // kept for legacy data only
    aptName:     { type: String, trim: true },
    brewName:    { type: String, trim: true },
    chocoName:   { type: String, trim: true },
    fileUrl:     { type: String, trim: true },
    fileName:    { type: String, trim: true },
    installArgs: { type: String, trim: true },
    uploadedBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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

export const SoftwareCatalogModel = mongoose.model<ISoftwareCatalog>(
  'SoftwareCatalog',
  softwareCatalogSchema
);
