const AppError = require('../utils/AppError');
const userProvisionService = require('../services/userProvisionService');
const db = require('../db/postgres');

const validateRequestId = (requestId) => {
  if (!/^\d+$/.test(requestId)) {
    throw new AppError('Request id must be a positive integer.', 400);
  }
};

const provisionUsersForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const result = await userProvisionService.provisionUsersForRequest(Number(req.params.id));

    res.status(200).json({
      success: true,
      usersCreated: result.usersCreated,
      accountCount: result.accountCount ?? null,
      complete: result.complete ?? true,
      remaining: result.remaining ?? 0
    });
  } catch (error) {
    next(error);
  }
};

const getUsersForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const requestId = Number(req.params.id);
    const users = await userProvisionService.getUsersForRequest(requestId);
    const requestResult = await db.query(
      `
        SELECT account_count, costing_mode
        FROM requests
        WHERE id = $1
        LIMIT 1
      `,
      [requestId]
    );
    const accountCount = Number(requestResult.rows[0]?.account_count || 0);
    const complete = accountCount > 0 ? users.length >= accountCount : users.length > 0;

    res.status(200).json({
      success: true,
      users,
      count: users.length,
      complete,
      remaining: accountCount > 0 ? Math.max(0, accountCount - users.length) : 0
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsersForRequest,
  provisionUsersForRequest
};
