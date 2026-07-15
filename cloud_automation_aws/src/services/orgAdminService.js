import {
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from '@aws-sdk/client-iam';
import { iamClient } from '../config/aws.js';
import {
  buildPermissionPolicy,
  buildPermissionPolicyFromPolicyNames,
  SERVICE_IAM_POLICIES,
} from '../config/iamPolicies.js';
import Request from '../models/Request.js';
import UserSpend from '../models/UserSpend.js';
import BudgetEvent from '../models/BudgetEvent.js';
import AccessRequest from '../models/AccessRequest.js';
import CleanupLog from '../models/CleanupLog.js';
import HistorySnapshot from '../models/HistorySnapshot.js';
import CustomIamPolicyAssignment from '../models/CustomIamPolicyAssignment.js';
import SessionLog from '../models/SessionLog.js';
import { generateAndLogConsoleUrl } from './consoleAccessService.js';
import {
  cleanupUserResources,
  cleanupAllUsers,
  pauseUserResources,
  pauseAllUsers,
} from './resourceCleanupService.js';
import { countCleanupDeleted } from '../utils/cleanupMetrics.js';
import { createNotification } from './notificationService.js';
import { syncRequestUserSpend, fetchUserSpend } from './costTrackingService.js';
import { attachLiveUsageToUsers } from './userLiveUsageService.js';
import { syncRecentActivityForRequest, reconcileIdleSessionsForRequest } from './awsConsoleLoginMonitor.js';
import {
  getUserSessionStats,
  syncActiveMagicLinkUsageSessions,
} from './sessionTrackingService.js';
import {
  forceLogoutUser as forceLogoutUsageSession,
  formatMinutes,
  resolveUsageUserId,
  userIdFromIndex,
  userIndexFromUserId,
} from './usageService.js';
import { evaluateDailyUsageAccess, computeMagicLinkDurationSeconds } from '../utils/usageWindowAccess.js';
import {
  formatWindowSummary,
  getTodayWindowForRequest,
  getUserDailyLimitState,
} from '../utils/provisionedUsers.js';
import {
  getDailyLimitHours,
  getRequestTimezone,
  sumConsumedMinutesToday,
} from '../utils/usageWindowAccess.js';
import { DateTime } from 'luxon';
import { rollbackLabRoles } from '../provisioners/aws/iamRoleProvisioner.js';
import {
  deprovisionIdentityUsers,
  getIamClientForAccount,
} from '../provisioners/aws/identityProvisioner.js';

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function recordHistory(requestId, event, {
  userIndex = null,
  actor = 'org_admin',
  summary = null,
  snapshot = null,
} = {}) {
  return HistorySnapshot.create({ requestId, userIndex, event, actor, summary, snapshot });
}

function getRequestUser(request, userIndex) {
  const field = (request.accessType || 'magic_link') === 'identity_center'
    ? 'identityUsers'
    : 'labRoles';
  return { field, user: request[field]?.find((entry) => entry.userIndex === Number(userIndex)) };
}

function buildPolicyDocumentFromNames(policies = [], request = null) {
  if (request?.permissions?.length) {
    return buildPermissionPolicy(request);
  }

  return buildPermissionPolicyFromPolicyNames(policies);
}

function resolveUserPolicies(role, request) {
  if (Array.isArray(role.policies) && role.policies.length > 0) {
    return role.policies;
  }

  const flattened = [];
  for (const entry of request.permissions || []) {
    for (const policy of entry.policies || []) {
      flattened.push(policy);
    }
  }

  return [...new Set(flattened)];
}

function mapUsersFromRequest(request, spendRecords = []) {
  const accessType = request.accessType || 'magic_link';
  const sourceUsers =
    accessType === 'magic_link' ? request.labRoles || [] : request.identityUsers || [];

  const spendByIndex = new Map(
    spendRecords.map((record) => [String(record.userId ?? record.username), record])
  );

  return sourceUsers.map((role) => {
    const spend =
      spendByIndex.get(String(role.userIndex)) ||
      spendByIndex.get(role.username || `labuser${role.userIndex + 1}`);
    const policies = resolveUserPolicies(role, request);
    const username = role.username || `labuser${role.userIndex + 1}`;

    return {
      userIndex: role.userIndex,
      username,
      roleName: role.roleName || username,
      roleArn: role.roleArn,
      userId: role.userId || role.username || userIdFromIndex(role.userIndex),
      email: role.email,
      consoleUrl: role.consoleUrl,
      password: role.password,
      accountId: role.accountId || role.awsAccountId,
      status: role.suspended ? 'Suspended' : 'Active',
      suspended: role.suspended || false,
      budgetExceeded: role.budgetExceeded || false,
      currentSpend: spend?.spendUsd ?? role.currentSpend ?? 0,
      spendByService: spend?.services || [],
      lastCleanupAt: role.lastCleanupAt,
      cleanupLogs: role.cleanupLogs || [],
      cleanupDisabled: role.cleanupDisabled || false,
      cleanupIntervalOverride: role.cleanupIntervalOverride ?? null,
      cleanupEnabled: !role.cleanupDisabled,
      cleanupIntervalHours: role.cleanupIntervalOverride ?? request.cleanupIntervalHours ?? null,
      windowEnforcementPausedUntil: role.windowEnforcementPausedUntil || null,
      budgetTopUpUsd: role.budgetTopUpUsd || 0,
      permissionSetArn: role.permissionSetArn,
      needsActivation: role.needsActivation,
      policies,
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
    ];
  }

  const requests = await Request.find(query).sort({ createdAt: -1 });

  return requests.map((request) => ({
    requestId: String(request._id),
    requestName: request.requestName || null,
    customerEmail: request.customerEmail,
    region: request.region,
    status: request.status,
    costingMode: request.costingMode,
    accountCount: request.accountCount,
    startDate: request.startDate,
    endDate: request.endDate,
    estimatedPrice: request.estimatedPrice,
    awsAccountId: request.awsAccountId,
    userCount:
      (request.accessType === 'identity_center'
        ? request.identityUsers?.length
        : request.labRoles?.length) || 0,
    createdAt: request.createdAt,
    selectedServices: (request.selectedServices || []).map((service) => service.serviceName),
  }));
}

export async function getRequestDetail(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const today = new Date().toISOString().split('T')[0];
  const spendRecords = await UserSpend.find({ requestId, date: today });
  await syncActiveMagicLinkUsageSessions(requestId);

  try {
    await syncRecentActivityForRequest(String(request._id));
    await reconcileIdleSessionsForRequest(String(request._id));
  } catch (err) {
    console.warn(`[orgAdmin] Usage session reconcile failed for ${requestId}:`, err.message);
  }

  const requestForUsage = await Request.findById(requestId);
  const baseUsers = mapUsersFromRequest(requestForUsage || request, spendRecords);

  const enrichedUsers = await Promise.all(
    baseUsers.map(async (role) => {
      const sessionStats = await getUserSessionStats(String(request._id), role.userIndex);
      return {
        ...role,
        totalSessions: sessionStats.totalSessions,
        totalMins: sessionStats.totalMins,
        activeSession: sessionStats.activeSession,
        lastSessionAt: sessionStats.lastSessionAt,
        sessionHistory: sessionStats.sessionHistory,
      };
    })
  );

  const { users, liveSummary } = attachLiveUsageToUsers(requestForUsage || request, enrichedUsers);

  const timezone = getRequestTimezone(request);
  const nowInTz = DateTime.now().setZone(timezone);
  const todayWindow = getTodayWindowForRequest(request, nowInTz);
  const dailyLimitHours = getDailyLimitHours(request, nowInTz);

  return {
    requestId: String(request._id),
    requestName: request.requestName || null,
    customerEmail: request.customerEmail,
    region: request.region,
    status: request.status,
    costingMode: request.costingMode,
    accessType: request.accessType || 'magic_link',
    accountCount: request.accountCount,
    awsAccountId: request.awsAccountId,
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
    permissions: request.permissions || [],
    progress: request.progress,
    credentialsSent: request.credentialsSent,
    userCount: users.length,
    enableDailyUsage: Boolean(request.enableDailyUsage),
    usageWindows: request.usageWindows || [],
    timezone,
    dailyLimitHours,
    usageWindowSummary: formatWindowSummary(request.usageWindows || []),
    todayWindow: todayWindow
      ? {
          start:
            todayWindow.windowStartTime ??
            todayWindow.window_start_time ??
            todayWindow.startTime,
          end:
            todayWindow.windowEndTime ?? todayWindow.window_end_time ?? todayWindow.endTime,
        }
      : null,
    liveSummary,
    users,
  };
}

export async function getRequestUsers(requestId) {
  const detail = await getRequestDetail(requestId);
  return detail.users;
}

export async function generateUserConsoleUrl(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  if (request.accessType === 'identity_center') {
    const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
    if (!user) throw createError('User not found', 404);
    if (user.suspended) throw createError('User is suspended', 403);
    if (!user.consoleUrl) throw createError('Console URL not available for this user', 400);

    return {
      consoleUrl: user.consoleUrl,
      expiresAt: new Date(request.endDate).toISOString(),
      username: user.username,
      password: user.password,
    };
  }

  const role = request.labRoles?.find((entry) => entry.userIndex === userIndex);
  if (!role) throw createError('Role not found', 404);
  if (role.suspended) throw createError('User is suspended', 403);

  const access = evaluateDailyUsageAccess(request, resolveUsageUserId(request, userIndex));
  if (!access.allowed) {
    throw createError(access.message, 403);
  }

  const userId = resolveUsageUserId(request, userIndex);
  const durationSeconds = computeMagicLinkDurationSeconds(request, userId);
  if (durationSeconds <= 0) {
    throw createError('Daily usage limit reached. Access will reset at midnight.', 403);
  }

  const sessionName = `racko-admin-u${userIndex + 1}-${String(requestId).slice(-6)}`;
  const result = await generateAndLogConsoleUrl(requestId, userIndex, role.roleArn, sessionName, durationSeconds);

  await createNotification({
    type: 'console_access',
    title: 'AWS Console access generated',
    message: `Magic link generated for labuser${userIndex + 1} in Lab #${String(requestId).slice(-6)} by admin`,
    requestId,
  });

  return result;
}

export async function suspendLabUser(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const { revokeLabUserConsoleSessionsSafe } = await import('./awsSessionRevocationService.js');
  await revokeLabUserConsoleSessionsSafe(requestId, userIndex);

  const accessType = request.accessType || 'magic_link';

  if (accessType === 'identity_center') {
    const { suspendIdentityUser } = await import('../provisioners/aws/identityProvisioner.js');
    await suspendIdentityUser(request, userIndex);
    return;
  }

  const result = await Request.findOneAndUpdate(
    { _id: requestId, 'labRoles.userIndex': userIndex },
    { $set: { 'labRoles.$.suspended': true } },
    { new: true }
  );

  if (!result) throw createError('User not found', 404);
}

export async function reinstateLabUser(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const accessType = request.accessType || 'magic_link';
  const field = accessType === 'magic_link' ? 'labRoles' : 'identityUsers';
  const user = request[field]?.find((entry) => entry.userIndex === userIndex);
  if (!user) throw createError('User not found', 404);

  if (accessType === 'identity_center') {
    if (user.budgetExceeded) {
      const { reinstateUser } = await import('./budgetEnforcementService.js');
      await reinstateUser(request, user, accessType);
      return;
    }

    const { reinstateIdentityUser } = await import('../provisioners/aws/identityProvisioner.js');
    const { sendReinstateCredentialsEmail } = await import('../provisioners/aws/emailProvisioner.js');
    const newPassword = await reinstateIdentityUser(request, userIndex);
    await sendReinstateCredentialsEmail(request, { ...user, password: newPassword }, newPassword);
  } else {
    await Request.findOneAndUpdate(
      { _id: requestId, [`${field}.userIndex`]: userIndex },
      {
        $set: {
          [`${field}.$.suspended`]: false,
          [`${field}.$.budgetExceeded`]: false,
          [`${field}.$.currentSpend`]: 0,
        },
      }
    );
  }

  await Request.findOneAndUpdate(
    { _id: requestId },
    {
      $set: {
        'usageUserStates.$[state].dailyLimitReached': false,
        updatedAt: new Date(),
      },
    },
    { arrayFilters: [{ 'state.userId': resolveUsageUserId(request, userIndex) }] }
  );

  await createNotification({
    type: 'user_reinstated',
    title: 'User reinstated',
    message: `labuser${userIndex + 1} reinstated by admin in Lab #${String(requestId).slice(-6)}`,
    requestId,
  });
}

export async function deleteLabUser(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const { field, user } = getRequestUser(request, userIndex);
  if (!user) throw createError('User not found', 404);

  if (field === 'identityUsers') {
    await deprovisionIdentityUsers({
      identityUsers: [user],
      awsAccountId: request.awsAccountId,
    });
  } else {
    try {
      await iamClient.send(new DeleteRolePolicyCommand({
        RoleName: user.roleName,
        PolicyName: 'RackoLabPermissions',
      }));
      await iamClient.send(new DeleteRoleCommand({ RoleName: user.roleName }));
    } catch (err) {
      console.warn(`[orgAdmin] IAM role delete warning: ${err.message}`);
    }
  }

  await Request.findByIdAndUpdate(requestId, {
    $pull: { [field]: { userIndex } },
    $set: { updatedAt: new Date() },
  });
  await recordHistory(requestId, 'user_deleted', {
    userIndex,
    summary: `${user.username || user.roleName || `user ${userIndex}`} deleted`,
    snapshot: user.toObject?.() || user,
  });
}

export async function updateUserPermissions(requestId, userIndex, policies = []) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  if (!Array.isArray(policies)) throw createError('policies must be an array', 400);
  const { field, user } = getRequestUser(request, userIndex);
  if (!user) throw createError('User not found', 404);

  const policyDocument = buildPolicyDocumentFromNames(policies);
  if (field === 'identityUsers') {
    const client = await getIamClientForAccount(
      user.accountId || user.awsAccountId || request.awsAccountId
    );
    await client.send(new PutUserPolicyCommand({
      UserName: user.username,
      PolicyName: 'RackoLabPermissions',
      PolicyDocument: JSON.stringify(policyDocument),
    }));
  } else {
    await iamClient.send(new PutRolePolicyCommand({
      RoleName: user.roleName,
      PolicyName: 'RackoLabPermissions',
      PolicyDocument: JSON.stringify(policyDocument),
    }));
  }

  await Request.findOneAndUpdate(
    { _id: requestId, [`${field}.userIndex`]: userIndex },
    { $set: { [`${field}.$.policies`]: policies, updatedAt: new Date() } }
  );
  await recordHistory(requestId, 'permissions_updated', {
    userIndex,
    snapshot: { policies },
  });
}

export async function getUserCost(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const accessType = request.accessType || 'magic_link';
  const field = accessType === 'magic_link' ? 'labRoles' : 'identityUsers';
  const userRecord = request[field]?.find((entry) => entry.userIndex === userIndex);
  if (!userRecord) throw createError('User not found', 404);

  const username = userRecord.username || `labuser${userIndex + 1}`;
  const startDate = new Date(request.startDate);
  const endDate = new Date();
  const spend = await fetchUserSpend(username, requestId, startDate, endDate, accessType);

  const today = new Date().toISOString().split('T')[0];
  const todayRecord = await UserSpend.findOne({ requestId, username, date: today });

  return {
    username,
    totalSpend: spend.totalSpend,
    todaySpend: todayRecord?.spendUsd || 0,
    services: spend.services,
    budgetUsd: request.perUserBudgetUsd,
    budgetExceeded: userRecord.budgetExceeded || false,
    syncedAt: todayRecord?.syncedAt || null,
  };
}

export async function getRequestTotalCost(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const today = new Date().toISOString().split('T')[0];
  const spendRecords = await UserSpend.find({ requestId, date: today });

  const totalSpend = spendRecords.reduce((sum, record) => sum + (record.spendUsd || 0), 0);
  const byService = {};

  for (const record of spendRecords) {
    for (const service of record.services || []) {
      byService[service.serviceName] = (byService[service.serviceName] || 0) + service.spendUsd;
    }
  }

  return {
    totalSpend: parseFloat(totalSpend.toFixed(4)),
    byUser: spendRecords.map((record) => ({
      username: record.username,
      spendUsd: record.spendUsd,
    })),
    byService: Object.entries(byService).map(([name, spend]) => ({ name, spend })),
    estimatedPrice: request.estimatedPrice,
    syncedAt: spendRecords[0]?.syncedAt || null,
  };
}

export async function renewUserBudget(requestId, userIndex, topUpAmount) {
  const amount = Number(topUpAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError('topUpAmount must be positive', 400);
  }

  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const { field, user } = getRequestUser(request, userIndex);
  if (!user) throw createError('User not found', 404);

  const previousTopUp = Number(user.budgetTopUpUsd || 0);
  const newTopUp = previousTopUp + amount;
  const newBudget = Number(request.perUserBudgetUsd || 0) + newTopUp;

  if (field === 'identityUsers' && user.suspended) {
    const { reinstateIdentityUser } = await import('../provisioners/aws/identityProvisioner.js');
    await reinstateIdentityUser(request, userIndex);
  }

  await Request.findOneAndUpdate(
    { _id: requestId, [`${field}.userIndex`]: userIndex },
    {
      $set: {
        [`${field}.$.budgetExceeded`]: false,
        [`${field}.$.suspended`]: false,
        [`${field}.$.currentSpend`]: 0,
        [`${field}.$.budgetTopUpUsd`]: newTopUp,
        updatedAt: new Date(),
      },
    }
  );

  await BudgetEvent.create({
    requestId,
    username: user.username || `labuser${userIndex + 1}`,
    userId: String(userIndex),
    spendUsd: 0,
    budgetUsd: newBudget,
    action: 'reinstated',
    reason: `Budget renewed by org admin. Top-up: $${amount}`,
  });

  await createNotification({
    type: 'budget_renewed',
    title: 'Budget renewed',
    message: `Budget renewed for labuser${userIndex + 1} in Lab #${String(requestId).slice(-6)} — +$${amount} added by org admin`,
    requestId,
  });

  await recordHistory(requestId, 'budget_renewed', {
    userIndex,
    snapshot: { topUpAmount: amount, previousTopUp, newTotalBudget: newBudget },
  });
  return { newTotalBudget: newBudget, topUpAmount: amount, previousTopUp };
}

export async function triggerUserCleanup(requestId, userIndex, { action = 'delete', actor = 'org_admin' } = {}) {
  if (!['delete', 'pause'].includes(action)) {
    throw createError("action must be 'delete' or 'pause'.", 400);
  }
  const log = await CleanupLog.create({ requestId, userIndex, action, triggeredBy: actor });
  let results;
  try {
    results = action === 'pause'
      ? await pauseUserResources(requestId, userIndex)
      : await cleanupUserResources(requestId, userIndex);
    const deletedCount = countCleanupDeleted(results);
    await CleanupLog.updateOne({ _id: log._id }, {
      status: 'success',
      totalDeleted: deletedCount,
      results,
      completedAt: new Date(),
    });

    await createNotification({
      type: 'cleanup_ran',
      title: action === 'pause' ? 'AWS resource pause completed' : 'AWS resource cleanup completed',
      message: `Lab ${action} ran for labuser${userIndex + 1} — ${deletedCount} resource action(s) applied`,
      requestId,
      metadata: results,
    });
    await recordHistory(requestId, 'user_cleanup', {
      userIndex,
      actor,
      snapshot: { action, deletedCount, results },
    });

    return { action, results, deletedCount };
  } catch (err) {
    await CleanupLog.updateOne({ _id: log._id }, {
      status: 'failed',
      error: err.message,
      completedAt: new Date(),
    });
    throw err;
  }
}

export async function triggerAllCleanup(requestId, { action = 'delete', actor = 'org_admin' } = {}) {
  if (!['delete', 'pause'].includes(action)) {
    throw createError("action must be 'delete' or 'pause'.", 400);
  }
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  const log = await CleanupLog.create({ requestId, action, triggeredBy: actor });
  try {
    const results = action === 'pause'
      ? await pauseAllUsers(requestId)
      : await cleanupAllUsers(requestId);
    const deletedCount = results.reduce((sum, entry) => sum + countCleanupDeleted(entry), 0);
    await CleanupLog.updateOne({ _id: log._id }, {
      status: 'success',
      totalDeleted: deletedCount,
      results,
      completedAt: new Date(),
    });
    await Request.findByIdAndUpdate(requestId, {
      resourceCleanupLastRanAt: new Date(),
      updatedAt: new Date(),
    });
    await recordHistory(requestId, 'request_cleanup', {
      actor,
      snapshot: { action, deletedCount, results },
    });
    return { action, results, deletedCount, totalDeleted: deletedCount };
  } catch (err) {
    await CleanupLog.updateOne({ _id: log._id }, {
      status: 'failed',
      error: err.message,
      completedAt: new Date(),
    });
    throw err;
  }
}

export async function updateCleanupSettings(requestId, userIndex, settings) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  const { field, user } = getRequestUser(request, userIndex);
  if (!user) throw createError('User not found', 404);
  const cleanupDisabled = settings.cleanupDisabled ??
    (settings.cleanupEnabled !== undefined ? !Boolean(settings.cleanupEnabled) : undefined);
  const cleanupIntervalOverride = settings.cleanupIntervalOverride ?? settings.cleanupIntervalHours;
  const updates = {};
  if (cleanupDisabled !== undefined) updates[`${field}.$.cleanupDisabled`] = Boolean(cleanupDisabled);
  if (cleanupIntervalOverride !== undefined) {
    const interval = cleanupIntervalOverride === null ? null : Number(cleanupIntervalOverride);
    if (interval !== null && (!Number.isFinite(interval) || interval < 1 || interval > 24)) {
      throw createError('cleanupIntervalOverride must be between 1 and 24 hours', 400);
    }
    updates[`${field}.$.cleanupIntervalOverride`] = interval;
  }
  if (!Object.keys(updates).length) throw createError('No fields to update', 400);
  updates.updatedAt = new Date();
  await Request.findOneAndUpdate(
    { _id: requestId, [`${field}.userIndex`]: Number(userIndex) },
    { $set: updates }
  );
  await recordHistory(requestId, 'cleanup_settings_updated', {
    userIndex: Number(userIndex),
    snapshot: { cleanupDisabled, cleanupIntervalOverride },
  });
}

