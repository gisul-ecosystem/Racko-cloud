const express = require('express');
const orgAdminController = require('../controllers/orgAdminController');
const { authenticateOrgAdmin } = require('../middleware/orgAdminMiddleware');

const router = express.Router();

router.post('/login', orgAdminController.login);

router.get('/resource-groups', authenticateOrgAdmin, orgAdminController.listResourceGroups);
router.get(
  '/resource-groups/:requestId',
  authenticateOrgAdmin,
  orgAdminController.getResourceGroupDetail
);
router.get(
  '/resource-groups/:requestId/monitoring',
  authenticateOrgAdmin,
  orgAdminController.getMonitoringLogs
);
router.delete(
  '/resource-groups/:requestId/users/:userId',
  authenticateOrgAdmin,
  orgAdminController.deleteUser
);
router.patch(
  '/resource-groups/:requestId/users/:userId/roles',
  authenticateOrgAdmin,
  orgAdminController.updateUserRoles
);
router.post(
  '/resource-groups/:requestId/users/:userId/force-logout',
  authenticateOrgAdmin,
  orgAdminController.forceLogoutUser
);
router.get(
  '/resource-groups/:requestId/users/:userId/azure-cost',
  authenticateOrgAdmin,
  orgAdminController.getUserAzureCost
);
router.get(
  '/resource-groups/:requestId/daily-usage',
  authenticateOrgAdmin,
  orgAdminController.getDailyUsage
);
router.get('/azure/roles', authenticateOrgAdmin, orgAdminController.listAzureRoles);
router.get('/access-requests', authenticateOrgAdmin, orgAdminController.listAccessRequests);
router.patch(
  '/access-requests/:id',
  authenticateOrgAdmin,
  orgAdminController.reviewAccessRequest
);

module.exports = router;
