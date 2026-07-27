const express = require('express');
const azureController = require('../controllers/azureController');
const microsoftLicenseController = require('../controllers/microsoftLicenseController');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');

const router = express.Router();

router.get('/test', azureController.testAzureConnection);
router.get('/licenses', attachRackoUser, microsoftLicenseController.listLicenses);

module.exports = router;
