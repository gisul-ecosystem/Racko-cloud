import mongoose from 'mongoose';

const customServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: String,
    category: { type: String, default: 'Custom' },
    pricePerUser: { type: Number, default: 0, min: 0 },
    icon: { type: String, default: 'custom' },
    iamActions: { type: [String], default: [] },
    createdBy: String,
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);
customServiceSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, value) => {
    delete value._id;
    return value;
  },
});

export default mongoose.model('CustomService', customServiceSchema);
