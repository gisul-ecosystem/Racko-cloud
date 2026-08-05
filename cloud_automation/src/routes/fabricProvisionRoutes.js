const express = require('express');
const fabricProvisionController = require('../controllers/fabricProvisionController');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');
const { requireOwnedRequest } = require('../middleware/requireOwnedRequest');

const router = express.Router();

router.use(attachRackoUser);

router.post(
  '/request/:id/fabric',
  requireOwnedRequest,
  fabricProvisionController.provisionFabricForRequest
);
router.get(
  '/request/:id/fabric',
  requireOwnedRequest,
  fabricProvisionController.getFabricProvisionStatus
);

module.exports = router;
