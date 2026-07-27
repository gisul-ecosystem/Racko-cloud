import express from 'express';
import * as orgAdminController from '../controllers/orgAdminController.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';

const router = express.Router();

router.use(requireSuperAdmin);

router.get('/org-admin/requests', orgAdminController.listRequests);
router.get('/org-admin/requests/:requestId', orgAdminController.getRequestDetail);
router.delete('/org-admin/requests/:requestId', orgAdminController.deleteRequest);
router.post('/org-admin/requests/:requestId/fix-permissions', orgAdminController.repairPermissions);
router.post('/org-admin/requests/:requestId/reprovision-permissions', orgAdminController.reprovisionPermissions);
router.post('/org-admin/requests/:requestId/reprovision-roles', orgAdminController.reprovisionPermissions);
router.post('/org-admin/requests/:requestId/repair-resource-permissions', orgAdminController.repairPermissions);
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
router.post('/org-admin/requests/:requestId/cleanup', orgAdminController.triggerAllCleanup);
router.patch('/org-admin/requests/:requestId/cleanup-settings', orgAdminController.updateRequestCleanupSettings);
router.patch(
  '/org-admin/requests/:requestId/users/:userIndex/cleanup-settings',
  orgAdminController.updateCleanupSettings
);
router.post('/org-admin/requests/:requestId/sync-spend', orgAdminController.syncSpend);
router.get('/org-admin/requests/:requestId/shared-cost', orgAdminController.getSharedCost);
router.get('/org-admin/requests/:requestId/history', orgAdminController.getHistory);
router.get('/org-admin/requests/:requestId/cleanup-logs', orgAdminController.getCleanupLogs);
router.get('/org-admin/iam-policies', orgAdminController.listIamPolicies);
router.get('/org-admin/requests/:requestId/daily-usage', orgAdminController.getDailyUsage);
router.get('/org-admin/requests/:requestId/monitoring', orgAdminController.getMonitoring);
router.post(
  '/org-admin/requests/:requestId/users/:userIndex/force-logout',
  orgAdminController.forceLogout
);
router.post(
  '/org-admin/requests/:requestId/users/:userIndex/unblock',
  orgAdminController.unblockUser
);
router.get(
  '/org-admin/requests/:requestId/users/:userIndex/sessions',
  orgAdminController.getUserSessions
);

router.get('/org-admin/access-requests', orgAdminController.listAccessRequests);
router.post('/org-admin/access-requests', orgAdminController.createAccessRequest);
router.patch('/org-admin/access-requests/:id', orgAdminController.reviewAccessRequest);

router.get('/org-admin/custom-iam-policies', orgAdminController.listCustomPolicies);
router.post('/org-admin/custom-iam-policies', orgAdminController.createCustomPolicy);
router.put('/org-admin/custom-iam-policies/:id', orgAdminController.updateCustomPolicy);
router.delete('/org-admin/custom-iam-policies/:id', orgAdminController.deleteCustomPolicy);
router.get(
  '/org-admin/requests/:requestId/custom-iam-policy-assignments',
  orgAdminController.listCustomAssignments
);
router.post(
  '/org-admin/requests/:requestId/users/:userIndex/custom-iam-policies',
  orgAdminController.assignCustomPolicy
);
router.post(
  '/org-admin/requests/:requestId/custom-iam-policies/assign-all',
  orgAdminController.assignCustomPolicyToAll
);
router.delete(
  '/org-admin/custom-iam-policy-assignments/:assignmentId',
  orgAdminController.revokeCustomAssignment
);

router.get('/org-admin/custom-services', orgAdminController.listCustomServices);
router.post('/org-admin/custom-services', orgAdminController.createCustomService);
router.put('/org-admin/custom-services/:id', orgAdminController.updateCustomService);
router.delete('/org-admin/custom-services/:id', orgAdminController.deleteCustomService);
router.get(
  '/org-admin/requests/:requestId/custom-services',
  orgAdminController.getRequestCustomServices
);
router.post(
  '/org-admin/requests/:requestId/custom-services/:serviceId',
  orgAdminController.assignCustomService
);
router.delete(
  '/org-admin/requests/:requestId/custom-services/:serviceId',
  orgAdminController.removeCustomService
);

export default router;
