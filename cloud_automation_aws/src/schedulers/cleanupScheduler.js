import Request from '../models/Request.js';
import { cleanupUserResources } from '../services/resourceCleanupService.js';

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
      endDate: { $gte: new Date() },
    });

    const now = new Date();
    let cleaned = 0;

    for (const request of requests) {
      const users =
        request.accessType === 'identity_center'
          ? request.identityUsers || []
          : request.labRoles || [];

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
            await cleanupUserResources(String(request._id), role.userIndex);
            cleaned++;
          } catch (err) {
            console.error(
              `[cleanupScheduler] Failed for ${request._id} user ${role.userIndex}:`,
              err.message
            );
          }
        }
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
}
