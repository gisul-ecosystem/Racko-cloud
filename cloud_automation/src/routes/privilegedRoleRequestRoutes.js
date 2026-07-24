const express = require('express');
const privilegedRoleRequestController = require('../controllers/privilegedRoleRequestController');

const router = express.Router();

router.get('/roles', privilegedRoleRequestController.listAssignableRoles);
router.post('/', privilegedRoleRequestController.createPrivilegedRoleRequest);

module.exports = router;
