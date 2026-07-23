const AppError = require('../utils/AppError');
const orgAdminService = require('../services/orgAdminService');
const roleProvisionService = require('../services/roleProvisionService');

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

const deleteRequest = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const result = await orgAdminService.deleteRequest({
      adminEmail: getSuperAdminActor(req),
      requestId
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

const extendRequestExpiration = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const result = await orgAdminService.extendRequestExpiration({
      requestId,
      expiresAt: req.body?.expiresAt || req.body?.expiryDate
    });

    res.status(200).json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

const sendPurchaseConfirmationMail = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const purchaseIntentService = require('../services/purchaseIntentService');
    const result = await purchaseIntentService.sendPurchaseIntentEmailByRequestId(requestId, {
      force: true
    });

    res.status(200).json({
      success: true,
      message: `Confirmation mail sent to ${result.recipientEmail}.`,
      ...result
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

    const cost = await orgAdminService.getUserAzureCost(requestId, userId, {
      refresh: req.query.refresh === 'true' || req.query.refresh === '1'
    });

    res.status(200).json({
      success: true,
      cost
    });
  } catch (error) {
    next(error);
  }
};

const getSharedAzureCost = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const summary = await orgAdminService.getSharedAzureCostForRequest(requestId, {
      refresh: req.query.refresh === 'true' || req.query.refresh === '1'
    });

    res.status(200).json({
      success: true,
      summary
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
    const { action } = req.body || {};

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    if (action !== undefined && action !== 'pause' && action !== 'delete') {
      throw new AppError("action must be 'pause' or 'delete' when provided.", 400);
    }

    const result = await orgAdminService.triggerUserCleanup(requestId, userId, { action });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const reprovisionRolesForRequest = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const db = require('../db/postgres');

    const aiFoundryCheck = await db.query(
      `
        SELECT s.name
        FROM request_services rs
        JOIN services s ON s.id = rs.service_id
        WHERE rs.request_id = $1 AND s.name = 'Azure AI Foundry'
      `,
      [requestId]
    );

    const hasAiFoundry = aiFoundryCheck.rows.length > 0;
    const result = await roleProvisionService.reprovisionRolesForRequest(requestId);

    const assignments = await db.query(
      `
        SELECT DISTINCT azure_role
        FROM user_role_assignments
        WHERE request_id = $1
          AND azure_role IS NOT NULL
        ORDER BY azure_role
      `,
      [requestId]
    );

    res.status(200).json({
      success: result.success !== false,
      message: result.permissionsComplete
        ? `Roles re-provisioned — ${result.rolesAssigned} assignments made`
        : `Roles re-provisioned with incomplete resource permissions — ${result.rolesAssigned} assignments made`,
      hasAiFoundry,
      assignmentsMade: result.rolesAssigned,
      rolesAssigned: assignments.rows.map((row) => row.azure_role),
      usersProcessed: result.usersProcessed,
      rolesProvisioned: result.rolesProvisioned,
      permissionsComplete: result.permissionsComplete,
      provisioningStatus: result.provisioningStatus,
      permissionFailures: result.permissionFailures,
      note: hasAiFoundry
        ? 'AI Foundry: assigned Azure AI Developer + Storage + Key Vault + Monitoring + Contributor + Network Contributor roles'
        : undefined,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

const unblockUser = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);
    const { resetUsage, pauseWindowEnforcement, pauseWindowHours } = req.body || {};

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    const result = await orgAdminService.unblockUser({
      requestId,
      userId,
      adminEmail: getSuperAdminActor(req),
      resetUsage: resetUsage !== false,
      pauseWindowEnforcement: pauseWindowEnforcement !== false,
      pauseWindowHours: Number(pauseWindowHours) || 24
    });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getUserSessions = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    const sessions = await orgAdminService.getUserSessions(requestId, userId);

    res.status(200).json({ success: true, sessions });
  } catch (error) {
    next(error);
  }
};

const getUserLiveResources = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.params.userId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('User id must be a positive integer.', 400);
    }

    const result = await orgAdminService.getUserLiveResources(requestId, userId);

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getCleanupLogs = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const logs = await orgAdminService.getCleanupLogs(requestId);

    res.status(200).json({ success: true, logs });
  } catch (error) {
    next(error);
  }
};

const getLabHistory = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const limit = req.query.limit ? Number(req.query.limit) : 200;

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const history = await orgAdminService.getLabHistory(requestId, { userId, limit });

    res.status(200).json({ success: true, history });
  } catch (error) {
    next(error);
  }
};

const triggerRequestCleanup = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const { action } = req.body || {};

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    if (action !== undefined && action !== 'pause' && action !== 'delete') {
      throw new AppError("action must be 'pause' or 'delete' when provided.", 400);
    }

    const result = await orgAdminService.triggerRequestCleanup(requestId, {
      action,
      triggeredBy: 'admin_manual'
    });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const repairResourceScopedPermissions = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError('Request id must be a positive integer.', 400);
    }

    const result = await roleProvisionService.repairResourceScopedPermissionsForRequest(requestId);

    res.status(200).json({
      success: result.success,
      message: result.permissionsComplete
        ? 'Resource-scoped permissions applied successfully'
        : 'Some resource permissions could not be applied — see permissionFailures',
      ...result
    });
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
  deleteRequest,
  extendRequestExpiration,
  sendPurchaseConfirmationMail,
  updateUserRoles,
  forceLogoutUser,
  listAccessRequests,
  reviewAccessRequest,
  getUserAzureCost,
  getSharedAzureCost,
  getDailyUsage,
  listAzureRoles,
  renewUserBudget,
  updateUserCleanupSettings,
  triggerUserCleanup,
  reprovisionRolesForRequest,
  repairResourceScopedPermissions,
  getUserSessions,
  getUserLiveResources,
  getCleanupLogs,
  getLabHistory,
  triggerRequestCleanup,
  unblockUser
};
