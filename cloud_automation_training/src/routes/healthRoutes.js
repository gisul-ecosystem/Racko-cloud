import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

router.get('/health', async (_req, res) => {
  let db = 'disconnected';

  try {
    await pool.query('SELECT 1');
    db = 'connected';
  } catch {
    db = 'disconnected';
  }

  res.status(200).json({
    status: 'ok',
    service: 'cloud_automation_training',
    db,
    timestamp: new Date().toISOString(),
  });
});

export default router;
