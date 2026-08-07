/**
 * Split account_count into fixed-size user-number cohorts (waves).
 * Default size 10 → 50 users = 5 waves, 1000 users = 100 waves.
 */

const DEFAULT_COHORT_SIZE = 10;

const COHORT_STEPS = [
  'resourceGroup',
  'services',
  'users',
  'roles',
  'fabric',
  'done'
];

const getProvisionCohortSize = () => {
  const parsed = Number(process.env.PROVISION_COHORT_SIZE);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_COHORT_SIZE;
};

/**
 * @param {number} accountCount
 * @param {number} [cohortSize]
 * @returns {{ cohortIndex: number, userNumberFrom: number, userNumberTo: number }[]}
 */
const buildCohorts = (accountCount, cohortSize = getProvisionCohortSize()) => {
  const total = Number(accountCount);
  const size = Number(cohortSize);

  if (!Number.isInteger(total) || total <= 0) {
    return [];
  }
  if (!Number.isInteger(size) || size <= 0) {
    return [];
  }

  const cohorts = [];
  let index = 1;
  for (let from = 1; from <= total; from += size) {
    const to = Math.min(from + size - 1, total);
    cohorts.push({
      cohortIndex: index,
      userNumberFrom: from,
      userNumberTo: to
    });
    index += 1;
  }
  return cohorts;
};

const nextCohortStep = (currentStep) => {
  const idx = COHORT_STEPS.indexOf(currentStep);
  if (idx < 0 || idx >= COHORT_STEPS.length - 1) {
    return 'done';
  }
  return COHORT_STEPS[idx + 1];
};

const isUserNumberInRange = (userNumber, from, to) => {
  const n = Number(userNumber);
  return Number.isInteger(n) && n >= from && n <= to;
};

const filterUserNumbersInRange = (userNumbers, from, to) =>
  (userNumbers || []).filter((n) => isUserNumberInRange(n, from, to));

module.exports = {
  DEFAULT_COHORT_SIZE,
  COHORT_STEPS,
  getProvisionCohortSize,
  buildCohorts,
  nextCohortStep,
  isUserNumberInRange,
  filterUserNumbersInRange
};
