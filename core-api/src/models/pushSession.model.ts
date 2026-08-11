import mongoose, { Schema, type Document } from 'mongoose';

/**
 * Persists push session state to MongoDB so the browser can recover it on refresh.
 * Sessions expire after 15 minutes (TTL index on createdAt).
 */

export interface IPushSessionMachineResult {
  machineId:         string;
  machineName:       string;
  ipAddress:         string;
  pushSuccess?:      boolean;
  pushError?:        string;
  agentConnected:    boolean;
  rackoAppInstalled?: boolean;
  rackoAppError?:    string;
}

export interface IPushSession extends Document {
  sessionId:         string;
  adminId:           string;
  machines:          IPushSessionMachineResult[];
  installRackoApp:   boolean;  // whether racko-app GUI should be installed on each VM
  createdAt:         Date;
  updatedAt:         Date;
}

const MachineResultSchema = new Schema<IPushSessionMachineResult>(
  {
    machineId:         { type: String, required: true },
    machineName:       { type: String, required: true },
    ipAddress:         { type: String, required: true },
    pushSuccess:       { type: Boolean },
    pushError:         { type: String },
    agentConnected:    { type: Boolean, default: false },
    rackoAppInstalled: { type: Boolean },
    rackoAppError:     { type: String },
  },
  { _id: false }
);

const PushSessionSchema = new Schema<IPushSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    adminId:   { type: String, required: true },
    machines:  { type: [MachineResultSchema], default: [] },
    // Controls whether racko-app GUI + WebView2 are installed after agent connects.
    // Defaults to true (existing behaviour). Set to false to install agent only.
    installRackoApp: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Auto-expire sessions after 15 minutes
PushSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

export const PushSessionModel = mongoose.model<IPushSession>('PushSession', PushSessionSchema);
