import mongoose, { Schema } from 'mongoose';

/**
 * One VM in a run, resolved at the moment the jobs were queued.
 *
 * The IP and login are copied in rather than joined later: a run is a record of
 * what happened, and it should still read correctly after the VM is reassigned,
 * renamed or removed from the inventory.
 */
export interface IInstallRunVm {
  ipAddress: string;
  vmUsername?: string;
  /** Portal user the login went to in the same batch. Never a password. */
  email?: string;
  machineId?: mongoose.Types.ObjectId;
  machineName?: string;
  /** No Racko agent on the box, so nothing was queued for it. */
  notManaged: boolean;
}

/**
 * A software install batch started from Server Assign.
 *
 * The install jobs themselves already survive in `machine_jobs`, but nothing
 * tied them together or said which assignment they came from — so leaving the
 * page lost the only view of them. This document is that missing grouping: the
 * job ids plus enough context (project, owner, VMs, whether a reset ran) to
 * rebuild the tracking view later. Live status is always re-read from the jobs,
 * never cached here, so a reopened run is current rather than a snapshot.
 */
export interface IInstallRun {
  _id: mongoose.Types.ObjectId;
  /** The super admin who ran it, matching `machine_jobs.adminId`. */
  startedBy: mongoose.Types.ObjectId;
  targetType?: 'admin' | 'tenant';
  targetId?: mongoose.Types.ObjectId;
  targetLabel?: string;
  projectId?: mongoose.Types.ObjectId;
  projectName?: string;
  clientName?: string;
  /** Logins granted in the same batch, for context on what this install served. */
  assignedCount?: number;
  softwareIds: mongoose.Types.ObjectId[];
  softwareNames: string[];
  jobIds: mongoose.Types.ObjectId[];
  vms: IInstallRunVm[];
  /** What the reset step reported, when the operator ran one first. */
  resetSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const installRunVmSchema = new Schema<IInstallRunVm>(
  {
    ipAddress: { type: String, required: true, trim: true },
    vmUsername: { type: String, trim: true },
    email: { type: String, trim: true },
    machineId: { type: Schema.Types.ObjectId, ref: 'Machine' },
    machineName: { type: String, trim: true },
    notManaged: { type: Boolean, default: false },
  },
  { _id: false }
);

const installRunSchema = new Schema<IInstallRun>(
  {
    startedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: ['admin', 'tenant'] },
    targetId: { type: Schema.Types.ObjectId },
    targetLabel: { type: String, trim: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    projectName: { type: String, trim: true },
    clientName: { type: String, trim: true },
    assignedCount: { type: Number },
    softwareIds: [{ type: Schema.Types.ObjectId, ref: 'SoftwareCatalog' }],
    softwareNames: [{ type: String, trim: true }],
    jobIds: [{ type: Schema.Types.ObjectId, ref: 'MachineJob' }],
    vms: { type: [installRunVmSchema], default: [] },
    resetSummary: { type: String, trim: true },
  },
  { timestamps: true, collection: 'install_runs' }
);

// The tracking list is always "my newest runs first".
installRunSchema.index({ startedBy: 1, createdAt: -1 });

export const InstallRunModel = mongoose.model<IInstallRun>('InstallRun', installRunSchema);
