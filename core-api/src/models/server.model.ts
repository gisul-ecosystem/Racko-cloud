import mongoose, { Document, Schema } from 'mongoose';

/** Console protocol used to reach the box. Surfaced as "VM type" in the inventory. */
export type ServerVmType = 'rdp' | 'ssh' | 'vnc';

/** Vendor billing cadence, as supplied by the provider's export. */
export type ServerPlanDuration = 'hourly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * A single machine in the super-admin VM inventory, keyed by IP address.
 *
 * Only Excel-imported servers live here. Platform VPS, catalog VMs and dedicated
 * servers stay in their own collections and are unioned in at read time.
 *
 * Logins are NOT stored here — see ServerCredential, which allows many per server.
 */
export interface IServer extends Document {
  _id: mongoose.Types.ObjectId;
  ipAddress: string;
  vmType: ServerVmType;
  /** Free-text hardware spec from the import sheet, e.g. "4 vCPU / 8GB / 100GB". */
  vmSpec?: string | null;
  /** Vendor billing cadence from the import sheet. Informational only. */
  planDuration?: ServerPlanDuration | null;
  provider?: string | null;
  /** Vendor contract window. Only ever populated for imported servers. */
  providerStartDate?: Date | null;
  providerEndDate?: Date | null;
  /**
   * The `providerEndDate` an expiry alert has already gone out for. Stops the
   * scheduler re-sending every tick, and re-arms itself when the date is
   * extended because the new value no longer matches.
   */
  providerExpiryAlertSentFor?: Date | null;
  /** Ownership. Mutually exclusive — neither set means the server is in the free pool. */
  adminId?: mongoose.Types.ObjectId | null;
  tenantId?: mongoose.Types.ObjectId | null;
  /** Client start/end dates are read live off this project, never copied. */
  projectId?: mongoose.Types.ObjectId | null;
  /** Blocks deletion while set. */
  inventoryLocked: boolean;
  notes?: string | null;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const serverSchema = new Schema<IServer>(
  {
    ipAddress: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    vmType: {
      type: String,
      enum: ['rdp', 'ssh', 'vnc'],
      required: true,
    },
    vmSpec: { type: String, trim: true, default: null },
    planDuration: {
      type: String,
      enum: ['hourly', 'monthly', 'quarterly', 'yearly'],
      default: null,
    },
    provider: { type: String, trim: true, default: null },
    providerStartDate: { type: Date, default: null },
    providerEndDate: { type: Date, default: null },
    providerExpiryAlertSentFor: { type: Date, default: null },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    inventoryLocked: { type: Boolean, default: false, index: true },
    notes: { type: String, trim: true, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'servers' }
);

serverSchema.pre('validate', function (next) {
  if (this.adminId && this.tenantId) {
    next(new Error('Server cannot belong to both adminId and tenantId.'));
    return;
  }
  next();
});

export const ServerModel = mongoose.model<IServer>('Server', serverSchema);