export async function updateRequestCleanupSettings(requestId, settings) {
  const updates = {};
  if (settings.cleanupEnabled !== undefined) updates.cleanupEnabled = Boolean(settings.cleanupEnabled);
  if (settings.enableResourceCleanup !== undefined) {
    updates.enableResourceCleanup = Boolean(settings.enableResourceCleanup);
  }
  const interval = settings.resourceCleanupIntervalHours ?? settings.cleanupIntervalHours;
  if (interval !== undefined) {
    const number = Number(interval);
    if (!Number.isFinite(number) || number < 1 || number > 24) {
      throw createError('cleanup interval must be between 1 and 24 hours', 400);
    }
    updates.cleanupIntervalHours = number;
    updates.resourceCleanupIntervalHours = number;
    updates.resourceCleanupNextRunAt = new Date(Date.now() + number * 3600000);
  }
  if (settings.action !== undefined) {
    if (!['delete', 'pause'].includes(settings.action)) {
      throw createError("action must be 'delete' or 'pause'.", 400);
    }
    updates.resourceCleanupAction = settings.action;
  }
  if (!Object.keys(updates).length) throw createError('No fields to update', 400);
  updates.updatedAt = new Date();
  const request = await Request.findByIdAndUpdate(requestId, updates, { new: true });
  if (!request) throw createError('Request not found', 404);
  await recordHistory(requestId, 'request_cleanup_settings_updated', { snapshot: updates });
  return request;
}

