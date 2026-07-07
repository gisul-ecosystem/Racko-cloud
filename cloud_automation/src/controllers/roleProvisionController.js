const AppError = require('../utils/AppError');
const roleProvisionService = require('../services/roleProvisionService');

const validateRequestId = (requestId) => {
  if (!/^\d+$/.test(requestId)) {
    throw new AppError('Request id must be a positive integer.', 400);
  }
};

const provisionRolesForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const result = await roleProvisionService.provisionRolesForRequest(Number(req.params.id));

    res.status(200).json({
      success: true,
      usersProcessed: result.usersProcessed,
      rolesAssigned: result.rolesAssigned,
      rolesProvisioned: result.rolesProvisioned
    });
  } catch (error) {
    next(error);
  }
};

const reprovisionRolesForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const requestId = Number(req.params.id);
    const result = await roleProvisionService.reprovisionRolesForRequest(requestId);

    const db = require('../db/postgres');
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
      success: true,
      message: `Roles re-provisioned — ${result.rolesAssigned} assignments made`,
      assignmentsMade: result.rolesAssigned,
      rolesAssigned: assignments.rows.map((row) => row.azure_role),
      usersProcessed: result.usersProcessed,
      rolesProvisioned: result.rolesProvisioned
    });
  } catch (error) {
    next(error);
  }
};

const getRoleAssignmentsForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const roles = await roleProvisionService.getUserRoleAssignmentsForRequest(Number(req.params.id));

    res.status(200).json({
      success: true,
      roles
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRoleAssignmentsForRequest,
  provisionRolesForRequest,
  reprovisionRolesForRequest
};
