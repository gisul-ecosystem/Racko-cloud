import express from 'express';
import jwt from 'jsonwebtoken';
import { verifyManagePortalLogin, getManagePortalData } from '../services/managePortalService.js';
import { generateConsoleUrl } from '../services/consoleAccessService.js';
import { assertConsoleAccessAllowed } from '../utils/servicePeriodAccess.js';
import { cleanupUserResources, cleanupAllUsers } from '../services/resourceCleanupService.js';
import { syncRequestUserSpend } from '../services/costTrackingService.js';
import Request from '../models/Request.js';

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

router.post('/manage/aws/login', async (req, res) => {
  try {
    const { token, username, password } = req.body;
    const result = await verifyManagePortalLogin(token, username, password);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

router.get('/manage/aws/request/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const data = await getManagePortalData(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/manage/aws/request/:id/users/:userIndex/console-url', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });

    try {
      assertConsoleAccessAllowed(request);
    } catch (err) {
      return res.status(err.statusCode || 403).json({ success: false, message: err.message });
    }

    const userIndex = Number(req.params.userIndex);
    const role = request.labRoles?.find((r) => r.userIndex === userIndex);
    if (!role) return res.status(404).json({ success: false, message: 'User not found' });

    if (role.suspended) {
      return res.status(403).json({ success: false, message: 'User is suspended' });
    }

    const sessionName = `racko-u${userIndex + 1}-${String(req.params.id).slice(-6)}`;
    const result = await generateConsoleUrl(role.roleArn, sessionName);

    res.json({
      success: true,
      consoleUrl: result.consoleUrl,
      expiresAt: result.expiresAt,
      username: `labuser${userIndex + 1}`,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/manage/aws/request/:id/users/:userIndex/suspend', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await Request.findOneAndUpdate(
      { _id: req.params.id, 'labRoles.userIndex': Number(req.params.userIndex) },
      { $set: { 'labRoles.$.suspended': true } }
    );
    res.json({ success: true, message: 'User suspended' });
  } catch (err) {
    next(err);
  }
});

router.post('/manage/aws/request/:id/users/:userIndex/reinstate', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await Request.findOneAndUpdate(
      { _id: req.params.id, 'labRoles.userIndex': Number(req.params.userIndex) },
      {
        $set: {
          'labRoles.$.suspended': false,
          'labRoles.$.budgetExceeded': false,
        },
      }
    );
    res.json({ success: true, message: 'User reinstated' });
  } catch (err) {
    next(err);
  }
});

router.post('/manage/aws/request/:id/users/:userIndex/cleanup', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const results = await cleanupUserResources(req.params.id, Number(req.params.userIndex));
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

router.post('/manage/aws/request/:id/cleanup-all', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const results = await cleanupAllUsers(req.params.id);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

router.put('/manage/aws/request/:id/cleanup-settings', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { cleanupEnabled, cleanupIntervalHours } = req.body;
    await Request.findByIdAndUpdate(req.params.id, {
      cleanupEnabled,
      cleanupIntervalHours,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/manage/aws/request/:id/sync-spend', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const results = await syncRequestUserSpend(req.params.id);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

router.post('/manage/aws/request/:id/users/:userIndex/renew-budget', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.requestId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await Request.findOneAndUpdate(
      { _id: req.params.id, 'labRoles.userIndex': Number(req.params.userIndex) },
      {
        $set: {
          'labRoles.$.budgetExceeded': false,
          'labRoles.$.suspended': false,
          'labRoles.$.currentSpend': 0,
        },
      }
    );
    res.json({ success: true, message: 'Budget renewed' });
  } catch (err) {
    next(err);
  }
});

export default router;
