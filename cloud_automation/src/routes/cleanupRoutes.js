const express = require('express');
const cleanupController = require('../controllers/cleanupController');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');
const { requireOwnedRequest } = require('../middleware/requireOwnedRequest');

const router = express.Router();

router.use(attachRackoUser);

router.post('/request/:id', requireOwnedRequest, cleanupController.cleanupRequest);
router.get('/request/:id', requireOwnedRequest, cleanupController.getCleanupStatus);

module.exports = router;
