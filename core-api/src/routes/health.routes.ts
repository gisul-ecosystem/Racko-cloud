import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

/**
 * Public liveness/readiness for uptime monitors — no auth.
 * Verifies MongoDB (iaas_platform) is reachable with a lightweight ping.
 */
router.get('/health', async (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ status: 'error', service: 'core-api', db: 'disconnected' });
    return;
  }

  try {
    const db = mongoose.connection.db;
    if (!db) {
      res.status(503).json({ status: 'error', service: 'core-api', db: 'unavailable' });
      return;
    }
    await db.admin().command({ ping: 1 });
    res.status(200).json({ status: 'ok', service: 'core-api' });
  } catch {
    res.status(503).json({ status: 'error', service: 'core-api', db: 'unreachable' });
  }
});

export default router;
