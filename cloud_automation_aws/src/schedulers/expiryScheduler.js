import Request from '../models/Request.js';
import { runExpiryCleanupForRequest } from '../services/labExpiryCleanupService.js';
import { createNotification } from '../services/notificationService.js';

let isRunning = false;

export async function runExpiryCheck() {
  if (isRunning) {
    console.log('[expiryScheduler] Previous run still in progress, skipping');
    return;
  }

  isRunning = true;

  try {
    const now = new Date();
    const expiredRequests = await Request.find({
      endDate: { $lt: now },
      $or: [{ cleanupCompleted: { $ne: true } }, { cleanupCompleted: { $exists: false } }],
      status: { $in: ['Completed', 'Expired'] },
    });

    for (const request of expiredRequests) {
      try {
        await runExpiryCleanupForRequest(request);

        console.log(`[expiryScheduler] Expired and cleaned request ${request._id}`);

        await createNotification({
          type: 'lab_expired',
          title: 'AWS Lab expired',
          message: `AWS Lab for ${request.customerEmail} has expired`,
          requestId: request._id,
        });
      } catch (err) {
        console.error(`[expiryScheduler] Failed for ${request._id}:`, err.message);

        await Request.findByIdAndUpdate(request._id, {
          status: 'Expired',
          cleanupEnabled: false,
          enableResourceCleanup: false,
          updatedAt: now,
          $push: {
            cleanupLogs: {
              ranAt: now,
              message: `Expiry cleanup failed: ${err.message}`,
            },
          },
        });
      }
    }
  } catch (err) {
    console.error('[expiryScheduler] Error:', err.message);
  } finally {
    isRunning = false;
  }
}

export function startExpiryScheduler() {
  const intervalMs = Number(process.env.EXPIRY_CHECK_INTERVAL_MINS || 60) * 60 * 1000;
  setInterval(runExpiryCheck, intervalMs);
  console.log(`[expiryScheduler] Started — checking every ${intervalMs / 60000} minutes`);
  runExpiryCheck();
}
