const microsoftLicenseService = require('../services/microsoftLicenseService');

const listLicenses = async (req, res, next) => {
  try {
    const licenses = await microsoftLicenseService.listTenantLicenses();

    res.status(200).json({
      success: true,
      licenses,
      count: licenses.length
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listLicenses
};
