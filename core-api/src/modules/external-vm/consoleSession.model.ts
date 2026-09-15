import mongoose, { Document, Schema } from 'mongoose';

export interface IConsoleSession extends Document {
  _id: mongoose.Types.ObjectId;
  adminId?: mongoose.Types.ObjectId;   // set for platform admin servers
  tenantId?: mongoose.Types.ObjectId;  // set for tenant servers
  userId: mongoose.Types.ObjectId;    // platform managed user or tenant user
  userEmail: string;
  serverId: mongoose.Types.ObjectId;  // ExternalVM._id
  serverName: string;
  loginAt: Date;
  logoutAt?: Date | null;
  lastHeartbeatAt: Date;
  durationSeconds?: number | null;    // set on close
  createdAt: Date;
  updatedAt: Date;
}

const consoleSessionSchema = new Schema<IConsoleSession>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userEmail: { type: String, required: true, trim: true },
    serverId: { type: Schema.Types.ObjectId, ref: 'ExternalVM', required: true, index: true },
    serverName: { type: String, required: true, trim: true },
    loginAt: { type: Date, required: true, default: () => new Date() },
    logoutAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, required: true, default: () => new Date() },
    durationSeconds: { type: Number, default: null },
  },
  { timestamps: true }
);

// TTL: auto-delete records older than 90 days
consoleSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
// For admin analytics queries
consoleSessionSchema.index({ adminId: 1, loginAt: -1 });
// For stale session sweeper
consoleSessionSchema.index({ logoutAt: 1, lastHeartbeatAt: 1 });

export const ConsoleSessionModel = mongoose.model<IConsoleSession>('ConsoleSession', consoleSessionSchema);
