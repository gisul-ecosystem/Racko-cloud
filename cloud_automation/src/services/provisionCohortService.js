const db = require('../db/postgres');
const { isPerUserCosting } = require('../utils/costingMode');
const {
  buildCohorts,
  getProvisionCohortSize,
  nextCohortStep
} = require('../utils/provisionCohorts');

const EMPTY_COHORT_SUMMARY = {
  cohorts: [],
  activeCohort: null,
  cohortTotal: 0,
  cohortsCompleted: 0,
  // Must stay false: shared labs have zero cohorts and still need RG creation.
  allCohortsComplete: false
};

const mapRow = (row) => {
  if (!row) return null;
  return {
    id: Number(row.id),
    requestId: Number(row.request_id),
    cohortIndex: Number(row.cohort_index),
    userNumberFrom: Number(row.user_number_from),
    userNumberTo: Number(row.user_number_to),
    status: row.status,
    currentStep: row.current_step,
    lastError: row.last_error || null
  };
};

const listCohortsForRequest = async (requestId, client = db) => {
  const result = await client.query(
    `
      SELECT id, request_id, cohort_index, user_number_from, user_number_to,
             status, current_step, last_error
      FROM provision_cohorts
      WHERE request_id = $1
      ORDER BY cohort_index ASC
    `,
    [requestId]
  );
  return result.rows.map(mapRow);
};

/**
 * Insert cohort rows for a new request. Marks first cohort in_progress.
 */
const createCohortsForRequest = async (requestId, accountCount, client = db) => {
  const cohorts = buildCohorts(accountCount, getProvisionCohortSize());
  if (cohorts.length === 0) {
    return [];
  }

  for (let i = 0; i < cohorts.length; i += 1) {
    const cohort = cohorts[i];
    const status = i === 0 ? 'in_progress' : 'pending';
    const currentStep = i === 0 ? 'resourceGroup' : 'resourceGroup';
    await client.query(
      `
        INSERT INTO provision_cohorts (
          request_id, cohort_index, user_number_from, user_number_to,
          status, current_step
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (request_id, cohort_index) DO NOTHING
      `,
      [
        requestId,
        cohort.cohortIndex,
        cohort.userNumberFrom,
        cohort.userNumberTo,
        status,
        currentStep
      ]
    );
  }

  return listCohortsForRequest(requestId, client);
};

/**
 * Ensure cohorts exist (create if missing). Used by provision steps + backfill.
 * Only per-user labs use waves — shared labs must never get cohort rows.
 */
const ensureCohortsForRequest = async (requestId, client = db) => {
  const requestResult = await client.query(
    `SELECT account_count, costing_mode FROM requests WHERE id = $1 LIMIT 1`,
    [requestId]
  );
  const request = requestResult.rows[0];
  if (!request || !isPerUserCosting(request.costing_mode)) {
    return [];
  }

  const existing = await listCohortsForRequest(requestId, client);
  if (existing.length > 0) {
    return existing;
  }

  const accountCount = Number(request.account_count);
  if (!Number.isInteger(accountCount) || accountCount <= 0) {
    return [];
  }

  return createCohortsForRequest(requestId, accountCount, client);
};

/**
 * Active cohort for display / work.
 * - in_progress wins
 * - failed stays failed (keeps lastError) unless reviveFailed=true
 * - pending is claimed to in_progress only when claimPending=true (POST work)
 */
