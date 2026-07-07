import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'provisioning_complete',
      'provisioning_failed',
      'budget_exceeded',
      'cleanup_ran',
      'lab_expiring_soon',
      'lab_expired',
      'console_access',
      'budget_renewed',
      'user_suspended',
      'user_reinstated',
    ],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
  userId: { type: String },
  severity: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
  read: { type: Boolean, default: false },
  metadata: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