export async function syncRequestSpend(requestId) {
  return syncRequestUserSpend(requestId);
}

export function getAvailableIamPolicies() {
  return Object.entries(SERVICE_IAM_POLICIES).map(([service, policies]) => ({
    service,
    policies,
  }));
}

export async function getDailyUsageForRequest(requestId) {
  await syncActiveMagicLinkUsageSessions(requestId);
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const timezone = getRequestTimezone(request);
  const nowInTz = DateTime.now().setZone(timezone);
  const todayDate = nowInTz.toISODate();
  const todayWindow = getTodayWindowForRequest(request, nowInTz);
  const dailyLimitHours = getDailyLimitHours(request, nowInTz);
  const dailyLimitMinutes = dailyLimitHours != null ? dailyLimitHours * 60 : null;
  const accessType = request.accessType || 'magic_link';
  const sourceUsers =
    accessType === 'identity_center' ? request.identityUsers || [] : request.labRoles || [];

  const data = sourceUsers.map((entry) => {
    const userId = resolveUsageUserId(request, entry.userIndex);
    const userSessions = (request.usageSessions || []).filter(
      (session) => session.userId === userId
    );
    const consumedMinutes = Math.round(
      sumConsumedMinutesToday(userSessions, todayDate, timezone)
    );
    const state = getUserDailyLimitState(request, userId);
    const limitReached = Boolean(state?.dailyLimitReached);
    const remainingMinutes =
      dailyLimitMinutes != null ? Math.max(0, dailyLimitMinutes - consumedMinutes) : null;

    return {
      userIndex: entry.userIndex,
      username: entry.username || userId,
      accountEnabled: !entry.suspended,
      limitReached,
      dailyLimitHours: dailyLimitHours != null ? Number(dailyLimitHours) : null,
      consumedMinutes,
      remainingMinutes,
      consumedFormatted: formatMinutes(consumedMinutes),
      remainingFormatted: remainingMinutes != null ? formatMinutes(remainingMinutes) : null,
      todayWindow: todayWindow
        ? {
            start:
              todayWindow.windowStartTime ??
              todayWindow.window_start_time ??
              todayWindow.startTime,
            end:
              todayWindow.windowEndTime ?? todayWindow.window_end_time ?? todayWindow.endTime,
          }
        : null,
    };
  });

  return {
    data,
    timezone,
    date: todayDate,
  };
}

