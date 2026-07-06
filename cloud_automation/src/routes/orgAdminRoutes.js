const express = require('express');
const orgAdminController = require('../controllers/orgAdminController');
const orgAdminCustomRoutes = require('./orgAdminCustomRoutes');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');

const router = express.Router();

router.use(orgAdminCustomRoutes);

router.get('/requests', requireSuperAdmin, orgAdminController.listRequests);
router.get('/resource-groups', requireSuperAdmin, orgAdminController.listResourceGroups);
router.get(
  '/resource-groups/:requestId',
  requireSuperAdmin,
  orgAdminController.getResourceGroupDetail
);
router.get(
  '/resource-groups/:requestId/monitoring',
  requireSuperAdmin,
  orgAdminController.getMonitoringLogs
);
router.delete(
  '/resource-groups/:requestId/users/:userId',
  requireSuperAdmin,
  orgAdminController.deleteUser
);
router.patch(
  '/resource-groups/:requestId/users/:userId/roles',
  requireSuperAdmin,
  orgAdminController.updateUserRoles
);
router.post(
  '/resource-groups/:requestId/users/:userId/force-logout',
  requireSuperAdmin,
  orgAdminController.forceLogoutUser
);
router.post(
  '/resource-groups/:requestId/users/:userId/renew-budget',
  requireSuperAdmin,
  orgAdminController.renewUserBudget
);
router.patch(
  '/resource-groups/:requestId/users/:userId/cleanup-settings',
  requireSuperAdmin,
  orgAdminController.updateUserCleanupSettings
);
router.post(
  '/resource-groups/:requestId/users/:userId/trigger-cleanup',
  requireSuperAdmin,
  orgAdminController.triggerUserCleanup
);
router.get(
  '/resource-groups/:requestId/users/:userId/azure-cost',
  requireSuperAdmin,
  orgAdminController.getUserAzureCost
);
router.get(
  '/resource-groups/:requestId/daily-usage',
  requireSuperAdmin,
  orgAdminController.getDailyUsage
);
router.post(
  '/resource-groups/:requestId/reprovision-roles',
  requireSuperAdmin,
  orgAdminController.reprovisionRolesForRequest
);
router.get('/azure/roles', requireSuperAdmin, orgAdminController.listAzureRoles);
router.get('/access-requests', requireSuperAdmin, orgAdminController.listAccessRequests);
router.patch(
  '/access-requests/:id',
  requireSuperAdmin,
  orgAdminController.reviewAccessRequest
);

module.exports = router;
