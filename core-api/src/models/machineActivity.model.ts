import mongoose, { Document, Schema } from 'mongoose';

// ─── Activity types ───────────────────────────────────────────────────────────

export type ActivityType =
  | 'file_write'
  | 'file_delete'
  | 'file_rename'
  | 'software_install'
  | 'registry_change'
  | 'env_var_change'
  | 'scheduled_task';

// ─── Payload shapes ───────────────────────────────────────────────────────────

export interface FileWritePayload {
  path: string;
  sha256: string;
  sizeBytes: number;
  storageRef: string;   // SeaweedFS fid
  mimeType: string;
}

export interface FileDeletePayload {
  path: string;
}

export interface FileRenamePayload {
  oldPath: string;
  newPath: string;
}

export interface SoftwareInstallPayload {
  name: string;
  softwareCatalogId: string;
}

export interface RegChangePayload {
  keyPath: string;
  regExport: string;
}

export interface EnvVarPayload {
  scope: 'Machine' | 'User';
  key: string;
  value: string;
}

export interface ScheduledTaskPayload {
  name: string;
  taskPath: string;
  xmlDefinition: string;
}

export type ActivityPayload =
  | FileWritePayload
  | FileDeletePayload
  | FileRenamePayload
  | SoftwareInstallPayload
  | RegChangePayload
  | EnvVarPayload
  | ScheduledTaskPayload;

// ─── Main document ────────────────────────────────────────────────────────────

export interface IMachineActivity extends Document {
  _id: mongoose.Types.ObjectId;
  machineId: mongoose.Types.ObjectId;
  agentId: string;
  // sequence is a monotonically increasing counter per machine so clone replay
  // can process events in the exact order they occurred.
  sequence: number;
  type: ActivityType;
  payload: ActivityPayload;
  timestamp: Date;
  createdAt: Date;
}

const machineActivitySchema = new Schema<IMachineActivity>(
  {
    machineId: { type: Schema.Types.ObjectId, ref: 'Machine', required: true, index: true },
    agentId:   { type: String, required: true },
    sequence:  { type: Number, required: true },
    type: {
      type: String,
      enum: [
        'file_write',
        'file_delete',
        'file_rename',
        'software_install',
        'registry_change',
        'env_var_change',
        'scheduled_task',
      ],
      required: true,
    },
    // payload is stored as a flexible Mixed field — shape depends on `type`
    payload:   { type: Schema.Types.Mixed, required: true },
    timestamp: { type: Date, required: true },
  },
  {
    strict: false,     // allow arbitrary payload fields
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// Compound index for efficient "get all activities for machine in order" queries
machineActivitySchema.index({ machineId: 1, sequence: 1 });
// Index for cleanup on reset
machineActivitySchema.index({ machineId: 1, createdAt: 1 });

export const MachineActivityModel = mongoose.model<IMachineActivity>(
  'MachineActivity',
  machineActivitySchema
);
