import mongoose, { Document, Schema } from 'mongoose';

export type TicketType = 'support' | 'bug' | 'vm_request';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketSource = 'web' | 'email' | 'whatsapp';
export type TicketStatus =
  | 'open'
  | 'tenant_handling'
  | 'platform_assigned'
  | 'in_progress'
  | 'resolved'
  | 'closed';
export type TicketCommentAuthorRole =
  | 'user'
  | 'tenant_admin'
  | 'support_agent'
  | 'admin'
  | 'super_admin';

export const QUEUE_DOC_ID = new mongoose.Types.ObjectId('000000000000000000000001');

export interface ITicketVmDetails {
  cpu?: string;
  ram?: string;
  storage?: string;
  os?: string;
  purpose?: string;
}

export interface ITicketComment {
  _id: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  authorName: string;
  authorRole: TicketCommentAuthorRole;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}

export interface ITicket extends Document {
  _id: mongoose.Types.ObjectId;
  ticketNumber: string;
  tenantId?: mongoose.Types.ObjectId;
  submittedByTenantUserId?: mongoose.Types.ObjectId;
  submittedByUserId?: mongoose.Types.ObjectId;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string;
  type: TicketType;
  subject: string;
  description: string;
  priority: TicketPriority;
  source: TicketSource;
  status: TicketStatus;
  tenantAssigneeId?: mongoose.Types.ObjectId;
  tenantAssigneeName?: string;
  platformAssigneeId?: mongoose.Types.ObjectId;
  platformAssigneeName?: string;
  escalatedAt?: Date;
  escalatedByTenantUserId?: mongoose.Types.ObjectId;
  escalatedByName?: string;
  resolvedAt?: Date;
  closedAt?: Date;
  vmDetails?: ITicketVmDetails;
  comments: ITicketComment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IQueueState extends Document {
  _id: mongoose.Types.ObjectId;
  lastIndex: number;
  totalAssigned: number;
  createdAt: Date;
  updatedAt: Date;
}

const vmDetailsSchema = new Schema<ITicketVmDetails>(
  {
    cpu: { type: String, trim: true },
    ram: { type: String, trim: true },
    storage: { type: String, trim: true },
    os: { type: String, trim: true },
    purpose: { type: String, trim: true },
  },
  { _id: false }
);

const commentSchema = new Schema<ITicketComment>(
  {
    authorId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    authorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    authorRole: {
      type: String,
      enum: ['user', 'tenant_admin', 'support_agent', 'admin', 'super_admin'],
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
    },
    isInternal: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: true }
);

const ticketSchema = new Schema<ITicket>(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 20,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    submittedByTenantUserId: {
      type: Schema.Types.ObjectId,
      ref: 'TenantUser',
      index: true,
    },
    submittedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    requesterName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    requesterEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 320,
    },
    requesterPhone: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    type: {
      type: String,
      enum: ['support', 'bug', 'vm_request'],
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    source: {
      type: String,
      enum: ['web', 'email', 'whatsapp'],
      default: 'web',
    },
    status: {
      type: String,
      enum: [
        'open',
        'tenant_handling',
        'platform_assigned',
        'in_progress',
        'resolved',
        'closed',
      ],
      default: 'open',
      index: true,
    },
    tenantAssigneeId: {
      type: Schema.Types.ObjectId,
      ref: 'TenantUser',
      index: true,
    },
    tenantAssigneeName: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    platformAssigneeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    platformAssigneeName: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    escalatedAt: {
      type: Date,
    },
    escalatedByTenantUserId: {
      type: Schema.Types.ObjectId,
      ref: 'TenantUser',
    },
    escalatedByName: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    resolvedAt: {
      type: Date,
    },
    closedAt: {
      type: Date,
    },
    vmDetails: {
      type: vmDetailsSchema,
    },
    comments: {
      type: [commentSchema],
      default: [],
    },
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

ticketSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });

const queueSchema = new Schema<IQueueState>(
  {
    _id: {
      type: Schema.Types.ObjectId,
      default: QUEUE_DOC_ID,
    },
    lastIndex: {
      type: Number,
      default: -1,
    },
    totalAssigned: {
      type: Number,
      default: 0,
    },
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

export const Ticket = mongoose.model<ITicket>('SupportTicket', ticketSchema);
export const SupportQueue = mongoose.model<IQueueState>('SupportQueue', queueSchema);
