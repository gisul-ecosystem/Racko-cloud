import mongoose, { Document, Schema } from 'mongoose';

// ─── Sub-document types ───────────────────────────────────────────────────────

export interface IInstalledApp {
  displayName: string;
  displayVersion?: string;
  publisher?: string;
  installLocation?: string;
  uninstallString?: string;
}

export interface IFileEntry {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface IEnvVar {
  key: string;
  value: string;
}

export interface IScheduledTaskEntry {
  name: string;
  taskPath: string;
  state: string;
}

export interface IServiceEntry {
  name: string;
  state: string;
  startType: string;
  binaryPath?: string;
}

// ─── Main document ────────────────────────────────────────────────────────────

export interface IMachineBaseline extends Document {
  _id: mongoose.Types.ObjectId;
  machineId: mongoose.Types.ObjectId;
  agentId: string;
  capturedAt: Date;
  installedApps: IInstalledApp[];
  files: IFileEntry[];
  systemEnvVars: IEnvVar[];
  userEnvVars: IEnvVar[];
  scheduledTasks: IScheduledTaskEntry[];
  services: IServiceEntry[];
  programFolders: string[];
  programDataFolders: string[];
  createdAt: Date;
  updatedAt: Date;
}

const installedAppSchema = new Schema<IInstalledApp>(
  {
    displayName:     { type: String, required: true },
    displayVersion:  { type: String },
    publisher:       { type: String },
    installLocation: { type: String },
    uninstallString: { type: String },
  },
  { _id: false }
);

const fileEntrySchema = new Schema<IFileEntry>(
  {
    path:      { type: String, required: true },
    sha256:    { type: String, required: true },
    sizeBytes: { type: Number, required: true },
  },
  { _id: false }
);

const envVarSchema = new Schema<IEnvVar>(
  {
    key:   { type: String, required: true },
    value: { type: String, default: '' },
  },
  { _id: false }
);

const scheduledTaskSchema = new Schema<IScheduledTaskEntry>(
  {
    name:     { type: String, required: true },
    taskPath: { type: String, default: '\\' },
    state:    { type: String, default: 'Unknown' },
  },
  { _id: false }
);

const serviceSchema = new Schema<IServiceEntry>(
  {
    name:       { type: String, required: true },
    state:      { type: String, default: 'Unknown' },
    startType:  { type: String, default: 'Manual' },
    binaryPath: { type: String },
  },
  { _id: false }
);

const machineBaselineSchema = new Schema<IMachineBaseline>(
  {
    machineId:          { type: Schema.Types.ObjectId, ref: 'Machine', required: true, index: true },
    agentId:            { type: String, required: true, index: true },
    capturedAt:         { type: Date, required: true },
    installedApps:      { type: [installedAppSchema], default: [] },
    // files array can be very large — stored but not indexed individually
    files:              { type: [fileEntrySchema], default: [] },
    systemEnvVars:      { type: [envVarSchema], default: [] },
    userEnvVars:        { type: [envVarSchema], default: [] },
    scheduledTasks:     { type: [scheduledTaskSchema], default: [] },
    services:           { type: [serviceSchema], default: [] },
    programFolders:     { type: [String], default: [] },
    programDataFolders: { type: [String], default: [] },
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

// One baseline per machine — upsert on re-registration
machineBaselineSchema.index({ machineId: 1 }, { unique: true });

export const MachineBaselineModel = mongoose.model<IMachineBaseline>(
  'MachineBaseline',
  machineBaselineSchema
);
