import mongoose from 'mongoose';

const provisionLogSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true, index: true },
    step: { type: Number, required: true },
    stepName: String,
    status: { type: String, enum: ['started', 'completed', 'failed'], required: true },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
    error: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { versionKey: false }
);

provisionLogSchema.index({ requestId: 1, step: 1, startedAt: -1 });

export default mongoose.model('ProvisionLog', provisionLogSchema);
