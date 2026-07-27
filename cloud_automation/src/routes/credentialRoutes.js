const express = require('express');
const credentialController = require('../controllers/credentialController');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');
const { requireOwnedRequest } = require('../middleware/requireOwnedRequest');

const router = express.Router();

router.use(attachRackoUser);

router.get('/request/:id/send-credentials', requireOwnedRequest, credentialController.sendCredentials);
router.post('/request/:id/send-credentials', requireOwnedRequest, credentialController.sendCredentials);
router.get('/request/:id/credentials', requireOwnedRequest, credentialController.getCredentialDelivery);
router.get(
  '/request/:id/credentials/spreadsheet',
  requireOwnedRequest,
  credentialController.downloadCredentialSpreadsheet
);

module.exports = router;
