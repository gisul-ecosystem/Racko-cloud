const express = require('express');
const provisionController = require('../controllers/provisionController');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');
const { requireOwnedRequest } = require('../middleware/requireOwnedRequest');

const router = express.Router();

router.use(attachRackoUser);

router.post('/request/:id', requireOwnedRequest, provisionController.provisionRequestResourceGroup);
router.get('/request/:id', requireOwnedRequest, provisionController.getProvisionedRequest);

module.exports = router;
