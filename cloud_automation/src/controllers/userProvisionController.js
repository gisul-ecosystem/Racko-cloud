const AppError = require('../utils/AppError');
const userProvisionService = require('../services/userProvisionService');
const { runWithActiveCohort, getCohortProgressSummary } = require('../services/cohortStepRunner');
const db = require('../db/postgres');

const validateRequestId = (requestId) => {
  if (!/^\d+$/.test(requestId)) {
    throw new AppError('Request id must be a positive integer.', 400);
  }
};

const provisionUsersForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);
    const requestId = Number(req.params.id);

    const retry =
      req.body?.retry === true ||
      req.query?.retry === '1' ||
      req.query?.retry === 'true';

    const result = await runWithActiveCohort(
      requestId,
      'users',
      (range) => userProvisionService.provisionUsersForRequest(requestId, range),
      { retry }
    );

    res.status(200).json({
      success: true,
      usersCreated: result.usersCreated,
      accountCount: result.accountCount ?? null,
      complete: result.complete ?? true,
      remaining: result.remaining ?? 0,
      batchCreated: result.batchCreated ?? result.usersCreated ?? null,
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

const getUsersForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const requestId = Number(req.params.id);
    const users = await userProvisionService.getUsersForRequest(requestId);
    const requestResult = await db.query(
      `
        SELECT account_count, costing_mode, per_user_budget_usd
        FROM requests
        WHERE id = $1
        LIMIT 1
      `,
      [requestId]
    );
    const accountCount = Number(requestResult.rows[0]?.account_count || 0);
    const budgetAmountUsd = Number(requestResult.rows[0]?.per_user_budget_usd || 0);

    let cohort = null;
    try {
      const summary = await getCohortProgressSummary(requestId);
      cohort = summary.activeCohort;
    } catch {
      cohort = null;
    }

    const cohortFrom = cohort?.userNumberFrom || 1;
    const cohortTo = cohort?.userNumberTo || accountCount;
    const usersInCohort = users.filter((user) => {
      const n = Number(user.user_number ?? user.userNumber);
      return Number.isInteger(n) && n >= cohortFrom && n <= cohortTo;
    });
    const cohortTarget = Math.max(0, cohortTo - cohortFrom + 1);
    const usersComplete = cohort
      ? usersInCohort.length >= cohortTarget
      : accountCount > 0
        ? users.length >= accountCount
        : users.length > 0;

    let budgetsRemaining = 0;
    if (usersComplete && Number.isFinite(budgetAmountUsd) && budgetAmountUsd > 0) {
      const budgetResult = await db.query(
        `
          SELECT COUNT(*)::int AS count
          FROM azure_users
          WHERE request_id = $1
            AND azure_resource_group_name IS NOT NULL
            AND budget_id IS NULL
            AND COALESCE(is_deleted, FALSE) = FALSE
            AND ($2::int IS NULL OR (user_number >= $2 AND user_number <= $3))
        `,
        [requestId, cohort ? cohortFrom : null, cohort ? cohortTo : null]
      );
      budgetsRemaining = Number(budgetResult.rows[0]?.count || 0);
    }

    const complete = usersComplete && budgetsRemaining === 0;

    res.status(200).json({
      success: true,
      users,
      count: users.length,
      complete,
      remaining: cohort
        ? Math.max(0, cohortTarget - usersInCohort.length) + budgetsRemaining
        : accountCount > 0
          ? Math.max(0, accountCount - users.length) + budgetsRemaining
          : budgetsRemaining,
      cohortIndex: cohort?.cohortIndex,
      cohortTotal: cohort?.cohortTotal,
      userNumberFrom: cohort?.userNumberFrom,
      userNumberTo: cohort?.userNumberTo,
      cohortCurrentStep: cohort?.currentStep
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsersForRequest,
  provisionUsersForRequest
};
