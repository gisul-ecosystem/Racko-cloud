import mongoose, { Document, Schema } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type MachineOS = 'windows' | 'linux' | 'macos';
export type MachineStatus = 'pending' | 'online' | 'offline';
export type JobStatus = 'pending' | 'installing' | 'success' | 'failed' | 'retrying';

// ─── Machine ──────────────────────────────────────────────────────────────────

export interface IMachineSpecs {
  hostname?: string;
  osVersion?: string;
  cpuCores?: number;
  ramGb?: number;
  diskGb?: number;
}

export interface IMachine extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  ipAddress: string;
  os: MachineOS;
  agentId: string;
  accountToken: string;
  status: MachineStatus;
  adminId: mongoose.Types.ObjectId;
  lastSeen?: Date;
  specs?: IMachineSpecs;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const machineSchema = new Schema<IMachine>(
  {
    name: { type: String, required: true, trim: true },
    ipAddress: { type: String, required: true, trim: true },
    os: { type: String, enum: ['windows', 'linux', 'macos'], required: true },
    agentId: { type: String, default: '', trim: true },
    accountToken: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ['pending', 'online', 'offline'], default: 'pending' },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lastSeen: { type: Date },
    specs: {
      hostname:  { type: String },
      osVersion: { type: String },
      cpuCores:  { type: Number },
      ramGb:     { type: Number },
      diskGb:    { type: Number },
    },
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

export const MachineModel = mongoose.model<IMachine>('Machine', machineSchema);

// ─── Job ──────────────────────────────────────────────────────────────────────

export interface IJob extends Document {
  _id: mongoose.Types.ObjectId;
  machineId: mongoose.Types.ObjectId;
  softwareIds: mongoose.Types.ObjectId[];
  status: JobStatus;
  logs: string;
  attempts: number;
  adminId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    machineId: { type: Schema.Types.ObjectId, ref: 'Machine', required: true, index: true },
    softwareIds: [{ type: Schema.Types.ObjectId, ref: 'SoftwareCatalog', required: true }],
    status: {
      type: String,
      enum: ['pending', 'installing', 'success', 'failed', 'retrying'],
      default: 'pending',
    },
    logs: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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

export const JobModel = mongoose.model<IJob>('MachineJob', jobSchema);
