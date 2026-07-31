import { fetchFinalSpend } from './costTrackingService.js';
import Request from '../models/Request.js';
import { cleanupAllUsers, pauseAllUsers } from './resourceCleanupService.js';
import { rollbackLabRoles } from '../provisioners/aws/iamRoleProvisioner.js';
import { deprovisionIdentityUsers } from '../provisioners/aws/identityProvisioner.js';
import { rollbackPermissionSets } from '../provisioners/aws/permissionSetProvisioner.js';
import { rollbackAssignments } from '../provisioners/aws/accountAssignmentProvisioner.js';
import { rollbackScpResources } from '../provisioners/aws/scpProvisioner.js';
import { countCleanupDeleted } from '../utils/cleanupMetrics.js';
import { computeNextDailyCleanupRunAt } from '../utils/resourceCleanupSchedule.js';
import CleanupLog from '../models/CleanupLog.js';
import HistorySnapshot from '../models/HistorySnapshot.js';

export async function runExpiryCleanupForRequest(request) {
  const requestId = String(request._id);
  const isMagicLink = request.accessType !== 'identity_center';
  const labRoles = [...(request.labRoles || [])];
  const identityUsers = [...(request.identityUsers || [])];
  const permissionSetArns = [...(request.permissionSetArns || [])];
  const provisionedResources = request.provisionedResources || {};

  console.log(`[labExpiryCleanup] Starting full cleanup for request ${requestId}`);

  try {
    await fetchFinalSpend(request);
    console.log(`[labExpiryCleanup] Final spend stored for request ${requestId}`);
  } catch (err) {
    console.error(`[labExpiryCleanup] Final spend fetch failed for ${requestId}:`, err.message);
  }

  const resourceResults = await cleanupAllUsers(requestId);
  const deletedCount = countCleanupDeleted(resourceResults);

  let rolesRemoved = 0;
  let usersRemoved = 0;

  if (isMagicLink && labRoles.length) {
    await rollbackLabRoles(labRoles);
    rolesRemoved = labRoles.length;
  } else if (identityUsers.length) {
    await deprovisionIdentityUsers(request);
    usersRemoved = identityUsers.length;
  }

  if (provisionedResources.assignments?.length) {
    await rollbackAssignments(provisionedResources.assignments);
  }

  if (permissionSetArns.length) {
    await rollbackPermissionSets(permissionSetArns);
  }

  await rollbackScpResources(provisionedResources);

  const now = new Date();

  await Request.findByIdAndUpdate(requestId, {
    status: 'Expired',
    expiredAt: now,
    cleanupCompleted: true,
    expiryCleanupAt: now,
    cleanupEnabled: false,
    enableResourceCleanup: false,
    resourceCleanupNextRunAt: null,
    cleanupNextRunAt: null,
    labRoles: [],
    identityUsers: [],
    permissionSetArns: [],
    provisionedResources: {
      ou: null,
      scps: [],
      assignments: [],
      accounts: [],
      targetAccountId: null,
      scpSkipped: Boolean(provisionedResources.scpSkipped),
      scpSkipReason: provisionedResources.scpSkipReason || null,
    },
    updatedAt: now,
    $push: {
      cleanupLogs: {
        ranAt: now,
        message: `Lab expired — removed ${deletedCount} resource(s), ${rolesRemoved} role(s), ${usersRemoved} user(s)`,
      },
    },
  });
  await CleanupLog.create({
    requestId,
    action: 'delete',
    triggeredBy: 'expiry',
    status: 'success',
    totalDeleted: deletedCount,
    results: resourceResults,
    ranAt: now,
    completedAt: now,
  });
  await HistorySnapshot.create({
    requestId,
    event: 'request_expired',
    actor: 'expiry_scheduler',
    summary: `Lab expired and ${deletedCount} resource(s) were removed`,
    snapshot: { deletedCount, rolesRemoved, usersRemoved },
  });

  console.log(
    `[labExpiryCleanup] Completed for request ${requestId}: ${deletedCount} resources, ${rolesRemoved} roles, ${usersRemoved} users`
  );

  return {
    requestId,
    customerEmail: request.customerEmail,
    deletedCount,
    rolesRemoved,
    usersRemoved,
    resourceResults,
    cleanedAt: now,
    endDate: request.endDate,
  };
}

export async function runScheduledResourceCleanupForRequest(request) {
  const requestId = String(request._id);
  const action = request.resourceCleanupAction || 'delete';
  const results = action === 'pause'
    ? await pauseAllUsers(requestId, { respectUserSettings: true })
    : await cleanupAllUsers(requestId, { respectUserSettings: true });
  const deletedCount = countCleanupDeleted(results);

  const now = new Date();
  let nextRun;
  let intervalHours;

  if (request.resourceCleanupTime) {
    intervalHours = 24;
    nextRun = computeNextDailyCleanupRunAt({
      timeHHMM: request.resourceCleanupTime,
      timezone: request.resourceCleanupTimezone || request.timezone || 'Asia/Kolkata',
      after: now,
    });
  } else {
    intervalHours =
      request.resourceCleanupIntervalHours || request.cleanupIntervalHours || 4;
    nextRun = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
  }

  await Request.findByIdAndUpdate(requestId, {
    resourceCleanupLastRanAt: now,
    resourceCleanupNextRunAt: nextRun,
    updatedAt: now,
    $push: {
      cleanupLogs: {
        ranAt: now,
        message: `Scheduled resource ${action} applied ${deletedCount} action(s)`,
      },
    },
  });
  await CleanupLog.create({
    requestId,
    action,
    triggeredBy: 'scheduler',
    status: 'success',
    totalDeleted: deletedCount,
    results,
    ranAt: now,
    completedAt: now,
  });

  try {
    const { captureUserLabMetrics, recordCleanupSnapshot } = await import('./labHistoryService.js');
    const accessType = request.accessType || 'magic_link';
    const sourceUsers =
      accessType === 'identity_center' ? request.identityUsers || [] : request.labRoles || [];
    for (const user of sourceUsers) {
      if (user.deletedAt) continue;
      const metrics = await captureUserLabMetrics(requestId, user.userIndex);
      const perUserDeleted = countCleanupDeleted(
        (results || []).find((entry) => Number(entry.userIndex) === Number(user.userIndex)) || {}
      );
      await recordCleanupSnapshot({
        requestId,
        userIndex: user.userIndex,
        triggeredBy: 'scheduler',
        cleanupAction: action,
        resourcesDeleted: perUserDeleted,
        metrics: metrics
          ? {
              ...metrics,
              resourceCount: Math.max(Number(metrics.resourceCount || 0), perUserDeleted),
            }
          : null,
      });
    }
  } catch (err) {
    console.warn(`[labExpiryCleanup] Failed to record cleanup snapshots: ${err.message}`);
  }

  await HistorySnapshot.create({
    requestId,
    event: 'scheduled_cleanup',
    actor: 'resource_cleanup_scheduler',
    summary: `Scheduled ${action} applied ${deletedCount} resource action(s)`,
    snapshot: { action, deletedCount, results },
  });

  return {
    requestId,
    customerEmail: request.customerEmail,
    requestLabel: request.requestName?.trim() || `Request #${requestId.slice(-8)}`,
    deletedCount,
    action,
    cleanedAt: now,
    nextCleanupAt: nextRun,
    intervalHours,
    results,
  };
}
