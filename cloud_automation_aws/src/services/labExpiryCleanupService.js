import { fetchFinalSpend } from './costTrackingService.js';
import Request from '../models/Request.js';
import { cleanupAllUsers } from './resourceCleanupService.js';
import { rollbackLabRoles } from '../provisioners/aws/iamRoleProvisioner.js';
import { deprovisionIdentityUsers } from '../provisioners/aws/identityProvisioner.js';
import { rollbackPermissionSets } from '../provisioners/aws/permissionSetProvisioner.js';
import { rollbackAssignments } from '../provisioners/aws/accountAssignmentProvisioner.js';
import { rollbackScpResources } from '../provisioners/aws/scpProvisioner.js';
import { countCleanupDeleted } from '../utils/cleanupMetrics.js';

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
  const results = await cleanupAllUsers(requestId);
  const deletedCount = countCleanupDeleted(results);

  const intervalHours =
    request.resourceCleanupIntervalHours || request.cleanupIntervalHours || 4;
  const now = new Date();
  const nextRun = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

  await Request.findByIdAndUpdate(requestId, {
    resourceCleanupLastRanAt: now,
    resourceCleanupNextRunAt: nextRun,
    updatedAt: now,
    $push: {
      cleanupLogs: {
        ranAt: now,
        message: `Scheduled resource cleanup removed ${deletedCount} resource(s)`,
      },
    },
  });

  return {
    requestId,
    customerEmail: request.customerEmail,
    requestLabel: request.requestName?.trim() || `Request #${requestId.slice(-8)}`,
    deletedCount,
    cleanedAt: now,
    nextCleanupAt: nextRun,
    intervalHours,
    results,
  };
}