export async function getMonitoringLogs(requestId, { userIndex = null, limit = 50 } = {}) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const resolvedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const userId =
    userIndex != null && userIndex !== ''
      ? resolveUsageUserId(request, Number(userIndex))
      : null;

  let sessions = [...(request.usageSessions || [])];
  if (userId) {
    sessions = sessions.filter((session) => session.userId === userId);
  }

  sessions.sort((a, b) => new Date(b.loginAt) - new Date(a.loginAt));
  sessions = sessions.slice(0, resolvedLimit);

  const usageSessions = sessions.map((session) => {
    const loginAt = new Date(session.loginAt);
    const logoutAt = session.logoutAt ? new Date(session.logoutAt) : null;
    const currentSessionMinutes = logoutAt
      ? null
      : Math.floor((Date.now() - loginAt.getTime()) / 60000);

    return {
      id: String(session._id),
      requestId: String(request._id),
      userIndex: userIndexFromUserId(session.userId, request),
      username: session.username || session.userId,
      loginAt: session.loginAt,
      logoutAt: session.logoutAt || null,
      minutesUsed: session.minutesUsed ?? null,
      currentSessionMinutes,
      isActive: !session.logoutAt,
    };
  });

  return {
    usageSessions,
    enforcementLogs: [],
    auditLogs: [],
  };
}

