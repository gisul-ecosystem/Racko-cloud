const AppError = require('../utils/AppError');
const privilegedRoleRequestService = require('../services/privilegedRoleRequestService');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const listAssignableRoles = async (_req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      roles: privilegedRoleRequestService.listAssignablePrivilegedRoles()
    });
  } catch (error) {
    next(error);
  }
};

const createPrivilegedRoleRequest = async (req, res, next) => {
  try {
    const customerEmail = String(req.body?.customerEmail || '').trim();

    if (!emailPattern.test(customerEmail)) {
      throw new AppError('customerEmail must be a valid email address.', 400);
    }

    const result = await privilegedRoleRequestService.createPrivilegedRoleRequest({
      customerEmail,
      azureRole: req.body?.azureRole,
      requestId: req.body?.requestId
    });

    res.status(201).json({
      success: true,
      request: result
    });
  } catch (error) {
    if (error.message && !error.statusCode) {
      next(new AppError(error.message, 400));
      return;
    }
    next(error);
  }
};

module.exports = {
  createPrivilegedRoleRequest,
  listAssignableRoles
};
