import * as orgAdminService from '../services/orgAdminService.js';
 
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
      Number(req.params.userIndex)
    );
    res.json({ success: true, ...results });
  } catch (err) {
    next(err);
  }
}

export async function triggerAllCleanup(req, res, next) {
  try {
    const results = await orgAdminService.triggerAllCleanup(req.params.requestId);
    res.json({ success: true, ...results });
  } catch (err) {
    next(err);
  }
}

export async function updateCleanupSettings(req, res, next) {
  try {
    const { cleanupEnabled, cleanupIntervalHours } = req.body;
    await orgAdminService.updateCleanupSettings(
      req.params.requestId,
      Number(req.params.userIndex),
      { cleanupEnabled, cleanupIntervalHours }
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
