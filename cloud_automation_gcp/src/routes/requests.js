import { Router } from 'express';
import { createRequest, getAllRequests, getRequestById } from '../services/requestService.js';

const router = Router();

function getRackoActor(req) {
  const rackoUserId = String(req.headers['x-user-id'] || '').trim() || undefined;
  const role = String(req.headers['x-user-role'] || '').trim().toLowerCase();
  const isSuperAdmin = role === 'super_admin';
  return { rackoUserId, isSuperAdmin };
}

async function loadOwnedRequest(req, requestId) {
  return getRequestById(requestId, getRackoActor(req));
}

router.post('/requests', async (req, res, next) => {
  try {
    const userId = String(req.headers['x-user-id'] || '').trim() || undefined;
    const request = await createRequest(req.body, userId, {
      portalBaseUrl: String(req.headers['x-forwarded-host'] || '').split(',')[0],
    });

    res.status(201).json({
      success: true,
      data: { requestId: request._id, estimatedPrice: request.estimatedPrice },
      requestId: request._id,
      estimatedPrice: request.estimatedPrice,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/requests', async (req, res, next) => {
  try {
    const actor = getRackoActor(req);
    const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : undefined;
    const requests = await getAllRequests({ ...actor, ownerId });
    res.json({ success: true, data: requests, count: requests.length });
  } catch (err) {
    next(err);
  }
});

router.get('/requests/:id', async (req, res, next) => {
  try {
    const request = await loadOwnedRequest(req, req.params.id);
    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
});

export default router;
