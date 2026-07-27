import mongoose from 'mongoose';

const cleanupLogSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true, index: true },
    userIndex: { type: Number, default: null, index: true },
    action: { type: String, enum: ['delete', 'pause'], default: 'delete' },
    triggeredBy: { type: String, default: 'system' },
    status: { type: String, enum: ['running', 'success', 'failed'], default: 'running' },
    totalDeleted: { type: Number, default: 0 },
    results: mongoose.Schema.Types.Mixed,
    error: String,
    ranAt: { type: Date, default: Date.now },
    completedAt: Date,
    migrationKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true, versionKey: false }
);

cleanupLogSchema.index({ requestId: 1, ranAt: -1 });

export default mongoose.model('CleanupLog', cleanupLogSchema);
