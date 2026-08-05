import mongoose, { Document, Schema } from 'mongoose';

export type RbacAuditAction =
  | 'role_created'
  | 'role_updated'
  | 'role_deactivated'
  | 'assignment_set'
  | 'staff_created'
  | 'staff_deleted';

export interface IRbacAudit extends Document {
  _id: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  action: RbacAuditAction;
  targetType: 'role' | 'user';
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: Date;
}

const rbacAuditSchema = new Schema<IRbacAudit>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: [
        'role_created',
        'role_updated',
        'role_deactivated',
        'assignment_set',
        'staff_created',
        'staff_deleted',
      ],
    },
    targetType: { type: String, required: true, enum: ['role', 'user'] },
    targetId: { type: String, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'rbac_audit_logs',
  }
);

rbacAuditSchema.index({ createdAt: -1 });

export const RbacAuditModel = mongoose.model<IRbacAudit>('RbacAudit', rbacAuditSchema);
