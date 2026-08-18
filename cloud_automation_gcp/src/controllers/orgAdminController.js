import * as orgAdminService from '../services/orgAdminService.js';

function actor(req) {
  return String(req.headers['x-user-id'] || req.headers['x-user-email'] || 'org_admin');
}
 
export async function listRequests(req, res, next) {
  try {
    const { status, region, search } = req.query;
    const requests = await orgAdminService.listAllRequests({ status, region, search });
    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
}

export async function getRequestDetail(req, res, next) {
  try {
    const detail = await orgAdminService.getRequestDetail(req.params.requestId);
    res.json({ success: true, detail });
  } catch (err) {
    next(err);
  }
}

export async function getRequestUsers(req, res, next) {
  try {
    const users = await orgAdminService.getRequestUsers(req.params.requestId);
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    await orgAdminService.deleteLabUser(req.params.requestId, Number(req.params.userIndex));
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    next(err);
  }
}

export async function updateUserPermissions(req, res, next) {
  try {
    const { policies } = req.body;
    await orgAdminService.updateUserPermissions(
      req.params.requestId,
      Number(req.params.userIndex),
      policies
    );
    res.json({ success: true, message: 'Permissions updated' });
  } catch (err) {
    next(err);
  }
}

export async function suspendUser(req, res, next) {
  try {
    await orgAdminService.suspendLabUser(req.params.requestId, Number(req.params.userIndex));
    res.json({ success: true, message: 'User suspended' });
  } catch (err) {
    next(err);
  }
}

export async function reinstateUser(req, res, next) {
  try {
    await orgAdminService.reinstateLabUser(req.params.requestId, Number(req.params.userIndex));
    res.json({ success: true, message: 'User reinstated' });
  } catch (err) {
    next(err);
  }
}

export async function addUsers(req, res, next) {
  try {
    const result = await orgAdminService.addUsersToRequest(req.params.requestId, {
      count: req.body?.count ?? 1,
      actor: actor(req),
    });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function blockAllUsers(req, res, next) {
  try {
    const result = await orgAdminService.blockAllUsers(req.params.requestId, {
      actor: actor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function unblockAllUsers(req, res, next) {
  try {
    const result = await orgAdminService.unblockAllUsers(req.params.requestId, {
      actor: actor(req),
      resetUsage: req.body?.resetUsage !== false,
      pauseWindowEnforcement: req.body?.pauseWindowEnforcement !== false,
      pauseWindowHours: req.body?.pauseWindowHours ?? 24,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function generateConsoleUrl(req, res, next) {
  try {
    const result = await orgAdminService.generateUserConsoleUrl(
      req.params.requestId,
      Number(req.params.userIndex)
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getUserCost(req, res, next) {
  try {
    const cost = await orgAdminService.getUserCost(
      req.params.requestId,
      Number(req.params.userIndex)
    );
    res.json({ success: true, cost });
  } catch (err) {
    next(err);
  }
}

export async function getRequestCost(req, res, next) {
  try {
    const cost = await orgAdminService.getRequestTotalCost(req.params.requestId);
    res.json({ success: true, cost });
  } catch (err) {
    next(err);
  }
}

export async function renewUserBudget(req, res, next) {
  try {
    const { topUpAmount } = req.body;
    const result = await orgAdminService.renewUserBudget(
      req.params.requestId,
      Number(req.params.userIndex),
      topUpAmount
    );
    res.json({ success: true, message: 'Budget renewed', ...result });
  } catch (err) {
    next(err);
  }
}

export async function triggerUserCleanup(req, res, next) {
  try {
    const results = await orgAdminService.triggerUserCleanup(
      req.params.requestId,
      Number(req.params.userIndex),
      { action: req.body?.action, actor: actor(req) }
    );
    res.json({ success: true, ...results });
  } catch (err) {
    next(err);
  }
}

export async function triggerAllCleanup(req, res, next) {
  try {
    const results = await orgAdminService.triggerAllCleanup(req.params.requestId, {
      action: req.body?.action,
      actor: actor(req),
    });
    res.json({ success: true, ...results });
  } catch (err) {
    next(err);
  }
}

export async function updateCleanupSettings(req, res, next) {
  try {
    await orgAdminService.updateCleanupSettings(
      req.params.requestId,
      Number(req.params.userIndex),
      req.body || {}
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function syncSpend(req, res, next) {
  try {
    const results = await orgAdminService.syncRequestSpend(req.params.requestId);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
}

export async function listIamPolicies(req, res, next) {
  try {
    const policies = orgAdminService.getAvailableIamPolicies();
    res.json({ success: true, policies });
  } catch (err) {
    next(err);
  }
}

export async function getDailyUsage(req, res, next) {
  try {
    const result = await orgAdminService.getDailyUsageForRequest(req.params.requestId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getMonitoring(req, res, next) {
  try {
    const { userIndex, limit } = req.query;
    const result = await orgAdminService.getMonitoringLogs(req.params.requestId, {
      userIndex,
      limit,
    });
    res.json({ success: true, requestId: req.params.requestId, ...result });
  } catch (err) {
    next(err);
  }
}

export async function forceLogout(req, res, next) {
  try {
    const result = await orgAdminService.forceLogoutUser(
      req.params.requestId,
      Number(req.params.userIndex)
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function deleteRequest(req, res, next) {
  try {
    const result = await orgAdminService.deleteRequest(req.params.requestId, { actor: actor(req) });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function reprovisionPermissions(req, res, next) {
  try {
    const result = await orgAdminService.reprovisionPermissions(req.params.requestId, { actor: actor(req) });
    res.json({ success: result.success, ...result });
  } catch (err) {
    next(err);
  }
}

export async function repairPermissions(req, res, next) {
  try {
    const result = await orgAdminService.repairPermissions(req.params.requestId, { actor: actor(req) });
    res.json({ success: result.success, ...result });
  } catch (err) {
    next(err);
  }
}

export async function unblockUser(req, res, next) {
  try {
    const result = await orgAdminService.unblockUser(
      req.params.requestId,
      Number(req.params.userIndex),
      { ...(req.body || {}), actor: actor(req) }
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getUserSessions(req, res, next) {
  try {
    const sessions = await orgAdminService.getUserSessions(
      req.params.requestId,
      Number(req.params.userIndex),
      { limit: req.query.limit }
    );
    res.json({ success: true, sessions });
  } catch (err) {
    next(err);
  }
}

export async function getCleanupLogs(req, res, next) {
  try {
    const logs = await orgAdminService.getCleanupLogs(req.params.requestId, { limit: req.query.limit });
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req, res, next) {
  try {
    const history = await orgAdminService.getLabHistory(req.params.requestId, {
      userIndex: req.query.userIndex ?? req.query.userId,
      limit: req.query.limit,
    });
    res.json({ success: true, history });
  } catch (err) {
    next(err);
  }
}

export async function getSharedCost(req, res, next) {
  try {
    const summary = await orgAdminService.getSharedCost(req.params.requestId);
    res.json({ success: true, summary });
  } catch (err) {
    next(err);
  }
}

export async function updateRequestCleanupSettings(req, res, next) {
  try {
    const request = await orgAdminService.updateRequestCleanupSettings(req.params.requestId, req.body || {});
    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
}

export async function listAccessRequests(req, res, next) {
  try {
    const requests = await orgAdminService.listAccessRequests(req.query);
    res.json({ success: true, requests, count: requests.length });
  } catch (err) {
    next(err);
  }
}

export async function createAccessRequest(req, res, next) {
  try {
    const request = await orgAdminService.createAccessRequest(req.body || {});
    res.status(201).json({ success: true, request });
  } catch (err) {
    next(err);
  }
}

export async function reviewAccessRequest(req, res, next) {
  try {
    const request = await orgAdminService.reviewAccessRequest(req.params.id, {
      ...(req.body || {}),
      reviewedBy: actor(req),
    });
    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
}

export async function listCustomPolicies(req, res) {
  res.json({ success: true, policies: [] });
}

export async function createCustomPolicy(req, res) {
  res.status(501).json({ success: false, message: 'Custom IAM policies are not enabled for GCP yet.' });
}

export async function updateCustomPolicy(req, res) {
  res.status(501).json({ success: false, message: 'Custom IAM policies are not enabled for GCP yet.' });
}

export async function deleteCustomPolicy(req, res) {
  res.status(501).json({ success: false, message: 'Custom IAM policies are not enabled for GCP yet.' });
}

export async function listCustomAssignments(req, res) {
  res.json({ success: true, assignments: [] });
}

export async function assignCustomPolicy(req, res) {
  res.status(501).json({ success: false, message: 'Custom IAM policies are not enabled for GCP yet.' });
}

export async function assignCustomPolicyToAll(req, res) {
  res.status(501).json({ success: false, message: 'Custom IAM policies are not enabled for GCP yet.' });
}

export async function revokeCustomAssignment(req, res) {
  res.status(501).json({ success: false, message: 'Custom IAM policies are not enabled for GCP yet.' });
}

export async function listCustomServices(req, res) {
  res.json({ success: true, services: [] });
}

export async function createCustomService(req, res) {
  res.status(501).json({ success: false, message: 'Custom services are not enabled for GCP yet.' });
}

export async function updateCustomService(req, res) {
  res.status(501).json({ success: false, message: 'Custom services are not enabled for GCP yet.' });
}

export async function deleteCustomService(req, res) {
  res.status(501).json({ success: false, message: 'Custom services are not enabled for GCP yet.' });
}

export async function assignCustomService(req, res) {
  res.status(501).json({ success: false, message: 'Custom services are not enabled for GCP yet.' });
}

export async function removeCustomService(req, res) {
  res.status(501).json({ success: false, message: 'Custom services are not enabled for GCP yet.' });
}

export async function getRequestCustomServices(req, res) {
  res.json({ success: true, services: [] });
}

export async function sendPurchaseConfirmationMail(req, res, next) {
  try {
    const result = await orgAdminService.sendPurchaseConfirmationMail(req.params.requestId);
    res.status(200).json({
      success: true,
      message: result.message || 'Purchase confirmation prepared.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function listPrivilegedAwsRoles(req, res) {
  res.json({ success: true, roles: [] });
}

export async function listPrivilegedRoleRequests(req, res) {
  res.json({ success: true, requests: [] });
}

export async function reviewPrivilegedRoleRequest(req, res) {
  res.status(501).json({ success: false, message: 'Privileged roles are not enabled for GCP yet.' });
}

export async function assignPrivilegedRoleToAll(req, res) {
  res.status(501).json({ success: false, message: 'Privileged roles are not enabled for GCP yet.' });
}

export async function listPrivilegedRoleAssignments(req, res) {
  res.json({ success: true, assignments: [] });
}

export async function revokePrivilegedRoleAssignment(req, res) {
  res.status(501).json({ success: false, message: 'Privileged roles are not enabled for GCP yet.' });
}
