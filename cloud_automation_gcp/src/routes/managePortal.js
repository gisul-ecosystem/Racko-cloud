import express from 'express';
import jwt from 'jsonwebtoken';
import Request from '../models/Request.js';
import {
  verifyManagePortalLogin,
  getManagePortalData,
} from '../services/managePortalService.js';
import { assertConsoleAccessAllowed } from '../utils/servicePeriodAccess.js';
import { generateAndLogConsoleUrl } from '../services/consoleAccessService.js';
import {
  suspendLabUser,
  reinstateLabUser,
  syncRequestSpend,
  triggerUserCleanup,
  triggerAllCleanup,
  renewUserBudget,
} from '../services/orgAdminService.js';

const router = express.Router();
const JWT_SECRET = process.env.PROVISION_ACCESS_TOKEN_SECRET || 'dev-secret';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function assertAdmin(req, res) {
  if (req.user?.role === 'user') {
    res.status(403).json({ success: false, message: 'Admin access is required for this action.' });
    return false;
  }
  return true;
}

function assertSelfOrAdmin(req, res, userIndex) {
  if (req.user?.role !== 'user') return true;
  if (Number(req.user.userIndex) === Number(userIndex)) return true;
  res.status(403).json({ success: false, message: 'You can only access your own account.' });
  return false;
}

router.post('/manage/gcp/login', async (req, res) => {
  try {
    const { token, username, password } = req.body;
    const result = await verifyManagePortalLogin(token, username, password);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 401).json({ success: false, message: err.message });
  }
});

router.get('/manage/gcp/request/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const data = await getManagePortalData(req.params.id, {
      role: req.user.role || 'admin',
      userIndex: req.user.userIndex,
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/manage/gcp/request/:id/users/:userIndex/console-url',
  authMiddleware,
  async (req, res, next) => {
    try {
      if (req.user.requestId !== req.params.id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const userIndex = Number(req.params.userIndex);
      if (!assertSelfOrAdmin(req, res, userIndex)) return;

      const request = await Request.findById(req.params.id);
      if (!request) return res.status(404).json({ success: false, message: 'Not found' });

      assertConsoleAccessAllowed(request);
      const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const consoleUrl = await generateAndLogConsoleUrl(request, user);
      res.json({ success: true, consoleUrl });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ success: false, message: err.message });
      }
      next(err);
    }
  }
);

router.post(
  '/manage/gcp/request/:id/users/:userIndex/suspend',
  authMiddleware,
  async (req, res, next) => {
    try {
      if (!assertAdmin(req, res)) return;
      await suspendLabUser(req.params.id, Number(req.params.userIndex));
      res.json({ success: true, message: 'User suspended' });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/manage/gcp/request/:id/users/:userIndex/reinstate',
  authMiddleware,
  async (req, res, next) => {
    try {
      if (!assertAdmin(req, res)) return;
      await reinstateLabUser(req.params.id, Number(req.params.userIndex));
      res.json({ success: true, message: 'User reinstated' });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/manage/gcp/request/:id/users/:userIndex/cleanup',
  authMiddleware,
  async (req, res, next) => {
    try {
      if (!assertAdmin(req, res)) return;
      const results = await triggerUserCleanup(req.params.id, Number(req.params.userIndex));
      res.json({ success: true, ...results });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/manage/gcp/request/:id/cleanup-all', authMiddleware, async (req, res, next) => {
  try {
    if (!assertAdmin(req, res)) return;
    const results = await triggerAllCleanup(req.params.id);
    res.json({ success: true, ...results });
  } catch (err) {
    next(err);
  }
});

router.post('/manage/gcp/request/:id/sync-spend', authMiddleware, async (req, res, next) => {
  try {
    const results = await syncRequestSpend(req.params.id);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/manage/gcp/request/:id/users/:userIndex/renew-budget',
  authMiddleware,
  async (req, res, next) => {
    try {
      if (!assertAdmin(req, res)) return;
      const result = await renewUserBudget(
        req.params.id,
        Number(req.params.userIndex),
        req.body?.topUpAmount
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
