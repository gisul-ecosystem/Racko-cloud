import mongoose from 'mongoose';

const budgetEventSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  username: { type: String, required: true },
  userId: { type: String, required: true },
  spendUsd: { type: Number, required: true },
  budgetUsd: { type: Number, required: true },
  action: { type: String, enum: ['suspended', 'reinstated'], required: true },
  reason: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('BudgetEvent', budgetEventSchema);
