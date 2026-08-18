import Request from '../models/Request.js';
import { SERVICE_IAM_ROLES } from '../config/iamPolicies.js';
import { evaluateServicePeriodAccess } from '../utils/servicePeriodAccess.js';
import { resolveRequestTimezone } from '../utils/serviceDateTime.js';
import { generateAndLogConsoleUrl } from './consoleAccessService.js';
import {
  assignProjectIamRoles,
  deleteIdentityUser,
  deleteLabProject,
  suspendIdentityUser,
  reinstateIdentityUser,
  createIdentityUsers,
} from '../provisioners/gcp/provisioners.js';
import { createManagePortalSession } from './managePortalService.js';
import { resolvePortalBaseUrl } from '../utils/portalUrl.js';

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function resolveUserRoles(user, request) {
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return user.roles;
  }

  const flattened = [];
  for (const entry of request.permissions || []) {
    for (const role of entry.roles || []) {
      flattened.push(role);
    }
  }

  return [...new Set(flattened)];
}

function mapUsersFromRequest(request) {
  return (request.identityUsers || []).map((user) => {
    const roles = resolveUserRoles(user, request);
    const username = user.username || `labuser${user.userIndex + 1}`;

    return {
      userIndex: user.userIndex,
      username,
      roleName: username,
      userId: user.userId || user.email || username,
      email: user.email,
      consoleUrl: user.consoleUrl || 'https://console.cloud.google.com/',
      password: user.password,
      gcpProjectId: user.gcpProjectId || request.gcpProjectId,
      status: user.suspended ? 'Suspended' : 'Active',
      suspended: user.suspended || false,
      budgetExceeded: user.budgetExceeded || false,
      currentSpend: user.currentSpend || 0,
      spendByService: [],
      cleanupDisabled: false,
      cleanupIntervalOverride: null,
      cleanupEnabled: !request.cleanupDisabled,
      cleanupIntervalHours: request.cleanupIntervalHours ?? null,
      policies: roles,
      roles,
    };
  });
}

export async function listAllRequests({ status, region, search } = {}) {
  const query = {};

  if (status && status !== 'All') {
    query.status = status;
  }

  if (region && region !== 'All') {
    query.region = region;
  }

  if (search) {
    query.$or = [
      { customerEmail: { $regex: search, $options: 'i' } },
      { region: { $regex: search, $options: 'i' } },
      { requestName: { $regex: search, $options: 'i' } },
      { projectName: { $regex: search, $options: 'i' } },
    ];
  }

  const requests = await Request.find(query).sort({ createdAt: -1 });

  return requests.map((request) => ({
    requestId: String(request._id),
    requestName: request.requestName || null,
    projectName: request.projectName || request.requestName || null,
    idMode: request.idMode || null,
    customerEmail: request.customerEmail,
    region: request.region,
    status: request.status,
    costingMode: request.costingMode,
    accountCount: request.accountCount,
    startDate: request.startDate,
    endDate: request.endDate,
    estimatedPrice: request.estimatedPrice,
    gcpProjectId: request.gcpProjectId,
    awsAccountId: request.gcpProjectId,
    userCount: request.identityUsers?.length || 0,
    createdAt: request.createdAt,
    selectedServices: (request.selectedServices || []).map((service) => service.serviceName),
  }));
}

export async function getRequestDetail(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const users = mapUsersFromRequest(request);
  const timezone = resolveRequestTimezone(request);

  return {
    requestId: String(request._id),
    requestName: request.requestName || null,
    projectName: request.projectName || request.requestName || null,
    idMode: request.idMode || null,
    customerEmail: request.customerEmail,
    region: request.region,
    status: request.status,
    costingMode: request.costingMode,
    accessType: request.accessType || 'cloud_identity',
    accountCount: request.accountCount,
    gcpProjectId: request.gcpProjectId,
    awsAccountId: request.gcpProjectId,
    startDate: request.startDate,
    endDate: request.endDate,
    estimatedPrice: request.estimatedPrice,
    perUserBudgetUsd: request.perUserBudgetUsd,
    cleanupEnabled: request.cleanupEnabled,
    cleanupIntervalHours: request.cleanupIntervalHours,
    enableResourceCleanup: request.enableResourceCleanup,
    resourceCleanupIntervalHours: request.resourceCleanupIntervalHours,
    resourceCleanupAction: request.resourceCleanupAction || 'delete',
    resourceCleanupNextRunAt: request.resourceCleanupNextRunAt || null,
    resourceCleanupLastRanAt: request.resourceCleanupLastRanAt || null,
    selectedServices: (request.selectedServices || []).map((service) => service.serviceName),
    permissions: (request.permissions || []).map((entry) => ({
      serviceName: entry.serviceName,
      policies: entry.roles || [],
      roles: entry.roles || [],
    })),
    progress: request.progress,
    credentialsSent: request.credentialsSent,
    userCount: users.length,
    enableDailyUsage: Boolean(request.enableDailyUsage),
    usageWindows: request.usageWindows || [],
    timezone,
    users,
    liveSummary: { activeSessions: 0, totalMinutesSpent: 0 },
  };
}

