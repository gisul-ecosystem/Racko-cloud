import mongoose, { Document, Schema } from 'mongoose';

/**
 * ResetResult — persists the outcome of a VM reset operation.
 *
 * Written at reset dispatch time with status: 'pending', then updated to
 * 'success' or 'failed' when the agent reports back. This mirrors how JobModel
 * works — source of truth in DB so F5 always restores the current state.
 *
 * TTL: 24 hours — results are only needed while the UI session is active.
 */
export interface IResetResult extends Document {
  sessionId:    string;
  machineId:    mongoose.Types.ObjectId;
  machineName:  string;
  agentId:      string;
  status:       'pending' | 'success' | 'failed';
  success?:     boolean;
  error?:       string;
  completedAt?: Date;
  createdAt:    Date;
}

const resetResultSchema = new Schema<IResetResult>(
  {
    sessionId:    { type: String, required: true, index: true },
    machineId:    { type: Schema.Types.ObjectId, ref: 'Machine', required: true },
    machineName:  { type: String, required: true },
    agentId:      { type: String, required: true },
    status:       { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', required: true },
    success:      { type: Boolean },
    error:        { type: String },
    completedAt:  { type: Date },
  },
  {
    strict: true,
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// Auto-expire documents after 24 hours
resetResultSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const ResetResultModel = mongoose.model<IResetResult>(
  'ResetResult',
  resetResultSchema
);
