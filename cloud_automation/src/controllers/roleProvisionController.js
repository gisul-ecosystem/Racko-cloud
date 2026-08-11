const AppError = require('../utils/AppError');
const roleProvisionService = require('../services/roleProvisionService');
const { runWithActiveCohort } = require('../services/cohortStepRunner');

const validateRequestId = (requestId) => {
  if (!/^\d+$/.test(requestId)) {
    throw new AppError('Request id must be a positive integer.', 400);
  }
};

const provisionRolesForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);
    const requestId = Number(req.params.id);

    const retry =
      req.body?.retry === true ||
      req.query?.retry === '1' ||
      req.query?.retry === 'true';

    const result = await runWithActiveCohort(
      requestId,
      'roles',
      (range) => roleProvisionService.provisionRolesForRequest(requestId, range),
      { retry }
    );

    res.status(200).json({
      success: true,
      usersProcessed: result.usersProcessed,
      rolesAssigned: result.rolesAssigned,
      rolesProvisioned: result.rolesProvisioned,
      permissionsComplete: result.permissionsComplete,
      provisioningStatus: result.provisioningStatus,
      resourceScopedAssignments: result.resourceScopedAssignments,
      permissionFailures: result.permissionFailures,
      complete: result.complete ?? true,
      remaining: result.remaining ?? 0,
      batchCreated: result.batchCreated ?? result.rolesAssigned ?? null,
      failures: result.failures || [],
      failed: result.failed === true,
      cohortIndex: result.cohortIndex,
      cohortTotal: result.cohortTotal,
      userNumberFrom: result.userNumberFrom,
      userNumberTo: result.userNumberTo,
      cohortStatus: result.cohortStatus,
      cohortCurrentStep: result.cohortCurrentStep,
      cohortLastError: result.cohortLastError || null,
      allCohortsComplete: result.allCohortsComplete
    });
  } catch (error) {
    next(error);
  }
};

const reprovisionRolesForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const requestId = Number(req.params.id);
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

const getRoleAssignmentsForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const requestId = Number(req.params.id);
    const [roles, status] = await Promise.all([
      roleProvisionService.getUserRoleAssignmentsForRequest(requestId),
      roleProvisionService.getRoleProvisionStatus(requestId)
    ]);

    res.status(200).json({
      success: true,
      roles,
      count: roles.length,
      complete: status.complete,
      remaining: status.remaining
    });
  } catch (error) {
    next(error);
  }
};

const repairResourceScopedPermissions = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const result = await roleProvisionService.repairResourceScopedPermissionsForRequest(
      Number(req.params.id)
    );

    res.status(200).json({
      success: result.success,
      message: result.permissionsComplete
        ? 'Resource-scoped permissions applied successfully'
        : 'Provisioning complete but some resource permissions could not be applied',
      ...result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRoleAssignmentsForRequest,
  provisionRolesForRequest,
  reprovisionRolesForRequest,
  repairResourceScopedPermissions
};
