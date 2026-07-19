import mongoose from 'mongoose';

const historySnapshotSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true, index: true },
    userIndex: { type: Number, default: null, index: true },
    event: { type: String, required: true, index: true },
    actor: { type: String, default: 'system' },
    summary: String,
    snapshot: mongoose.Schema.Types.Mixed,
    migrationKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true, versionKey: false }
);

historySnapshotSchema.index({ requestId: 1, createdAt: -1 });

export default mongoose.model('HistorySnapshot', historySnapshotSchema);
