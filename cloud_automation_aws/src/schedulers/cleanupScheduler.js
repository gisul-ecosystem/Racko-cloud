import Request from '../models/Request.js';
import cron from 'node-cron';
import { cleanupUserResources } from '../services/resourceCleanupService.js';
import { sendResourceCleanupEmail } from '../services/cleanupEmailService.js';
import { buildRequestLabel, countCleanupDeleted } from '../utils/cleanupMetrics.js';
import { createNotification } from '../services/notificationService.js';

let isRunning = false;

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
        if (role.suspended) continue;

        const lastCleanup = role.lastCleanupAt
          ? new Date(role.lastCleanupAt)
          : new Date(request.startDate);

        const intervalMs = (request.cleanupIntervalHours || 2) * 60 * 60 * 1000;
        const nextCleanup = new Date(lastCleanup.getTime() + intervalMs);

        if (now >= nextCleanup) {
          console.log(
            `[cleanupScheduler] Cleaning request ${request._id} user ${role.userIndex + 1}`
          );
          try {
            const results = await cleanupUserResources(String(request._id), role.userIndex);
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

        await Request.findByIdAndUpdate(request._id, {
          cleanupNextRunAt: nextCleanupAt,
          updatedAt: now,
          $push: {
            cleanupLogs: {
              ranAt: now,
              message: `Scheduled cleanup removed ${requestDeletedCount} resource(s) across lab users`,
            },
          },
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

  cron.schedule('0 9 * * *', async () => {
    try {
      const expiringSoon = await Request.find({
        status: 'Completed',
        endDate: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      for (const request of expiringSoon) {
        await createNotification({
          type: 'lab_expiring_soon',
          title: 'AWS Lab expiring in 24 hours',
          message: `AWS Lab for ${request.customerEmail} (${request.region}) expires in less than 24 hours`,
          requestId: request._id,
        });
      }
    } catch (err) {
      console.error('[cleanupScheduler] Expiry warning check failed:', err.message);
    }
  });
}
