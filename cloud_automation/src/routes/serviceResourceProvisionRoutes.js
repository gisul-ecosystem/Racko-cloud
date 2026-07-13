const express = require('express');
const serviceResourceProvisionController = require('../controllers/serviceResourceProvisionController');

const router = express.Router();

router.post('/request/:id/services', serviceResourceProvisionController.provisionServiceResources);
router.get('/request/:id/services', serviceResourceProvisionController.getProvisionedServiceResources);
router.post('/request/:id/repair-instance-policies', serviceResourceProvisionController.repairInstancePolicies);

module.exports = router;
