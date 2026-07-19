import mongoose from 'mongoose';

const customIamPolicySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: String,
    document: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: String,
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);
customIamPolicySchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, value) => {
    delete value._id;
    return value;
  },
});

export default mongoose.model('CustomIamPolicy', customIamPolicySchema);
