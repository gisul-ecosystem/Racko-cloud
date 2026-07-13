const express = require('express');
const roleProvisionController = require('../controllers/roleProvisionController');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');
const { requireOwnedRequest } = require('../middleware/requireOwnedRequest');

const router = express.Router();

router.use(attachRackoUser);

router.post('/request/:id/roles', requireOwnedRequest, roleProvisionController.provisionRolesForRequest);
router.post(
  '/request/:id/reprovision-roles',
  requireOwnedRequest,
  roleProvisionController.reprovisionRolesForRequest
);
router.post(
  '/request/:id/repair-resource-permissions',
  requireOwnedRequest,
  roleProvisionController.repairResourceScopedPermissions
);
router.get('/request/:id/roles', requireOwnedRequest, roleProvisionController.getRoleAssignmentsForRequest);

module.exports = router;
