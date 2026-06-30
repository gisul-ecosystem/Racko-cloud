import express from 'express';
import * as orgAdminController from '../controllers/orgAdminController.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';

const router = express.Router();

router.use(requireSuperAdmin);

router.get('/org-admin/requests', orgAdminController.listRequests);
router.get('/org-admin/requests/:requestId', orgAdminController.getRequestDetail);
router.get('/org-admin/requests/:requestId/users', orgAdminController.getRequestUsers);
router.delete('/org-admin/requests/:requestId/users/:userIndex', orgAdminController.deleteUser);
router.patch(
  '/org-admin/requests/:requestId/users/:userIndex/permissions',
  orgAdminController.updateUserPermissions
);
router.post('/org-admin/requests/:requestId/users/:userIndex/suspend', orgAdminController.suspendUser);
router.post(
  '/org-admin/requests/:requestId/users/:userIndex/reinstate',
  orgAdminController.reinstateUser
);
router.post(
  '/org-admin/requests/:requestId/users/:userIndex/console-url',
  orgAdminController.generateConsoleUrl
);
router.get('/org-admin/requests/:requestId/users/:userIndex/cost', orgAdminController.getUserCost);
router.get('/org-admin/requests/:requestId/cost', orgAdminController.getRequestCost);
router.post(
  '/org-admin/requests/:requestId/users/:userIndex/renew-budget',
  orgAdminController.renewUserBudget
);
router.post(
  '/org-admin/requests/:requestId/users/:userIndex/cleanup',
  orgAdminController.triggerUserCleanup
);
router.post('/org-admin/requests/:requestId/cleanup-all', orgAdminController.triggerAllCleanup);
router.patch(
  '/org-admin/requests/:requestId/users/:userIndex/cleanup-settings',
  orgAdminController.updateCleanupSettings
);
router.post('/org-admin/requests/:requestId/sync-spend', orgAdminController.syncSpend);
router.get('/org-admin/iam-policies', orgAdminController.listIamPolicies);
router.get('/org-admin/requests/:requestId/daily-usage', orgAdminController.getDailyUsage);
router.get('/org-admin/requests/:requestId/monitoring', orgAdminController.getMonitoring);
router.post(
  '/org-admin/requests/:requestId/users/:userIndex/force-logout',
  orgAdminController.forceLogout
);

export default router;
