const express = require('express');
const roleProvisionController = require('../controllers/roleProvisionController');

const router = express.Router();

router.post('/request/:id/roles', roleProvisionController.provisionRolesForRequest);
router.post('/request/:id/reprovision-roles', roleProvisionController.reprovisionRolesForRequest);
router.post('/request/:id/repair-resource-permissions', roleProvisionController.repairResourceScopedPermissions);
router.get('/request/:id/roles', roleProvisionController.getRoleAssignmentsForRequest);

module.exports = router;
