import mongoose from 'mongoose';

const sessionLogSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  userIndex: { type: Number, required: true },
  username: { type: String, required: true },
  accessType: { type: String, enum: ['magic_link', 'identity_center'], required: true },

  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
  durationMins: { type: Number, default: 0 },

  roleArn: { type: String },
  sessionName: { type: String },
  userId: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },

  status: { type: String, enum: ['active', 'expired', 'ended'], default: 'active' },
  expiresAt: { type: Date },

  sessionSpend: { type: Number, default: 0 },
});

sessionLogSchema.index({ requestId: 1, userIndex: 1, startedAt: -1 });

export default mongoose.model('SessionLog', sessionLogSchema);
