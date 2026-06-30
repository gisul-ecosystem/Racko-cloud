import Request from '../models/Request.js';
import { deprovisionIdentityUsers } from '../provisioners/aws/identityProvisioner.js';

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
      status: 'Completed',
      endDate: { $lt: now },
    });

    for (const request of expiredRequests) {
      try {
        if (request.accessType === 'identity_center' && request.identityUsers?.length) {
          await deprovisionIdentityUsers(request);
        }

        await Request.findByIdAndUpdate(request._id, {
          status: 'Expired',
          updatedAt: now,
        });

        console.log(`[expiryScheduler] Expired request ${request._id}`);
      } catch (err) {
        console.error(`[expiryScheduler] Failed for ${request._id}:`, err.message);
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
