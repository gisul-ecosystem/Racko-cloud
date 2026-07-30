import mongoose from 'mongoose';

const privilegedRoleAssignmentSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true, index: true },
    userIndex: { type: Number, required: true, index: true },
    awsRoleKey: { type: String, required: true, index: true },
    awsRoleName: { type: String, required: true },
    managedPolicyArn: { type: String, required: true },
    policyName: { type: String, required: true },
    assignedBy: { type: String, default: 'org_admin' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

privilegedRoleAssignmentSchema.index(
  { requestId: 1, userIndex: 1, awsRoleKey: 1, active: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);

export default mongoose.model('PrivilegedRoleAssignment', privilegedRoleAssignmentSchema);
