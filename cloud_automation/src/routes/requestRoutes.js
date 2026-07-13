const express = require('express');
const requestController = require('../controllers/requestController');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');
const { requireOwnedRequest } = require('../middleware/requireOwnedRequest');

const router = express.Router();

router.use(attachRackoUser);

router.get('/', requestController.getAllRequests);
router.post('/', requestController.createRequest);
router.patch('/:id/cleanup-schedule', requireOwnedRequest, requestController.updateCleanupSchedule);
router.get('/:id', requestController.getRequestById);

module.exports = router;
