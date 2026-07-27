import mongoose, { Document, Schema } from 'mongoose';

export interface IVmAutomation extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  adminId: mongoose.Types.ObjectId;
  vmIds: mongoose.Types.ObjectId[];
  /** Daily resume time — HH:mm in `timezone` */
  startTime: string;
  /** Daily hibernate time — HH:mm in `timezone` */
  stopTime: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
  isActive: boolean;
  /** Last calendar day (YYYY-MM-DD in timezone) all VMs resumed */
  lastResumeOn?: string;
  /** Last calendar day (YYYY-MM-DD in timezone) all VMs hibernated */
  lastHibernateOn?: string;
  /** Per-VM last resume day — vmId → YYYY-MM-DD in timezone */
  lastResumeOnByVm?: Map<string, string>;
  /** Per-VM last hibernate day — vmId → YYYY-MM-DD in timezone */
  lastHibernateOnByVm?: Map<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const vmAutomationSchema = new Schema<IVmAutomation>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vmIds: [{ type: Schema.Types.ObjectId, ref: 'VM', required: true }],
    startTime: { type: String, required: true },
    stopTime: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    timezone: { type: String, required: true, default: 'UTC' },
    isActive: { type: Boolean, default: true, index: true },
    lastResumeOn: { type: String },
    lastHibernateOn: { type: String },
    lastResumeOnByVm: { type: Map, of: String, default: undefined },
    lastHibernateOnByVm: { type: Map, of: String, default: undefined },
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

vmAutomationSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

export const VmAutomation = mongoose.model<IVmAutomation>('VmAutomation', vmAutomationSchema);
