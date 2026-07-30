import mongoose from 'mongoose';

const privilegedRoleRequestSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', default: null, index: true },
    customerEmail: { type: String, required: true, index: true },
    awsRole: { type: String, required: true },
    awsRoleKey: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewNotes: String,
    reviewedBy: String,
    reviewedAt: Date,
    accessApplied: { type: Boolean, default: false },
    usersProcessed: { type: Number, default: 0 },
    rolesAssigned: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

privilegedRoleRequestSchema.index({ customerEmail: 1, status: 1, createdAt: -1 });

export default mongoose.model('PrivilegedRoleRequest', privilegedRoleRequestSchema);
