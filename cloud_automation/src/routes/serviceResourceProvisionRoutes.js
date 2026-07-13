const express = require('express');
const serviceResourceProvisionController = require('../controllers/serviceResourceProvisionController');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');
const { requireOwnedRequest } = require('../middleware/requireOwnedRequest');

const router = express.Router();

router.use(attachRackoUser);

router.post(
  '/request/:id/services',
  requireOwnedRequest,
  serviceResourceProvisionController.provisionServiceResources
);
router.get(
  '/request/:id/services',
  requireOwnedRequest,
  serviceResourceProvisionController.getProvisionedServiceResources
);
router.post(
  '/request/:id/repair-instance-policies',
  requireOwnedRequest,
  serviceResourceProvisionController.repairInstancePolicies
);

module.exports = router;
