import mongoose, { Document, Schema } from 'mongoose';

export interface IRbacAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  roleId: mongoose.Types.ObjectId;
  assignedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const rbacAssignmentSchema = new Schema<IRbacAssignment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'RbacRole',
      required: true,
      index: true,
    },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'rbac_assignments' }
);

rbacAssignmentSchema.index({ userId: 1, roleId: 1 }, { unique: true });

export const RbacAssignmentModel = mongoose.model<IRbacAssignment>(
  'RbacAssignment',
  rbacAssignmentSchema
);
