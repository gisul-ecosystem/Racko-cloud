import mongoose, { Document, Schema } from 'mongoose';

/**
 * ResetResult — persists the outcome of a VM reset operation.
 *
 * Written by the agent via POST /api/v1/agent/reset-result (HTTP, not WS).
 * This ensures the result survives WebSocket drops that happen during long resets.
 * The SSE stream reads this on open so late-arriving browsers get the result instantly.
 *
 * TTL: 24 hours — results are only needed while the UI session is active.
 */
export interface IResetResult extends Document {
  sessionId:   string;
  machineId:   mongoose.Types.ObjectId;
  machineName: string;
  agentId:     string;
  success:     boolean;
  error?:      string;
  completedAt: Date;
  createdAt:   Date;
}

const resetResultSchema = new Schema<IResetResult>(
  {
    sessionId:   { type: String, required: true, index: true },
    machineId:   { type: Schema.Types.ObjectId, ref: 'Machine', required: true },
    machineName: { type: String, required: true },
    agentId:     { type: String, required: true },
    success:     { type: Boolean, required: true },
    error:       { type: String },
    completedAt: { type: Date, required: true },
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