export async function forceLogoutUser(requestId, userIndex) {
  return forceLogoutUsageSession({ requestId, userIndex: Number(userIndex) });
}

export async function deleteRequest(requestId, { actor = 'org_admin' } = {}) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  const auditSnapshot = {
    customerEmail: request.customerEmail,
    requestName: request.requestName,
    region: request.region,
    accessType: request.accessType,
    userCount: (request.accessType === 'identity_center'
      ? request.identityUsers
      : request.labRoles
    )?.length || 0,
    selectedServices: (request.selectedServices || []).map((service) => service.serviceName),
  };

  // Stop schedulers from picking this request / sending cleanup emails during teardown.
  await Request.findByIdAndUpdate(requestId, {
    cleanupEnabled: false,
    enableResourceCleanup: false,
    resourceCleanupNextRunAt: null,
    cleanupNextRunAt: null,
    updatedAt: new Date(),
  });

  try {
    await cleanupAllUsers(requestId);
  } catch (err) {
    console.warn(`[orgAdmin] Resource cleanup before request deletion failed: ${err.message}`);
  }
  if ((request.accessType || 'magic_link') === 'identity_center') {
    await deprovisionIdentityUsers(request);
  } else {
    await rollbackLabRoles(request.labRoles || []);
  }

  await Promise.all([
    SessionLog.deleteMany({ requestId }),
    UserSpend.deleteMany({ requestId }),
    BudgetEvent.deleteMany({ requestId }),
    AccessRequest.updateMany({ requestId }, { $set: { requestId: null } }),
    CustomIamPolicyAssignment.updateMany(
      { requestId, active: true },
      { $set: { active: false } }
    ),
  ]);
  await Request.deleteOne({ _id: requestId });
  await recordHistory(requestId, 'request_deleted', {
    actor,
    summary: `Request ${requestId} deleted`,
    snapshot: auditSnapshot,
  });
  return { requestId, deleted: true };
}

