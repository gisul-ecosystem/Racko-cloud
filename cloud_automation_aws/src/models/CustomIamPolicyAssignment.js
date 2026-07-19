import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true, index: true },
    userIndex: { type: Number, default: null, index: true },
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomIamPolicy' },
    name: String,
    document: { type: mongoose.Schema.Types.Mixed, required: true },
    assignedBy: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

assignmentSchema.index({ requestId: 1, userIndex: 1, policyId: 1 });

export default mongoose.model('CustomIamPolicyAssignment', assignmentSchema);
