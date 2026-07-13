const express = require('express');
const userProvisionController = require('../controllers/userProvisionController');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');
const { requireOwnedRequest } = require('../middleware/requireOwnedRequest');

const router = express.Router();

router.use(attachRackoUser);

router.post('/request/:id/users', requireOwnedRequest, userProvisionController.provisionUsersForRequest);
router.get('/request/:id/users', requireOwnedRequest, userProvisionController.getUsersForRequest);

module.exports = router;
