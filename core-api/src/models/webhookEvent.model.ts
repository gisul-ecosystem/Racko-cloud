import mongoose, { Document, Schema } from 'mongoose';

export interface IWebhookEvent extends Document {
  _id: mongoose.Types.ObjectId;
  eventId: string;
  processedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

export const WebhookEvent = mongoose.model<IWebhookEvent>('WebhookEvent', webhookEventSchema);
