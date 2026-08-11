/**
 * Wrap a provision step so it runs against the active user cohort and advances
 * the wave when the step reports complete:true for that cohort.
 */
const {
  resolveActiveCohort,
  advanceCohortAfterStep,
  withCohortMeta,
  markCohortFailed,
  getCohortProgressSummary
} = require('./provisionCohortService');

const runWithActiveCohort = async (requestId, stepKey, runFn, options = {}) => {
  let cohort = null;
  try {
    cohort = await resolveActiveCohort(requestId, {
      reviveFailed: options.retry === true,
      claimPending: true
    });
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.includes('provision_cohorts')) {
      throw error;
    }
    // Table missing — run without cohort scoping.
    return runFn({});
  }

  if (cohort && cohort.status === 'failed' && !cohort.allComplete) {
    return withCohortMeta(
      {
        complete: false,
        remaining: Math.max(
          0,
          Number(cohort.userNumberTo) - Number(cohort.userNumberFrom) + 1
        ),
        batchCreated: 0,
        failures: [
          {
            message:
              cohort.lastError || `${stepKey} failed. Retry after fixing the error.`
          }
        ],
        failed: true
      },
      cohort
    );
  }

  const range =
    cohort && !cohort.allComplete
      ? {
          userNumberFrom: cohort.userNumberFrom,
          userNumberTo: cohort.userNumberTo,
          cohort
        }
      : {};

  try {
    const result = await runFn(range);

    if (result?.complete && cohort && !cohort.allComplete) {
      // Fabric not required still advances past the fabric step.
      if (stepKey === 'fabric' || cohort.currentStep === stepKey) {
        if (cohort.currentStep === stepKey) {
          await advanceCohortAfterStep(requestId, stepKey);
        }
      }
      cohort = await resolveActiveCohort(requestId);
    } else if (
      cohort?.id &&
      (result?.failed === true ||
        (result?.complete === false &&
          Number(result?.batchCreated || 0) === 0 &&
          Array.isArray(result?.failures) &&
          result.failures.length > 0))
    ) {
      const failureMessage =
        result.failures?.[0]?.message || `${stepKey} failed for this wave.`;
      await markCohortFailed(cohort.id, failureMessage);
      cohort = {
        ...cohort,
        status: 'failed',
        lastError: failureMessage
      };
    }

    return withCohortMeta(result, cohort);
  } catch (error) {
    if (cohort?.id) {
      try {
        await markCohortFailed(cohort.id, error?.message || 'Step failed');
      } catch {
        // ignore secondary failure
      }
    }
    throw error;
  }
};

module.exports = {
  runWithActiveCohort,
  getCohortProgressSummary
};