export async function reprovisionPermissions(requestId, { actor = 'org_admin' } = {}) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  const users = (request.accessType || 'magic_link') === 'identity_center'
    ? request.identityUsers || []
    : request.labRoles || [];
  const failures = [];
  let usersProcessed = 0;
  for (const user of users) {
    try {
      await updateUserPermissions(requestId, user.userIndex, resolveUserPolicies(user, request));
      usersProcessed += 1;
    } catch (err) {
      failures.push({ userIndex: user.userIndex, error: err.message });
    }
  }
  const result = {
    success: failures.length === 0,
    usersProcessed,
    rolesProvisioned: usersProcessed,
    assignmentsMade: usersProcessed,
    permissionsComplete: failures.length === 0,
    permissionFailures: failures,
  };
  await recordHistory(requestId, 'permissions_reprovisioned', { actor, snapshot: result });
  return result;
}

export async function repairPermissions(requestId, options = {}) {
  return reprovisionPermissions(requestId, options);
}

export async function unblockUser(requestId, userIndex, {
  actor = 'org_admin',
  resetUsage = true,
  pauseWindowEnforcement = true,
  pauseWindowHours = 24,
} = {}) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  const { field, user } = getRequestUser(request, userIndex);
  if (!user) throw createError('User not found', 404);
  if (user.suspended && field === 'identityUsers') {
    const { reinstateIdentityUser } = await import('../provisioners/aws/identityProvisioner.js');
    await reinstateIdentityUser(request, Number(userIndex));
  }

  const pauseUntil = pauseWindowEnforcement
    ? new Date(Date.now() + Math.max(Number(pauseWindowHours) || 24, 1) * 3600000)
    : null;
  const set = {
    [`${field}.$.suspended`]: false,
    [`${field}.$.budgetExceeded`]: false,
    [`${field}.$.windowEnforcementPausedUntil`]: pauseUntil,
    updatedAt: new Date(),
  };
  if (resetUsage) {
    set['usageUserStates.$[state].dailyLimitReached'] = false;
  }
  await Request.findOneAndUpdate(
    { _id: requestId, [`${field}.userIndex`]: Number(userIndex) },
    { $set: set },
    {
      arrayFilters: resetUsage
        ? [{ 'state.userId': resolveUsageUserId(request, Number(userIndex)) }]
        : undefined,
    }
  );
  if (resetUsage) {
    const userId = resolveUsageUserId(request, Number(userIndex));
    await Request.updateOne(
      { _id: requestId },
      {
        $set: {
          'usageSessions.$[session].logoutAt': new Date(),
          'usageSessions.$[session].minutesUsed': 0,
        },
      },
      { arrayFilters: [{ 'session.userId': userId, 'session.logoutAt': null }] }
    );
  }
  const result = {
    userIndex: Number(userIndex),
    username: user.username || `labuser${Number(userIndex) + 1}`,
    resetUsage,
    pauseWindowEnforcement,
    windowEnforcementPausedUntil: pauseUntil,
  };
  await recordHistory(requestId, 'user_unblocked', {
    userIndex: Number(userIndex),
    actor,
    snapshot: result,
  });
  return result;
}

