import mongoose from 'mongoose';

const userSpendSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  username: { type: String, required: true },
  userId: { type: String, required: true },
  date: { type: String, required: true },
  spendUsd: { type: Number, default: 0 },
  services: [
    {
      serviceName: String,
      spendUsd: Number,
    },
  ],
  budgetExceeded: { type: Boolean, default: false },
  syncedAt: { type: Date, default: Date.now },
});

userSpendSchema.index({ requestId: 1, username: 1, date: 1 }, { unique: true });

export default mongoose.model('UserSpend', userSpendSchema);
