import { Router } from 'express';
import { retry, start, syncRolePolicies } from '../services/provisioningService.js';
import { getStatus } from '../services/provisionStatusService.js';

const router = Router();

router.post('/provision/request/:id/start', async (req, res, next) => {
  try {
    await start(req.params.id);
    res.status(202).json({ success: true, status: 'Provisioning' });
  } catch (err) {
    next(err);
  }
});

router.get('/provision/request/:id/status', async (req, res, next) => {
  try {
    const status = await getStatus(req.params.id);
    res.json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
});

router.post('/provision/request/:id/retry', async (req, res, next) => {
  try {
    await retry(req.params.id);
    res.status(202).json({ success: true, status: 'Provisioning' });
  } catch (err) {
    next(err);
  }
});

router.post('/provision/request/:id/sync-policies', async (req, res, next) => {
  try {
    const result = await syncRolePolicies(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