export async function getUserSessions(requestId, userIndex, { limit = 50 } = {}) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  const { user } = getRequestUser(request, userIndex);
  if (!user) throw createError('User not found', 404);
  const resolvedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const sessions = await SessionLog.find({ requestId, userIndex: Number(userIndex) })
    .sort({ startedAt: -1 })
    .limit(resolvedLimit)
    .lean();
  return sessions.map((session) => ({
    id: String(session._id),
    loginAt: session.startedAt,
    logoutAt: session.endedAt || null,
    minutesUsed: session.status === 'active'
      ? Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000))
      : session.durationMins,
    endedReason: session.status,
    ipAddress: session.ipAddress || null,
    status: session.status === 'active' ? 'Active' : session.status,
    isActive: session.status === 'active',
  }));
}

export async function getCleanupLogs(requestId, { limit = 20 } = {}) {
  if (!(await Request.exists({ _id: requestId }))) throw createError('Request not found', 404);
  return CleanupLog.find({ requestId })
    .sort({ ranAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 100))
    .lean();
}

export async function getLabHistory(requestId, { userIndex = null, limit = 200 } = {}) {
  if (!(await Request.exists({ _id: requestId }))) throw createError('Request not found', 404);
  const query = { requestId };
  if (userIndex !== null && userIndex !== '') query.userIndex = Number(userIndex);
  const rows = await HistorySnapshot.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 200, 1), 500))
    .lean();
  return {
    requestId: String(requestId),
    entries: rows.map((row) => ({
      id: String(row._id),
      type: row.event,
      at: row.createdAt,
      userIndex: row.userIndex,
      title: row.summary || row.event.replace(/_/g, ' '),
      subtitle: row.actor,
      status: row.snapshot?.status,
      costUsd: row.snapshot?.costUsd,
      resourcesDeleted: row.snapshot?.deletedCount,
      details: row.snapshot,
    })),
  };
}

export async function listAccessRequests({ status, requestId } = {}) {
  const query = {};
  if (status) query.status = String(status).toLowerCase();
  if (requestId) query.requestId = requestId;
  const rows = await AccessRequest.find(query).sort({ createdAt: -1 });
  return rows.map((row) => row.toJSON());
}

