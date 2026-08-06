import mongoose, { Document, Schema } from 'mongoose';

export type SharedFilePermission = 'read' | 'read-write' | 'full';

export interface ISharedFile extends Document {
  _id: mongoose.Types.ObjectId;
  /** Original filename as uploaded */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** SeaweedFS S3 object key */
  storageRef: string;
  /** Machine that uploaded this file */
  sourceMachineId: mongoose.Types.ObjectId;
  /** Admin that owns the source machine */
  adminId: mongoose.Types.ObjectId;
  /** Permission granted to target machines */
  permission: SharedFilePermission;
  /** Machines this file is shared with */
  sharedWithMachineIds: mongoose.Types.ObjectId[];
  /** Soft delete */
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sharedFileSchema = new Schema<ISharedFile>(
  {
    fileName:            { type: String, required: true, trim: true },
    mimeType:            { type: String, required: true, default: 'application/octet-stream' },
    sizeBytes:           { type: Number, required: true, default: 0 },
    storageRef:          { type: String, required: true, trim: true },
    sourceMachineId:     { type: Schema.Types.ObjectId, ref: 'Machine', required: true, index: true },
    adminId:             { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    permission:          { type: String, enum: ['read', 'read-write', 'full'], default: 'read' },
    sharedWithMachineIds:[ { type: Schema.Types.ObjectId, ref: 'Machine' } ],
    deleted:             { type: Boolean, default: false, index: true },
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

// Fast lookup: "all files shared with this machine"
sharedFileSchema.index({ sharedWithMachineIds: 1 });
sharedFileSchema.index({ sourceMachineId: 1, deleted: 1 });

export const SharedFileModel = mongoose.model<ISharedFile>('SharedFile', sharedFileSchema);