const resolveActiveCohort = async (
  requestId,
  clientOrOptions = db,
  maybeOptions = {}
) => {
  const client =
    clientOrOptions && typeof clientOrOptions.query === 'function' ? clientOrOptions : db;
  const options =
    clientOrOptions && typeof clientOrOptions.query === 'function'
      ? maybeOptions || {}
      : clientOrOptions || {};
  const reviveFailed = options.reviveFailed === true;
  const claimPending = options.claimPending === true;

  const cohorts = await ensureCohortsForRequest(requestId, client);
  if (cohorts.length === 0) {
    return null;
  }

  const inProgress = cohorts.find((c) => c.status === 'in_progress');
  if (inProgress) {
    return { ...inProgress, cohortTotal: cohorts.length };
  }

  const failed = cohorts.find((c) => c.status === 'failed');
  if (failed && reviveFailed) {
    await client.query(
      `
        UPDATE provision_cohorts
        SET status = 'in_progress',
            last_error = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      [failed.id]
    );
    return {
      ...failed,
      status: 'in_progress',
      lastError: null,
      cohortTotal: cohorts.length
    };
  }

  if (failed) {
    // Do not auto-retry failed waves on GET/poll or accidental POSTs.
    return { ...failed, cohortTotal: cohorts.length };
  }

  const pending = cohorts.find((c) => c.status === 'pending');
  if (pending && claimPending) {
    await client.query(
      `
        UPDATE provision_cohorts
        SET status = 'in_progress',
            updated_at = NOW()
        WHERE id = $1
      `,
      [pending.id]
    );
    return {
      ...pending,
      status: 'in_progress',
      cohortTotal: cohorts.length
    };
  }

  if (pending) {
    return { ...pending, cohortTotal: cohorts.length };
  }

  // All completed
  const last = cohorts[cohorts.length - 1];
  return { ...last, cohortTotal: cohorts.length, allComplete: true };
};

const markCohortFailed = async (cohortId, errorMessage, client = db) => {
  await client.query(
    `
      UPDATE provision_cohorts
      SET status = 'failed',
          last_error = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [cohortId, String(errorMessage || 'Step failed').slice(0, 2000)]
  );
};

/**
 * After a step succeeds for the active cohort, advance current_step.
 * When fabric→done, mark completed and activate next pending cohort.
 */
const advanceCohortAfterStep = async (requestId, completedStep, client = db) => {
  const active = await resolveActiveCohort(requestId, client);
  if (!active || active.allComplete) {
    return { advanced: false, active: null };
  }

  if (active.currentStep !== completedStep) {
    return { advanced: false, active };
  }

  const nextStep = nextCohortStep(completedStep);

  if (nextStep === 'done') {
    await client.query(
      `
        UPDATE provision_cohorts
        SET current_step = 'done',
            status = 'completed',
            last_error = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      [active.id]
    );

    const nextPending = await client.query(
      `
        SELECT id FROM provision_cohorts
        WHERE request_id = $1 AND status = 'pending'
        ORDER BY cohort_index ASC
        LIMIT 1
      `,
      [requestId]
    );

    if (nextPending.rows[0]) {
      await client.query(
        `
          UPDATE provision_cohorts
          SET status = 'in_progress',
              current_step = 'resourceGroup',
              updated_at = NOW()
          WHERE id = $1
        `,
        [nextPending.rows[0].id]
      );
    }

    const refreshed = await resolveActiveCohort(requestId, client);
    return { advanced: true, active: refreshed, cohortCompleted: true };
  }

  await client.query(
    `
      UPDATE provision_cohorts
      SET current_step = $2,
          status = 'in_progress',
          last_error = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [active.id, nextStep]
  );

  const refreshed = await resolveActiveCohort(requestId, client);
  return { advanced: true, active: refreshed, cohortCompleted: false };
};

/**
 * Attach cohort fields onto a step API response.
 */
const withCohortMeta = (payload, cohort) => {
  if (!cohort) {
    return payload;
  }
  return {
    ...payload,
    cohortIndex: cohort.cohortIndex,
    cohortTotal: cohort.cohortTotal ?? null,
    userNumberFrom: cohort.userNumberFrom,
    userNumberTo: cohort.userNumberTo,
    cohortStatus: cohort.status,
    cohortCurrentStep: cohort.currentStep,
    cohortLastError: cohort.lastError || null,
    allCohortsComplete: cohort.allComplete === true
  };
};

/**
 * If Azure/DB already finished the RG step for the active wave but the cohort
 * pointer still says resourceGroup, advance it so the UI/orchestrator can move on.
 */
const syncActiveCohortWithResourceGroups = async (requestId, client = db) => {
  const active = await resolveActiveCohort(requestId, client);
  if (!active || active.allComplete || active.status === 'failed') {
    return active;
  }
  if (active.currentStep !== 'resourceGroup') {
    return active;
  }

  const staging = await client.query(
    `
      SELECT COUNT(*)::int AS c
      FROM request_user_resource_groups
      WHERE request_id = $1
        AND user_number BETWEEN $2 AND $3
    `,
    [requestId, active.userNumberFrom, active.userNumberTo]
  );
  const ready = Number(staging.rows[0]?.c || 0);
  const needed = Number(active.userNumberTo) - Number(active.userNumberFrom) + 1;
  if (ready < needed) {
    return active;
  }

  await advanceCohortAfterStep(requestId, 'resourceGroup', client);
  return resolveActiveCohort(requestId, client);
};

const getCohortProgressSummary = async (requestId, client = db) => {
  const requestResult = await client.query(
    `SELECT costing_mode FROM requests WHERE id = $1 LIMIT 1`,
    [requestId]
  );
  if (!isPerUserCosting(requestResult.rows[0]?.costing_mode)) {
    // Remove mistakenly created wave rows for shared labs (stops infinite RG POSTs).
    await client.query(`DELETE FROM provision_cohorts WHERE request_id = $1`, [requestId]);
    // Shared labs are not cohort-driven — never report allCohortsComplete.
    return { ...EMPTY_COHORT_SUMMARY, allCohortsComplete: false };
  }

  const cohorts = await ensureCohortsForRequest(requestId, client);
  if (cohorts.length === 0) {
    return { ...EMPTY_COHORT_SUMMARY, allCohortsComplete: false };
  }

  await syncActiveCohortWithResourceGroups(requestId, client);
  const refreshed = await listCohortsForRequest(requestId, client);
  const active = await resolveActiveCohort(requestId, client);
  const completedCount = refreshed.filter((c) => c.status === 'completed').length;
  return {
    cohorts: refreshed,
    activeCohort: active?.allComplete ? null : active,
    cohortTotal: refreshed.length,
    cohortsCompleted: completedCount,
    allCohortsComplete: completedCount === refreshed.length
  };
};

module.exports = {
  listCohortsForRequest,
  createCohortsForRequest,
  ensureCohortsForRequest,
  resolveActiveCohort,
  markCohortFailed,
  advanceCohortAfterStep,
  withCohortMeta,
  getCohortProgressSummary
};
