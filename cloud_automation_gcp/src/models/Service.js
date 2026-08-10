import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'GcpServiceCategory', required: true },
    description: String,
    gcpServiceCode: { type: String, required: true },
    pricingType: { type: String, enum: ['instance', 'flat_rate'], required: true },
    regions: [String],
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model('GcpService', serviceSchema, 'gcp_services');
