const AppError = require('../utils/AppError');
const orgAdminService = require('../services/orgAdminService');

const getSuperAdminActor = (req) => {
  const userId = req.rackoUser?.userId;
  return userId ? `super_admin:${userId}` : 'super_admin';
};

const listResourceGroups = async (req, res, next) => {
  try {
    const resourceGroups = await orgAdminService.listResourceGroups();

    res.status(200).json({
      success: true,
      resourceGroups,
      count: resourceGroups.length
    });
  } catch (error) {
    next(error);
  }
};

const listRequests = async (req, res, next) => {
  try {
    const data = await orgAdminService.listRequests();

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

const getResourceGroupDetail = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const detail = await orgAdminService.getResourceGroupDetail(requestId);

    res.status(200).json({
      success: true,
      ...detail
    });
  } catch (error) {
    next(error);
  }
};

const getMonitoringLogs = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const logs = await orgAdminService.getMonitoringLogs(requestId, { userId, limit });

    res.status(200).json({
      success: true,
      requestId,
      ...logs
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    const result = await orgAdminService.deleteUser({
      adminEmail: getSuperAdminActor(req),
      requestId,
      userId
    });

    res.status(200).json({
      success: true,
      user: result
    });
  } catch (error) {
    next(error);
  }
};

const updateUserRoles = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);
    const roles = req.body?.roles;

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    const result = await orgAdminService.updateUserRoles({
      adminEmail: getSuperAdminActor(req),
      requestId,
      userId,
      roles
    });

    res.status(200).json({
      success: true,
      user: result
    });
  } catch (error) {
    next(error);
  }
};

const forceLogoutUser = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    const result = await orgAdminService.forceLogoutUser({ requestId, userId });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const listAccessRequests = async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status).trim() : undefined;
    const requestId = req.query.requestId ? Number(req.query.requestId) : undefined;

    const requests = await orgAdminService.listAccessRequests({ status, requestId });

    res.status(200).json({
      success: true,
      requests,
      count: requests.length
    });
  } catch (error) {
    next(error);
  }
};

const reviewAccessRequest = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = req.body?.status;
    const reviewNotes = req.body?.reviewNotes;

    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('Access request id must be a positive integer.', 400);
    }

    const result = await orgAdminService.reviewAccessRequest({
      id,
      status,
      reviewNotes,
      reviewedBy: getSuperAdminActor(req)
    });

    res.status(200).json({
      success: true,
      request: result
    });
  } catch (error) {
    next(error);
  }
};

const getUserAzureCost = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    const cost = await orgAdminService.getUserAzureCost(requestId, userId);

    res.status(200).json({
      success: true,
      cost
    });
  } catch (error) {
    next(error);
  }
};

const getDailyUsage = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const result = await orgAdminService.getDailyUsageForRequest(requestId);

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

const listAzureRoles = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: orgAdminService.listAzureRoles()
    });
  } catch (error) {
    next(error);
  }
};

const renewUserBudget = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);
    const { topUpAmount } = req.body || {};

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    const result = await orgAdminService.renewUserBudget({
      requestId,
      userId,
      topUpAmount,
      adminEmail: getSuperAdminActor(req)
    });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const updateUserCleanupSettings = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);
    const { cleanupDisabled, cleanupIntervalOverride } = req.body || {};

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    await orgAdminService.updateUserCleanupSettings(requestId, userId, {
      cleanupDisabled,
      cleanupIntervalOverride
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

const triggerUserCleanup = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    const result = await orgAdminService.triggerUserCleanup(requestId, userId);

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listResourceGroups,
  listRequests,
  getResourceGroupDetail,
  getMonitoringLogs,
  deleteUser,
  updateUserRoles,
  forceLogoutUser,
  listAccessRequests,
  reviewAccessRequest,
  getUserAzureCost,
  getDailyUsage,
  listAzureRoles,
  renewUserBudget,
  updateUserCleanupSettings,
  triggerUserCleanup
};
