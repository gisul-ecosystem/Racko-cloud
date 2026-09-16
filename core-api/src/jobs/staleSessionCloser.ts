import { ConsoleSessionModel } from '../modules/external-vm/consoleSession.model';
import { logger } from '../utils/logger';

const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Closes console sessions that have not sent a heartbeat in 2+ minutes.
 * These are sessions where the user closed the browser tab without clicking Disconnect.
 * Runs every 2 minutes.
 */
async function closeStaleSessionsOnce(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

    const staleSessions = await ConsoleSessionModel.find({
      logoutAt: null,
      lastHeartbeatAt: { $lt: cutoff },
    }).lean();

    if (staleSessions.length === 0) return;

    for (const session of staleSessions) {
      // Use current time as logoutAt — not lastHeartbeatAt.
      // lastHeartbeatAt equals loginAt when no heartbeat has fired yet (first
      // heartbeat fires after 60s, stale threshold is 2 min), which makes
      // duration = 0. Using now() gives the accurate actual session duration.
      const logoutAt = new Date();
      const durationSeconds = Math.round(
        (logoutAt.getTime() - session.loginAt.getTime()) / 1000
      );

      await ConsoleSessionModel.updateOne(
        { _id: session._id },
        { $set: { logoutAt, durationSeconds } }
      );

      logger.info('[StaleSessionCloser] Closed stale session', {
        sessionId: session._id.toString(),
        userId: session.userId.toString(),
        durationSeconds,
      });
    }

    logger.info('[StaleSessionCloser] Closed stale sessions', { count: staleSessions.length });
  } catch (err) {
    logger.error('[StaleSessionCloser] Error closing stale sessions', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function startStaleSessionCloser(): void {
  const INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes
  logger.info('[StaleSessionCloser] Started — interval 2 minutes');
  setInterval(() => void closeStaleSessionsOnce(), INTERVAL_MS);
  // Run once on startup to catch any stale sessions from previous restarts
  void closeStaleSessionsOnce();
}
