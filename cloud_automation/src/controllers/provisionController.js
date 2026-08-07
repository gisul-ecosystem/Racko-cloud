const AppError = require('../utils/AppError');
const provisionService = require('../services/provisionService');
const { getCohortProgressSummary } = require('../services/cohortStepRunner');

const validateRequestId = (requestId) => {
  if (!/^\d+$/.test(requestId)) {
    throw new AppError('Request id must be a positive integer.', 400);
  }
};

const provisionRequestResourceGroup = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const retry =
      req.body?.retry === true ||
      req.query?.retry === '1' ||
      req.query?.retry === 'true';

    // provisionService.provisionRequestResourceGroup already resolves/advances cohorts.
    const result = await provisionService.provisionRequestResourceGroup(Number(req.params.id), {
      retry
    });

    res.status(200).json({
      success: true,
      resourceGroup: result.resourceGroup,
      resourceGroupCount: result.resourceGroupCount ?? null,
      accountCount: result.accountCount ?? null,
      complete: result.complete ?? true,
      remaining: result.remaining ?? 0,
      batchCreated: result.batchCreated ?? null,
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

const getProvisionedRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const requestId = Number(req.params.id);
    const request = await provisionService.getProvisionedRequest(requestId);

    if (!request) {
      throw new AppError('Request not found.', 404);
    }

    let cohorts = [];
    let activeCohort = null;
    let cohortsCompleted = 0;
    let allCohortsComplete = false;
    try {
      const summary = await getCohortProgressSummary(requestId);
      cohorts = summary.cohorts || [];
      activeCohort = summary.activeCohort;
      cohortsCompleted = summary.cohortsCompleted || 0;
      allCohortsComplete = summary.allCohortsComplete === true;
    } catch {
      // migration not applied
    }

    // Cohort-aware RG complete: current wave's RGs done (or all cohorts done).
    let complete = request.complete ?? Boolean(request.resourceGroup);
    if (activeCohort) {
      complete =
        activeCohort.currentStep !== 'resourceGroup' || activeCohort.status === 'completed';
    } else if (allCohortsComplete) {
      complete = true;
    }

    res.status(200).json({
      success: true,
      status: request.status,
      resourceGroup: request.resourceGroup,
      resourceGroupCount: request.resourceGroupCount ?? null,
      accountCount: request.accountCount ?? null,
      complete,
      cohorts,
      activeCohort,
      cohortsCompleted,
      cohortTotal: cohorts.length,
      allCohortsComplete,
      cohortIndex: activeCohort?.cohortIndex,
      userNumberFrom: activeCohort?.userNumberFrom,
      userNumberTo: activeCohort?.userNumberTo,
      cohortStatus: activeCohort?.status,
      cohortCurrentStep: activeCohort?.currentStep,
      cohortLastError: activeCohort?.lastError || null
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProvisionedRequest,
  provisionRequestResourceGroup
};