export async function createAccessRequest(fields = {}) {
  if (!fields.customerEmail || !fields.serviceName || !fields.requestedAccess) {
    throw createError('customerEmail, serviceName, and requestedAccess are required', 400);
  }
  if (fields.requestId && !(await Request.exists({ _id: fields.requestId }))) {
    throw createError('Linked request not found', 404);
  }
  const request = await AccessRequest.create({
    requestId: fields.requestId || undefined,
    customerEmail: fields.customerEmail,
    serviceId: fields.serviceId || undefined,
    serviceName: fields.serviceName,
    defaultPolicy: fields.defaultPolicy,
    requestedAccess: fields.requestedAccess,
    requestedPolicies: fields.requestedPolicies || [],
    accountCount: fields.accountCount,
  });
  return request.toJSON();
}

export async function reviewAccessRequest(id, {
  status,
  reviewNotes,
  reviewedBy = 'org_admin',
} = {}) {
  const normalized = String(status || '').toLowerCase();
  if (!['approved', 'rejected'].includes(normalized)) {
    throw createError('status must be approved or rejected', 400);
  }
  const accessRequest = await AccessRequest.findOneAndUpdate(
    { _id: id, status: 'pending' },
    {
      status: normalized,
      reviewNotes,
      reviewedBy,
      reviewedAt: new Date(),
    },
    { new: true }
  );
  if (!accessRequest) throw createError('Access request not found or already reviewed', 404);

  if (normalized === 'approved' && accessRequest.requestId) {
    try {
      const request = await Request.findById(accessRequest.requestId);
      if (!request) throw createError('Linked request not found', 404);
      const users = (request.accessType || 'magic_link') === 'identity_center'
        ? request.identityUsers || []
        : request.labRoles || [];
      const requestedPolicies = accessRequest.requestedPolicies?.length
        ? accessRequest.requestedPolicies
        : String(accessRequest.requestedAccess || '')
            .split(/[,;\n]+/)
            .map((value) => value.trim())
            .filter(Boolean);
      for (const user of users) {
        const merged = [...new Set([...resolveUserPolicies(user, request), ...requestedPolicies])];
        await updateUserPermissions(request._id, user.userIndex, merged);
      }
      accessRequest.accessApplied = true;
      accessRequest.fulfillmentError = undefined;
      await accessRequest.save();
    } catch (err) {
      accessRequest.fulfillmentError = err.message;
      await accessRequest.save();
    }
  }
  if (accessRequest.requestId) {
    await recordHistory(accessRequest.requestId, 'access_request_reviewed', {
      actor: reviewedBy,
      snapshot: {
        accessRequestId: accessRequest._id,
        status: normalized,
        accessApplied: accessRequest.accessApplied,
        fulfillmentError: accessRequest.fulfillmentError,
      },
    });
  }
  return accessRequest;
}

export function computeSharedCostAttribution(totalSpend, users = [], sessions = []) {
  const minutesByUser = new Map(users.map((user) => [Number(user.userIndex), 0]));
  for (const session of sessions) {
    const matchedUser = users.find(
      (user) => user.userId === session.userId || user.username === session.userId
    );
    const userIndex = matchedUser?.userIndex ?? userIndexFromUserId(session.userId);
    if (!minutesByUser.has(userIndex)) continue;
    const minutes = session.minutesUsed ?? (
      session.logoutAt
        ? Math.max(0, (new Date(session.logoutAt) - new Date(session.loginAt)) / 60000)
        : Math.max(0, (Date.now() - new Date(session.loginAt).getTime()) / 60000)
    );
    minutesByUser.set(userIndex, minutesByUser.get(userIndex) + Number(minutes || 0));
  }
  const totalMinutes = [...minutesByUser.values()].reduce((sum, value) => sum + value, 0);
  return users.map((user) => {
    const minutes = minutesByUser.get(Number(user.userIndex)) || 0;
    const ratio = totalMinutes > 0 ? minutes / totalMinutes : (users.length ? 1 / users.length : 0);
    return {
      userIndex: user.userIndex,
      username: user.username || `labuser${Number(user.userIndex) + 1}`,
      mergedMinutesMtd: Number(minutes.toFixed(2)),
      sharePercent: Number((ratio * 100).toFixed(2)),
      monthToDateCost: Number((Number(totalSpend || 0) * ratio).toFixed(4)),
      attributionMethod: totalMinutes > 0 ? 'proportional' : 'equal_split',
    };
  });
}

export async function getSharedCost(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  if (request.costingMode === 'per_user') {
    throw createError('Shared AWS cost is only available for shared costing mode', 400);
  }
  const users = (request.accessType || 'magic_link') === 'identity_center'
    ? request.identityUsers || []
    : request.labRoles || [];
  const cost = await getRequestTotalCost(requestId);
  const attributed = computeSharedCostAttribution(cost.totalSpend, users, request.usageSessions || []);
  return {
    requestId: String(request._id),
    costingMode: request.costingMode,
    monthToDateCost: cost.totalSpend,
    lifetimeCost: cost.totalSpend,
    currency: 'USD',
    totalMergedMinutesMtd: attributed.reduce((sum, entry) => sum + entry.mergedMinutesMtd, 0),
    queriedAt: new Date().toISOString(),
    users: attributed,
    dataFreshnessNote: 'AWS Cost Explorer data may be delayed by several hours.',
  };
}
