import { expireOldSessions } from '../services/sessionTrackingService.js';

export function startSessionScheduler() {
  const intervalMs =
    (Number(process.env.SESSION_EXPIRE_CHECK_INTERVAL_MINS) || 1) * 60 * 1000;

  setInterval(async () => {
    try {
      await expireOldSessions();
    } catch (err) {
      console.error('[sessionScheduler] Error:', err.message);
    }
  }, intervalMs);

  console.log('[sessionScheduler] Started — checking every minute');
}
