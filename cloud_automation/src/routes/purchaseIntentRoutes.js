const express = require('express');
const purchaseIntentController = require('../controllers/purchaseIntentController');

const router = express.Router();

// Token-authenticated endpoints (opened from purchase email links).
router.get('/clone', purchaseIntentController.getPurchaseClonePayload);
router.post('/respond', purchaseIntentController.respondToPurchaseIntent);
router.get('/respond', purchaseIntentController.respondToPurchaseIntent);

module.exports = router;