export async function getRequestUsers(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  return mapUsersFromRequest(request);
}

export async function generateUserConsoleUrl(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const user = request.identityUsers?.find((entry) => entry.userIndex === Number(userIndex));
  if (!user) throw createError('User not found', 404);

  const access = evaluateServicePeriodAccess(request);
  if (!access.allowed) {
    throw createError(access.message, 403);
  }

  const consoleUrl = await generateAndLogConsoleUrl(request, user);
  return { consoleUrl };
}

export async function suspendLabUser(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  await suspendIdentityUser(request, userIndex);

  await Request.findOneAndUpdate(
    { _id: requestId, 'identityUsers.userIndex': userIndex },
    { $set: { 'identityUsers.$.suspended': true, updatedAt: new Date() } },
    { new: true }
  );
}

export async function reinstateLabUser(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const user = request.identityUsers?.find((entry) => entry.userIndex === Number(userIndex));
  if (!user) throw createError('User not found', 404);

  const restored = await reinstateIdentityUser(request, userIndex, { forceNewPassword: true });

  await Request.findOneAndUpdate(
    { _id: requestId, 'identityUsers.userIndex': userIndex },
    {
      $set: {
        'identityUsers.$.suspended': false,
        'identityUsers.$.budgetExceeded': false,
        'identityUsers.$.password': restored.password,
        updatedAt: new Date(),
      },
    }
  );
}

export async function deleteLabUser(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const user = request.identityUsers?.find((entry) => entry.userIndex === Number(userIndex));
  if (!user) throw createError('User not found', 404);

  await deleteIdentityUser(user);

  await Request.findByIdAndUpdate(requestId, {
    $pull: { identityUsers: { userIndex: Number(userIndex) } },
    $set: { updatedAt: new Date() },
  });
}

export async function updateUserPermissions(requestId, userIndex, policies = []) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  if (!Array.isArray(policies)) throw createError('policies must be an array', 400);

  const user = request.identityUsers?.find((entry) => entry.userIndex === Number(userIndex));
  if (!user) throw createError('User not found', 404);

  const projectId = request.gcpProjectId || user.gcpProjectId;
  if (!projectId) throw createError('GCP project not provisioned yet', 400);

  await assignProjectIamRoles({
    projectId,
    users: [{ ...user.toObject?.() || user, roles: policies }],
    permissions: [{ roles: policies }],
    replaceUserBindings: true,
  });

  await Request.findOneAndUpdate(
    { _id: requestId, 'identityUsers.userIndex': userIndex },
    {
      $set: {
        'identityUsers.$.roles': policies,
        updatedAt: new Date(),
      },
    }
  );
}

export async function getUserCost(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  const user = request.identityUsers?.find((entry) => entry.userIndex === Number(userIndex));
  if (!user) throw createError('User not found', 404);

  return {
    userIndex: Number(userIndex),
    spendUsd: user.currentSpend || 0,
    services: [],
    lastSyncedAt: null,
  };
}

export async function getRequestTotalCost(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const total = (request.identityUsers || []).reduce(
    (sum, user) => sum + (user.currentSpend || 0),
    0
  );

  return { totalSpendUsd: total, users: request.identityUsers?.length || 0 };
}

export async function renewUserBudget(requestId, userIndex, topUpAmount) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  await Request.findOneAndUpdate(
    { _id: requestId, 'identityUsers.userIndex': userIndex },
    {
      $set: {
        'identityUsers.$.budgetExceeded': false,
        'identityUsers.$.currentSpend': 0,
        updatedAt: new Date(),
      },
      $inc: {
        'identityUsers.$.budgetTopUpUsd': Number(topUpAmount || 0),
      },
    }
  );

  return { renewed: true, topUpAmount: Number(topUpAmount || 0) };
}

export async function triggerUserCleanup(requestId, userIndex) {
  return {
    requestId,
    userIndex,
    message: 'GCP resource cleanup scheduler not enabled yet.',
    deleted: 0,
  };
}

export async function triggerAllCleanup(requestId) {
  return {
    requestId,
    message: 'GCP resource cleanup scheduler not enabled yet.',
    deleted: 0,
  };
}

export async function updateCleanupSettings(requestId, userIndex, settings = {}) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const updates = { updatedAt: new Date() };
  if (settings.cleanupDisabled != null) {
    updates[`identityUsers.$.${settings.cleanupDisabled ? 'cleanupDisabled' : 'cleanupDisabled'}`] =
      Boolean(settings.cleanupDisabled);
  }
  if (settings.cleanupIntervalOverride != null) {
    updates['identityUsers.$.cleanupIntervalOverride'] = settings.cleanupIntervalOverride;
  }

  await Request.findOneAndUpdate(
    { _id: requestId, 'identityUsers.userIndex': userIndex },
    { $set: updates }
  );

  return { updated: true };
}

