import mongoose from 'mongoose';

const managePortalSessionSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'GcpRequest', required: true },
  token: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  passwordHash: { type: String, required: true },
  customerEmail: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model(
  'GcpManagePortalSession',
  managePortalSessionSchema,
  'gcp_manage_portal_sessions'
);
