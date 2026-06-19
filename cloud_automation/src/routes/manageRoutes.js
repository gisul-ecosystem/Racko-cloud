const express = require('express');
const manageController = require('../controllers/manageController');
const { validateUserAccess } = require('../middleware/usageMiddleware');
const { requireAdminSession } = require('../middleware/managePortalMiddleware');

const router = express.Router();

router.get('/token', manageController.exchangeToken);
router.post('/login', manageController.exchangeToken);
router.get('/request/:requestId', manageController.getRequest);
router.get('/requests/:requestId/users/controls', requireAdminSession, manageController.getUserControls);
router.get('/user/:userId/console', manageController.getConsoleLaunch);
router.get('/user/:userId/usage', manageController.getUsageStatus);
router.post('/user/:userId/usage/end', validateUserAccess, manageController.endUsageSession);
router.post('/users/:userId/renew-budget', requireAdminSession, manageController.renewBudget);
router.patch('/users/:userId/cleanup-settings', requireAdminSession, manageController.updateCleanupSettings);
router.post('/users/:userId/trigger-cleanup', requireAdminSession, manageController.triggerCleanup);
// Protected routes - require access validation (these have userId)
router.delete('/user/:userId', validateUserAccess, manageController.deleteUser);
router.patch('/user/:userId/roles', validateUserAccess, manageController.updateRoles);

module.exports = router;
