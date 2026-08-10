import { Router } from 'express';
import { retry, start } from '../services/provisioningService.js';
import { getStatus } from '../services/provisionStatusService.js';
import { getRequestById } from '../services/requestService.js';

const router = Router();

function getRackoActor(req) {
  const rackoUserId = String(req.headers['x-user-id'] || '').trim() || undefined;
  const role = String(req.headers['x-user-role'] || '').trim().toLowerCase();
  const isSuperAdmin = role === 'super_admin';
  return { rackoUserId, isSuperAdmin };
}

async function assertOwnedRequest(req, requestId) {
  await getRequestById(requestId, getRackoActor(req));
}

router.post('/provision/request/:id/start', async (req, res, next) => {
  try {
    await assertOwnedRequest(req, req.params.id);
    await start(req.params.id);
    res.status(202).json({ success: true, status: 'Provisioning' });
  } catch (err) {
    next(err);
  }
});

router.get('/provision/request/:id/status', async (req, res, next) => {
  try {
    await assertOwnedRequest(req, req.params.id);
    const status = await getStatus(req.params.id);
    res.json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
});

router.post('/provision/request/:id/retry', async (req, res, next) => {
  try {
    await assertOwnedRequest(req, req.params.id);
    await retry(req.params.id);
    res.status(202).json({ success: true, status: 'Provisioning' });
  } catch (err) {
    next(err);
  }
});

export default router;
