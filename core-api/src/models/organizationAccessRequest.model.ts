import mongoose, { Document, Schema } from 'mongoose';

export type OrganizationAccessRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'more_info_required';

export type NdaStatus = 'not_started' | 'pending' | 'completed';

interface IReadableIdCounter extends Document {
  key: string;
  sequence: number;
}

export interface IOrganizationAccessRequest extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  orgId?: string;
  contactName: string;
  companyName: string;
  companyWebsite?: string;
  phone?: string;
  designation?: string;
  companySize?: string;
  registeredAddress?: string;
  taxId?: string;
  useCase?: string;
  expectedUsage?: string;
  status: OrganizationAccessRequestStatus;
  ndaStatus: NdaStatus;
  reviewerNotes?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const organizationAccessRequestSchema = new Schema<IOrganizationAccessRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    orgId: { type: String, trim: true, uppercase: true, unique: true, sparse: true, index: true },
    contactName: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    companyWebsite: { type: String, trim: true },
    phone: { type: String, trim: true },
    designation: { type: String, trim: true },
    companySize: { type: String, trim: true },
    registeredAddress: { type: String, trim: true },
    taxId: { type: String, trim: true },
    useCase: { type: String, trim: true },
    expectedUsage: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'more_info_required'],
      default: 'pending',
      index: true,
    },
    ndaStatus: {
      type: String,
      enum: ['not_started', 'pending', 'completed'],
      default: 'not_started',
    },
    reviewerNotes: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'organization_access_requests',
  }
);

organizationAccessRequestSchema.index({ status: 1, createdAt: -1 });

const readableIdCounterSchema = new Schema<IReadableIdCounter>(
  {
    key: { type: String, required: true, unique: true, index: true },
    sequence: { type: Number, required: true, min: 0, default: 0 },
  },
  {
    timestamps: true,
    collection: 'readable_id_counters',
  }
);

const ReadableIdCounterModel = mongoose.model<IReadableIdCounter>(
  'ReadableIdCounter',
  readableIdCounterSchema
);

function formatReadableOrgId(sequence: number): string {
  return `ORG-${String(sequence).padStart(3, '0')}`;
}

export async function nextReadableOrgId(): Promise<string> {
  const counter = await ReadableIdCounterModel.findOneAndUpdate(
    { key: 'b2b_org' },
    { $inc: { sequence: 1 } },
    { upsert: true, new: true }
  ).lean();

  return formatReadableOrgId(counter.sequence);
}

export const OrganizationAccessRequestModel = mongoose.model<IOrganizationAccessRequest>(
  'OrganizationAccessRequest',
  organizationAccessRequestSchema
);
