import { Router } from 'express';
import Request from '../models/Request.js';
import { createRequest, getAllRequests, getRequestById } from '../services/requestService.js';
import { syncRequestUserSpend, getAllUsersSpend } from '../services/costTrackingService.js';
import { reinstateUser } from '../services/budgetEnforcementService.js';

const router = Router();

router.post('/requests', async (req, res, next) => {
  try {
    const userId = String(req.headers['x-user-id'] || '').trim() || undefined;
    const request = await createRequest(req.body, userId);

    res.status(201).json({
      success: true,
      data: {
        requestId: request._id,
        estimatedPrice: request.estimatedPrice,
      },
      requestId: request._id,
      estimatedPrice: request.estimatedPrice,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/requests', async (req, res, next) => {
  try {
    const rackoUserId = String(req.headers['x-user-id'] || '').trim() || undefined;
    const role = String(req.headers['x-user-role'] || '').trim().toLowerCase();
    const isSuperAdmin = role === 'super_admin';

    const requests = await getAllRequests({ rackoUserId, isSuperAdmin });
    res.json({ success: true, data: requests, count: requests.length });
  } catch (err) {
    next(err);
  }
});

router.get('/requests/:id', async (req, res, next) => {
  try {
    const request = await getRequestById(req.params.id);
    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
});

router.get('/requests/:id/spend', async (req, res, next) => {
  try {
    const spend = await getAllUsersSpend(req.params.id);
    res.json({ success: true, spend });
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:id/sync-spend', async (req, res, next) => {
  try {
    const results = await syncRequestUserSpend(req.params.id);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:id/users/:userIndex/reinstate', async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    if (request.status !== 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'User can only be reinstated for completed requests',
      });
    }

    const userIndex = Number(req.params.userIndex);
    const role = request.labRoles?.find((entry) => entry.userIndex === userIndex);
    if (!role) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await reinstateUser(request, role);
    res.json({ success: true, message: `User labuser${userIndex + 1} reinstated` });
  } catch (err) {
    next(err);
  }
});

export default router;
