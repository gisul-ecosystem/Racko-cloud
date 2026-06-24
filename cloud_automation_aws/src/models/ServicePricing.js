import mongoose from 'mongoose';

const servicePricingSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    serviceName: { type: String, required: true },
    instanceType: { type: String, required: true },
    region: { type: String, required: true },
    pricePerHour: { type: Number, default: 0 },
    pricePerDay: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    priceUnit: String,
    currency: { type: String, default: 'USD' },
    syncedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

servicePricingSchema.index({ serviceId: 1, instanceType: 1, region: 1 }, { unique: true });

export default mongoose.model('ServicePricing', servicePricingSchema);
