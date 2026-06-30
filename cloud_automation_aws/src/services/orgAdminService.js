import {
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  PutRolePolicyCommand,
} from '@aws-sdk/client-iam';
import { iamClient } from '../config/aws.js';
import {
  INLINE_IAM_POLICIES,
  INLINE_IAM_POLICY_ALIASES,
  SERVICE_IAM_POLICIES,
} from '../config/iamPolicies.js';
import Request from '../models/Request.js';
import UserSpend from '../models/UserSpend.js';
import BudgetEvent from '../models/BudgetEvent.js';
import { generateAndLogConsoleUrl } from './consoleAccessService.js';
import { cleanupUserResources, cleanupAllUsers } from './resourceCleanupService.js';
import { syncRequestUserSpend, fetchUserSpend } from './costTrackingService.js';
import { attachLiveUsageToUsers } from './userLiveUsageService.js';
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

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildPolicyDocumentFromNames(policies = []) {
  const statements = [];

  for (const policyName of policies) {
    const inlineKey = INLINE_IAM_POLICY_ALIASES[policyName] || policyName;
    const inline = INLINE_IAM_POLICIES[inlineKey];
    if (inline) {
      statements.push(...inline.Statement);
    }
  }

  if (statements.length === 0) {
    statements.push({
      Effect: 'Allow',
      Action: ['*:Describe*', '*:List*', '*:Get*'],
      Resource: '*',
    });
  }

  statements.push({
    Sid: 'AllowTagging',
    Effect: 'Allow',
    Action: ['ec2:CreateTags', 'rds:AddTagsToResource', 's3:PutObjectTagging'],
    Resource: '*',
  });

  return {
    Version: '2012-10-17',
    Statement: statements,
  };
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
      userId: role.userId,
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
      permissionSetArn: role.permissionSetArn,
      needsActivation: role.needsActivation,
      policies,
    };
  });
}

function countCleanupDeleted(results) {
  if (!results || typeof results !== 'object') return 0;

  let count = 0;
  for (const value of Object.values(results)) {
    if (!value || typeof value !== 'object' || value.error) continue;
    count += Number(value.terminated || 0);
    count += Number(value.deleted || 0);
  }
  return count;
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
  return generateAndLogConsoleUrl(requestId, userIndex, role.roleArn, sessionName, durationSeconds);
}

export async function suspendLabUser(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

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
    } else {
      const { reinstateIdentityUser } = await import('../provisioners/aws/identityProvisioner.js');
      const { sendReinstateCredentialsEmail } = await import('../provisioners/aws/emailProvisioner.js');
      const newPassword = await reinstateIdentityUser(request, userIndex);
      await sendReinstateCredentialsEmail(request, { ...user, password: newPassword }, newPassword);
    }
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
}

export async function deleteLabUser(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const role = request.labRoles?.find((entry) => entry.userIndex === userIndex);
  if (!role) throw createError('Role not found', 404);

  try {
    await iamClient.send(
      new DeleteRolePolicyCommand({
        RoleName: role.roleName,
        PolicyName: 'RackoLabPermissions',
      })
    );
    await iamClient.send(new DeleteRoleCommand({ RoleName: role.roleName }));
  } catch (err) {
    console.warn(`[orgAdmin] IAM role delete warning: ${err.message}`);
  }

  await Request.findByIdAndUpdate(requestId, {
    $pull: { labRoles: { userIndex } },
  });
}

export async function updateUserPermissions(requestId, userIndex, policies = []) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const role = request.labRoles?.find((entry) => entry.userIndex === userIndex);
  if (!role) throw createError('Role not found', 404);

  const policyDocument = buildPolicyDocumentFromNames(policies);

  await iamClient.send(
    new PutRolePolicyCommand({
      RoleName: role.roleName,
      PolicyName: 'RackoLabPermissions',
      PolicyDocument: JSON.stringify(policyDocument),
    })
  );

  await Request.findOneAndUpdate(
    { _id: requestId, 'labRoles.userIndex': userIndex },
    { $set: { 'labRoles.$.policies': policies } }
  );
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

  const role = request.labRoles?.find((entry) => entry.userIndex === userIndex);
  if (!role) throw createError('User not found', 404);

  const newBudget = (request.perUserBudgetUsd || 0) + amount;

  await Request.findByIdAndUpdate(requestId, {
    perUserBudgetUsd: newBudget,
  });

  await Request.findOneAndUpdate(
    { _id: requestId, 'labRoles.userIndex': userIndex },
    {
      $set: {
        'labRoles.$.budgetExceeded': false,
        'labRoles.$.suspended': false,
        'labRoles.$.currentSpend': 0,
      },
    }
  );

  await BudgetEvent.create({
    requestId,
    username: `labuser${userIndex + 1}`,
    userId: String(userIndex),
    spendUsd: 0,
    budgetUsd: newBudget,
    action: 'reinstated',
    reason: `Budget renewed by org admin. Top-up: $${amount}`,
  });

  return { newTotalBudget: newBudget, topUpAmount: amount };
}

export async function triggerUserCleanup(requestId, userIndex) {
  const results = await cleanupUserResources(requestId, userIndex);
  return {
    results,
    deletedCount: countCleanupDeleted(results),
  };
}

export async function triggerAllCleanup(requestId) {
  const results = await cleanupAllUsers(requestId);
  const deletedCount = results.reduce(
    (sum, entry) => sum + countCleanupDeleted(entry),
    0
  );
  return { results, deletedCount };
}

export async function updateCleanupSettings(requestId, _userIndex, settings) {
  const { cleanupEnabled, cleanupIntervalHours } = settings;

  const updates = {};
  if (cleanupEnabled !== undefined) updates.cleanupEnabled = Boolean(cleanupEnabled);
  if (cleanupIntervalHours !== undefined) {
    updates.cleanupIntervalHours = cleanupIntervalHours;
  }

  if (Object.keys(updates).length === 0) {
    throw createError('No fields to update', 400);
  }

  const result = await Request.findByIdAndUpdate(requestId, updates, { new: true });
  if (!result) throw createError('Request not found', 404);
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
