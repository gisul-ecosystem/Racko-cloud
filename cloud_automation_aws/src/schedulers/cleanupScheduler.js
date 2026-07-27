import Request from '../models/Request.js';
import cron from 'node-cron';
import { cleanupUserResources, pauseUserResources } from '../services/resourceCleanupService.js';
import CleanupLog from '../models/CleanupLog.js';
import {
  sendLabExpiryWarningEmail,
  sendResourceCleanupEmail,
} from '../services/cleanupEmailService.js';
import { buildRequestLabel, countCleanupDeleted } from '../utils/cleanupMetrics.js';
import { createNotification } from '../services/notificationService.js';

let isRunning = false;

async function isRequestEligibleForCleanupEmail(requestId) {
  const request = await Request.findOne({
    _id: requestId,
    status: 'Completed',
    cleanupEnabled: true,
    endDate: { $gte: new Date() },
    cleanupCompleted: { $ne: true },
  }).select('_id');

  return Boolean(request);
}

export async function runCleanupCheck() {
  if (isRunning) {
    console.log('[cleanupScheduler] Previous run still in progress, skipping');
    return;
  }
  isRunning = true;

  try {
    const requests = await Request.find({
      status: 'Completed',
      cleanupEnabled: true,
      enableResourceCleanup: { $ne: true },
      cleanupCompleted: { $ne: true },
      endDate: { $gte: new Date() },
    });

    const now = new Date();
    let cleaned = 0;

    for (const request of requests) {
      const users =
        request.accessType === 'identity_center'
          ? request.identityUsers || []
          : request.labRoles || [];

      let requestDeletedCount = 0;
      let requestHadCleanup = false;

      for (const role of users) {
        if (role.suspended || role.cleanupDisabled) continue;

        const lastCleanup = role.lastCleanupAt
          ? new Date(role.lastCleanupAt)
          : new Date(request.startDate);

        const intervalMs =
          (role.cleanupIntervalOverride || request.cleanupIntervalHours || 2) * 60 * 60 * 1000;
        const nextCleanup = new Date(lastCleanup.getTime() + intervalMs);

        if (now >= nextCleanup) {
          console.log(
            `[cleanupScheduler] Cleaning request ${request._id} user ${role.userIndex + 1}`
          );
          try {
            const results = request.resourceCleanupAction === 'pause'
              ? await pauseUserResources(String(request._id), role.userIndex)
              : await cleanupUserResources(String(request._id), role.userIndex);
            requestDeletedCount += countCleanupDeleted(results);
            requestHadCleanup = true;
            cleaned++;
          } catch (err) {
            console.error(
              `[cleanupScheduler] Failed for ${request._id} user ${role.userIndex}:`,
              err.message
            );
          }
        }
      }

      if (requestHadCleanup) {
        const intervalHours = request.cleanupIntervalHours || 2;
        const nextCleanupAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
        const stillActive = await isRequestEligibleForCleanupEmail(request._id);

        if (!stillActive) {
          console.log(
            `[cleanupScheduler] Skipping cleanup email for ${request._id} — request expired or deleted`
          );
          continue;
        }

        await Request.findByIdAndUpdate(request._id, {
          cleanupNextRunAt: nextCleanupAt,
          resourceCleanupLastRanAt: now,
          resourceCleanupNextRunAt: nextCleanupAt,
          updatedAt: now,
          $push: {
            cleanupLogs: {
              ranAt: now,
              message: `Scheduled cleanup removed ${requestDeletedCount} resource(s) across lab users`,
            },
          },
        });
        await CleanupLog.create({
          requestId: request._id,
          action: request.resourceCleanupAction || 'delete',
          triggeredBy: 'scheduler',
          status: 'success',
          totalDeleted: requestDeletedCount,
          ranAt: now,
          completedAt: now,
        });

        if (request.customerEmail) {
          try {
            await sendResourceCleanupEmail({
              to: request.customerEmail,
              requestLabel: buildRequestLabel(request),
              deletedCount: requestDeletedCount,
              cleanedAt: now,
              nextCleanupAt,
              intervalHours,
            });
          } catch (emailErr) {
            console.error(
              `[cleanupScheduler] Cleanup email failed for ${request._id}:`,
              emailErr.message
            );
          }
        }

        await createNotification({
          type: 'cleanup_ran',
          title: 'AWS resource cleanup completed',
          message: `Lab cleanup ran for ${buildRequestLabel(request)} — ${requestDeletedCount} resource(s) removed`,
          requestId: request._id,
          metadata: { deletedCount: requestDeletedCount },
        });
      }
    }

    if (cleaned > 0) {
      console.log(`[cleanupScheduler] Cleaned ${cleaned} user(s)`);
    }
  } catch (err) {
    console.error('[cleanupScheduler] Error:', err.message);
  } finally {
    isRunning = false;
  }
}

export function startCleanupScheduler() {
  setInterval(runCleanupCheck, 5 * 60 * 1000);
  console.log('[cleanupScheduler] Started — checking every 5 minutes');
  runCleanupCheck();

  cron.schedule(
    '0 9 * * *',
    async () => {
      try {
        const now = new Date();
        const expiringSoon = await Request.find({
          status: 'Completed',
          cleanupCompleted: { $ne: true },
          customerEmail: { $exists: true, $nin: [null, ''] },
          endDate: {
            $gte: now,
            $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
          $or: [
            { expiryWarningEmailSentAt: { $exists: false } },
            { expiryWarningEmailSentAt: null },
          ],
        });

        for (const request of expiringSoon) {
          const requestLabel = buildRequestLabel(request);
          try {
            await sendLabExpiryWarningEmail({
              to: request.customerEmail,
              requestLabel,
              region: request.region,
              endDate: request.endDate,
            });

            await Request.findByIdAndUpdate(request._id, {
              expiryWarningEmailSentAt: now,
              updatedAt: now,
            });

            await createNotification({
              type: 'lab_expiring_soon',
              title: 'AWS Lab expiring in 24 hours',
              message: `AWS Lab for ${request.customerEmail} (${request.region}) expires in less than 24 hours`,
              requestId: request._id,
            });

            console.log(`[cleanupScheduler] Expiry warning email sent for ${request._id}`);
          } catch (emailErr) {
            console.error(
              `[cleanupScheduler] Expiry warning email failed for ${request._id}:`,
              emailErr.message
            );
          }
        }
      } catch (err) {
        console.error('[cleanupScheduler] Expiry warning check failed:', err.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );
}
