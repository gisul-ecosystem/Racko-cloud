import mongoose from 'mongoose';

const provisionLogSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'GcpRequest', required: true, index: true },
    step: Number,
    stepName: String,
    status: { type: String, enum: ['started', 'completed', 'failed'], default: 'started' },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
    error: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { versionKey: false }
);

export default mongoose.model('GcpProvisionLog', provisionLogSchema, 'gcp_provision_logs');
