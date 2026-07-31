import express from 'express';
import * as privilegedRoleService from '../services/privilegedRoleService.js';

const router = express.Router();

router.get('/privileged-role-requests/roles', async (_req, res, next) => {
  try {
    res.json({
      success: true,
      roles: privilegedRoleService.listAssignablePrivilegedRoles(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/privileged-role-requests', async (req, res, next) => {
  try {
    const request = await privilegedRoleService.createPrivilegedRoleRequest({
      customerEmail: req.body?.customerEmail,
      awsRole: req.body?.awsRole || req.body?.role,
      requestId: req.body?.requestId || null,
    });
    res.status(201).json({ success: true, request });
  } catch (err) {
    next(err);
  }
});

export default router;
