import mongoose from 'mongoose';

const accessRequestSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', index: true },
    customerEmail: { type: String, required: true, trim: true, lowercase: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    serviceName: { type: String, required: true, trim: true },
    defaultPolicy: String,
    requestedAccess: { type: String, required: true, trim: true },
    requestedPolicies: { type: [String], default: [] },
    accountCount: Number,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedBy: String,
    reviewedAt: Date,
    reviewNotes: String,
    accessApplied: { type: Boolean, default: false },
    fulfillmentError: String,
  },
  { timestamps: true, versionKey: false }
);

accessRequestSchema.index({ requestId: 1, createdAt: -1 });
accessRequestSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, value) => {
    delete value._id;
    return value;
  },
});

export default mongoose.model('AccessRequest', accessRequestSchema);
