import express from 'express';

import jwt from 'jsonwebtoken';

import { verifyManagePortalLogin, getManagePortalData } from '../services/managePortalService.js';

import { generateAndLogConsoleUrl } from '../services/consoleAccessService.js';
import { createNotification } from '../services/notificationService.js';
import { revokeLabUserConsoleSessionsSafe } from '../services/awsSessionRevocationService.js';

import {
  getUserSessionStats,
  syncActiveMagicLinkUsageSessions,
} from '../services/sessionTrackingService.js';

import { assertConsoleAccessAllowed } from '../utils/servicePeriodAccess.js';

import { assertUsageAccessAllowed, resolveUsageUserId } from '../services/usageService.js';

import { cleanupUserResources, cleanupAllUsers } from '../services/resourceCleanupService.js';

import { syncRequestUserSpend } from '../services/costTrackingService.js';

import Request from '../models/Request.js';
import {
  suspendIdentityUser,
  reinstateIdentityUser,
} from '../provisioners/aws/identityProvisioner.js';
import { sendReinstateCredentialsEmail } from '../provisioners/aws/emailProvisioner.js';

const router = express.Router();

const JWT_SECRET = process.env.PROVISION_ACCESS_TOKEN_SECRET || 'dev-secret';

import { computeMagicLinkDurationSeconds } from '../utils/usageWindowAccess.js';



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



    const userIndex = Number(req.params.userIndex);

    if (!Number.isInteger(userIndex) || userIndex < 0) {
      return res.status(400).json({ success: false, message: 'Invalid user index' });
    }

    if (request.accessType === 'identity_center') {
      return res.status(400).json({
        success: false,
        message:
          'Console magic links are not available for Identity Center access. Users sign in via Identity Center.',
      });
    }

    try {
      assertConsoleAccessAllowed(request);
      assertUsageAccessAllowed(request, userIndex);
    } catch (err) {
      if (!err.statusCode) {
        throw err;
      }

      return res.status(err.statusCode).json({ success: false, message: err.message });
    }



    const role = request.labRoles?.find((entry) => entry.userIndex === userIndex);

    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });



    if (role.suspended) {

      return res.status(403).json({

        success: false,

        message: 'User is suspended due to budget exceeded or admin action',

      });

    }



    const sessionName = `racko-u${userIndex + 1}-${String(req.params.id).slice(-6)}`;
    const userId = resolveUsageUserId(request, userIndex);
    const durationSeconds = computeMagicLinkDurationSeconds(request, userId);

    if (durationSeconds <= 0) {
      return res.status(403).json({
        success: false,
        message: 'Daily usage limit reached. Access will reset at midnight.',
      });
    }

    const result = await generateAndLogConsoleUrl(
      req.params.id,
      userIndex,
      role.roleArn,
      sessionName,
      durationSeconds
    );

    await createNotification({
      type: 'console_access',
      title: 'AWS Console access generated',
      message: `Magic link generated for labuser${userIndex + 1} in Lab #${String(req.params.id).slice(-6)} by admin`,
      requestId: req.params.id,
    });

    res.json({
      success: true,
      consoleUrl: result.consoleUrl,
      expiresAt: result.expiresAt,
      username: `labuser${userIndex + 1}`,
      sessionDurationHours: durationSeconds / 3600,
      sessionDurationMinutes: Math.round(durationSeconds / 60),
    });

  } catch (err) {

    next(err);

  }

});



router.get('/manage/aws/request/:id/users/:userIndex/sessions', authMiddleware, async (req, res, next) => {

  try {

    if (req.user.requestId !== req.params.id) {

      return res.status(403).json({ success: false, message: 'Forbidden' });

    }



    await syncActiveMagicLinkUsageSessions(req.params.id);

    const stats = await getUserSessionStats(req.params.id, Number(req.params.userIndex));

    res.json({ success: true, stats });

  } catch (err) {

    next(err);

  }

});



router.post('/manage/aws/request/:id/users/:userIndex/suspend', authMiddleware, async (req, res, next) => {

  try {

    if (req.user.requestId !== req.params.id) {

      return res.status(403).json({ success: false, message: 'Forbidden' });

    }



    const request = await Request.findById(req.params.id);

    if (!request) return res.status(404).json({ success: false, message: 'Not found' });



    const userIndex = Number(req.params.userIndex);
    const accessType = request.accessType || 'magic_link';

    await revokeLabUserConsoleSessionsSafe(req.params.id, userIndex);

    if (accessType === 'identity_center') {
      await suspendIdentityUser(request, userIndex);
    } else {
      await Request.findOneAndUpdate(
        { _id: req.params.id, 'labRoles.userIndex': userIndex },
        { $set: { 'labRoles.$.suspended': true } }
      );
    }

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



    const request = await Request.findById(req.params.id);

    if (!request) return res.status(404).json({ success: false, message: 'Not found' });



    const userIndex = Number(req.params.userIndex);
    const accessType = request.accessType || 'magic_link';

    if (accessType === 'identity_center') {
      const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const newPassword = await reinstateIdentityUser(request, userIndex);
      await sendReinstateCredentialsEmail(request, { ...user, password: newPassword }, newPassword);
    } else {
      await Request.findOneAndUpdate(
        { _id: req.params.id, 'labRoles.userIndex': userIndex },
        {
          $set: {
            'labRoles.$.suspended': false,
            'labRoles.$.budgetExceeded': false,
          },
        }
      );
    }

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



    const request = await Request.findById(req.params.id);

    if (!request) return res.status(404).json({ success: false, message: 'Not found' });



    const userIndex = Number(req.params.userIndex);

    const accessType = request.accessType || 'magic_link';

    const field = accessType === 'magic_link' ? 'labRoles' : 'identityUsers';



    await Request.findOneAndUpdate(

      { _id: req.params.id, [`${field}.userIndex`]: userIndex },

      {

        $set: {

          [`${field}.$.budgetExceeded`]: false,

          [`${field}.$.suspended`]: false,

          [`${field}.$.currentSpend`]: 0,

        },

      }

    );

    res.json({ success: true, message: 'Budget renewed' });

  } catch (err) {

    next(err);

  }

});



export default router;