export async function updateRequestCleanupSettings(requestId, settings = {}) {
  const updates = { updatedAt: new Date() };
  if (settings.cleanupEnabled != null) updates.cleanupEnabled = Boolean(settings.cleanupEnabled);
  if (settings.cleanupIntervalHours != null) {
    updates.cleanupIntervalHours = settings.cleanupIntervalHours;
  }
  if (settings.action != null) updates.resourceCleanupAction = settings.action;

  await Request.findByIdAndUpdate(requestId, { $set: updates });
  return { updated: true };
}

export async function syncRequestSpend(requestId) {
  return {
    requestId,
    synced: 0,
    message: 'GCP cost tracking scheduler not enabled yet.',
  };
}

export function getAvailableIamPolicies() {
  return Object.entries(SERVICE_IAM_ROLES).map(([service, roles]) => ({
    service,
    policies: roles,
    roles,
  }));
}

export async function getDailyUsageForRequest(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  return {
    requestId,
    timezone: resolveRequestTimezone(request),
    users: (request.identityUsers || []).map((user) => ({
      userIndex: user.userIndex,
      username: user.username || `labuser${user.userIndex + 1}`,
      consumedMinutes: 0,
      remainingMinutes: null,
      dailyLimitMinutes: null,
      dailyLimitReached: false,
    })),
  };
}

export async function getMonitoringLogs() {
  return { logs: [], enforcementLogs: [], auditLogs: [] };
}

export async function forceLogoutUser(requestId, userIndex) {
  return {
    requestId,
    userIndex,
    message: 'GCP session revocation not implemented yet.',
  };
}

export async function deleteRequest(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  for (const user of request.identityUsers || []) {
    try {
      await deleteIdentityUser(user);
    } catch (err) {
      console.warn(`[orgAdmin] Identity user delete warning: ${err.message}`);
    }
  }

  if (request.gcpProjectId) {
    try {
      await deleteLabProject(request.gcpProjectId);
    } catch (err) {
      console.warn(`[orgAdmin] Project delete warning: ${err.message}`);
    }
  }

  await Request.findByIdAndDelete(requestId);
  return { deleted: true };
}

export async function reprovisionPermissions(requestId) {
  return repairPermissions(requestId);
}

export async function repairPermissions(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  if (!request.gcpProjectId) throw createError('GCP project not provisioned yet', 400);

  await assignProjectIamRoles({
    projectId: request.gcpProjectId,
    users: request.identityUsers || [],
    permissions: request.permissions || [],
  });

  return { success: true, message: 'IAM roles re-applied for all users.' };
}

export async function addUsersToRequest(requestId, { count = 1 } = {}) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  if (!request.gcpProjectId) throw createError('GCP project not provisioned yet', 400);

  const startIndex = request.identityUsers?.length || 0;
  const newUsers = await createIdentityUsers({
    accountCount: count,
    projectId: request.gcpProjectId,
    idMode: request.idMode,
    requestId: String(request._id),
    startIndex,
  });

  await assignProjectIamRoles({
    projectId: request.gcpProjectId,
    users: newUsers,
    permissions: request.permissions || [],
  });

  await Request.findByIdAndUpdate(requestId, {
    $push: { identityUsers: { $each: newUsers } },
    $inc: { accountCount: count },
    updatedAt: new Date(),
  });

  return { added: newUsers.length, users: newUsers };
}

export async function blockAllUsers(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  for (const user of request.identityUsers || []) {
    await suspendLabUser(requestId, user.userIndex);
  }

  return { blocked: request.identityUsers?.length || 0 };
}

export async function unblockAllUsers(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  for (const user of request.identityUsers || []) {
    await reinstateLabUser(requestId, user.userIndex);
  }

  return { unblocked: request.identityUsers?.length || 0 };
}

export async function unblockUser(requestId, userIndex) {
  await reinstateLabUser(requestId, userIndex);
  return { unblocked: true };
}

export async function getUserSessions(_requestId, _userIndex) {
  return { sessions: [] };
}

export async function getCleanupLogs(_requestId) {
  return { logs: [] };
}

export async function getLabHistory(_requestId) {
  return { events: [] };
}

export async function listAccessRequests() {
  return [];
}

export async function createAccessRequest() {
  return { id: null, status: 'pending' };
}

export async function reviewAccessRequest() {
  return { reviewed: true };
}

export async function getSharedCost(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  return {
    requestId,
    totalSpendUsd: (request.identityUsers || []).reduce(
      (sum, user) => sum + (user.currentSpend || 0),
      0
    ),
    users: [],
    lastSyncedAt: null,
  };
}

export async function sendPurchaseConfirmationMail(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const portalSession = await createManagePortalSession(request);
  const portalBase = await resolvePortalBaseUrl({ portalBaseUrl: request.portalBaseUrl });

  return {
    sent: false,
    portalUrl: `${portalBase}/manage-users/gcp?token=${portalSession.token}`,
    message: 'Purchase confirmation email template not wired yet.',
  };
}
