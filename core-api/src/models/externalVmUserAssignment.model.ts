import mongoose, { Document, Schema } from 'mongoose';
import {
  assignmentScheduleSchema,
  type AssignmentSchedule,
} from '../modules/external-vm/schedule.types';
import type { ExternalVmAssignmentStatus } from './externalVmTenantAssignment.model';

/**
 * Platform-stack mirror of ExternalVmTenantAssignment:
 * elastic server ↔ platform managed User, under an owning admin.
 */
export interface IExternalVmUserAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  externalVmId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  /** Platform admin who owns the ExternalVM (adminId on the VM). */
  adminId: mongoose.Types.ObjectId;
  schedule?: AssignmentSchedule | null;
  status: ExternalVmAssignmentStatus;
  /** Platform user who performed the assignment. */
  assignedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const externalVmUserAssignmentSchema = new Schema<IExternalVmUserAssignment>(
  {
    externalVmId: { type: Schema.Types.ObjectId, ref: 'ExternalVM', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    schedule: { type: assignmentScheduleSchema, default: null },
    status: {
      type: String,
      enum: ['active', 'expired', 'revoked'],
      default: 'active',
      required: true,
      index: true,
    },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { strict: true, timestamps: false }
);

externalVmUserAssignmentSchema.index({ externalVmId: 1, userId: 1 }, { unique: true });
externalVmUserAssignmentSchema.index({ adminId: 1, status: 1 });

export const ExternalVmUserAssignmentModel = mongoose.model<IExternalVmUserAssignment>(
  'ExternalVmUserAssignment',
  externalVmUserAssignmentSchema
);
