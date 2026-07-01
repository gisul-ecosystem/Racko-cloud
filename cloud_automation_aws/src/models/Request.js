import mongoose from 'mongoose';

const usageWindowSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6 },
    windowStartTime: String,
    windowEndTime: String,
    timezone: { type: String, default: 'Asia/Kolkata' },
    dailyLimitHours: { type: Number, default: null },
    // Legacy fields (Phase 1 wizard)
    day: {
      type: String,
      enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    },
    startTime: String,
    endTime: String,
  },
  { _id: false }
);

const selectedServiceSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    serviceName: String,
    instanceType: String,
    pricePerDay: Number,
    pricingType: { type: String, enum: ['instance', 'flat_rate'], default: 'instance' },
  },
  { _id: false }
);

const permissionSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    serviceName: String,
    policies: [String],
  },
  { _id: false }
);

const provisionStepSchema = new mongoose.Schema(
  {
    status: { type: String, default: 'pending' },
    startedAt: Date,
    completedAt: Date,
    error: String,
    output: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const usageSessionSchema = new mongoose.Schema(
  {
    userId: String,
    username: String,
    loginAt: { type: Date, required: true },
    logoutAt: Date,
    minutesUsed: Number,
  },
  { _id: true }
);

const processedCloudTrailEventSchema = new mongoose.Schema(
  {
    eventId: String,
    userId: String,
    processedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const usageUserStateSchema = new mongoose.Schema(
  {
    userId: String,
    username: String,
    email: String,
    dailyLimitReached: { type: Boolean, default: false },
  },
  { _id: false }
);

const cleanupLogSchema = new mongoose.Schema(
  {
    ranAt: Date,
    cleanedAt: Date,
    message: String,
    results: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const labRoleSchema = new mongoose.Schema(
  {
    userIndex: Number,
    roleName: String,
    roleArn: String,
    suspended: { type: Boolean, default: false },
    budgetExceeded: { type: Boolean, default: false },
    currentSpend: { type: Number, default: 0 },
    totalSessionMins: { type: Number, default: 0 },
    lastSessionAt: { type: Date },
    lastCleanupAt: { type: Date },
    cleanupLogs: [cleanupLogSchema],
    linkUsed: { type: Boolean, default: false },
    linkUsedAt: { type: Date },
    policies: [String],
    permissionSetArn: String,
  },
  { _id: false }
);

const identityUserSchema = new mongoose.Schema(
  {
    userIndex: Number,
    username: String,
    email: String,
    userId: String,
    password: String,
    accountId: String,
    awsAccountId: String,
    consoleUrl: String,
    permissionSetArn: String,
    suspended: { type: Boolean, default: false },
    budgetExceeded: { type: Boolean, default: false },
    currentSpend: { type: Number, default: 0 },
    totalSessionMins: { type: Number, default: 0 },
    lastSessionAt: { type: Date },
    lastCleanupAt: { type: Date },
    cleanupLogs: [cleanupLogSchema],
    needsActivation: { type: Boolean, default: false },
    policies: [String],
  },
  { _id: false }
);

const provisionedAccountSchema = new mongoose.Schema(
  {
    userIndex: Number,
    awsAccountId: String,
    accountCreationRequestId: String,
    accountName: String,
    scpPolicyIds: [String],
    permissionSetArn: String,
  },
  { _id: false }
);

const assignmentSchema = new mongoose.Schema(
  {
    userId: String,
    username: String,
    permissionSetArn: String,
    assignmentId: String,
    status: String,
    targetAccountId: String,
  },
  { _id: false }
);

const provisionedResourcesSchema = new mongoose.Schema(
  {
    ou: String,
    scps: [String],
    assignments: [assignmentSchema],
    accounts: [provisionedAccountSchema],
    targetAccountId: String,
    scpSkipped: { type: Boolean, default: false },
    scpSkipReason: String,
  },
  { _id: false }
);

const requestSchema = new mongoose.Schema(
  {
    customerEmail: { type: String, required: true },
    requestName: String,
    accountCount: { type: Number, required: true, min: 1, default: 10 },
    costingMode: { type: String, enum: ['shared', 'per_user'], default: 'shared' },
    accessType: {
      type: String,
      enum: ['magic_link', 'identity_center'],
      default: 'magic_link',
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    region: { type: String, required: true },

    enableDailyUsage: { type: Boolean, default: false },
    usageWindows: [usageWindowSchema],
    timezone: { type: String, default: 'Asia/Kolkata' },

    enableResourceCleanup: { type: Boolean, default: false },
    resourceCleanupIntervalHours: { type: Number, min: 1, max: 24 },
    resourceCleanupNextRunAt: Date,
    resourceCleanupLastRanAt: Date,

    cleanupEnabled: { type: Boolean, default: false },
    cleanupIntervalHours: { type: Number },
    cleanupNextRunAt: Date,
    cleanupCompleted: { type: Boolean, default: false },
    expiryCleanupAt: Date,
    cleanupLogs: [cleanupLogSchema],

    perUserBudgetUsd: { type: Number, default: null },

    selectedServices: [selectedServiceSchema],
    permissions: [permissionSchema],
    selectedPermissions: {
      type: Map,
      of: [String],
      default: undefined,
    },

    estimatedPrice: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['Pending', 'Provisioning', 'Completed', 'Failed', 'Expired'],
      default: 'Pending',
    },

    provisionStatus: {
      overall: {
        type: String,
        enum: ['idle', 'running', 'completed', 'failed'],
        default: 'idle',
      },
      steps: {
        create_account: { type: provisionStepSchema, default: () => ({}) },
        apply_scp: { type: provisionStepSchema, default: () => ({}) },
        create_users: { type: provisionStepSchema, default: () => ({}) },
        assign_permissions: { type: provisionStepSchema, default: () => ({}) },
        send_credentials: { type: provisionStepSchema, default: () => ({}) },
      },
    },

    usageSessions: [usageSessionSchema],
    usageUserStates: [usageUserStateSchema],
    processedCloudTrailEvents: [processedCloudTrailEventSchema],

    currentStep: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },

    awsAccountId: String,
    awsAccountIds: [String],
    accountCreationRequestId: String,
    labRoles: [labRoleSchema],
    identityUsers: [identityUserSchema],
    permissionSetArns: [String],
    provisionedResources: { type: provisionedResourcesSchema, default: () => ({}) },

    credentialsSent: { type: Boolean, default: false },
    failureReason: String,

    createdBy: { type: String },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model('Request', requestSchema);
