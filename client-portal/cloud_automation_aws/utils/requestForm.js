export function buildInstanceSelectionsParam(instances) {
  if (!instances?.length) return undefined;
  return instances.map((entry) => `${entry.serviceId}:${entry.instanceType}`).join(',');
}

export function toDateTimeLocalValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultStartDate() {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocalValue(date);
}

export function defaultEndDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocalValue(date);
}

export function defaultTestIdsStartDate() {
  return toDateTimeLocalValue(new Date());
}

export function defaultTestIdsEndDate() {
  return addHoursToDateTimeLocal(defaultTestIdsStartDate(), 24);
}

/** Add hours to a datetime-local string; falls back to now+hours if invalid. */
export function addHoursToDateTimeLocal(value, hours) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    fallback.setHours(fallback.getHours() + hours);
    return toDateTimeLocalValue(fallback);
  }
  date.setHours(date.getHours() + hours);
  return toDateTimeLocalValue(date);
}

export const TEST_IDS_DEFAULTS = {
  accountCount: 5,
  perUserBudgetUsd: 10,
};

export const CLEANUP_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidCleanupTime(value) {
  return Boolean(value && CLEANUP_TIME_PATTERN.test(String(value).trim()));
}

export const TEST_IDS_MAX_ACCOUNT_COUNT = 5;

export function clampTestIdsAccountCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(TEST_IDS_MAX_ACCOUNT_COUNT, Math.max(1, Math.trunc(parsed)));
}

export function isProjectDetailsComplete(input) {
  if (!String(input.projectName || '').trim()) return false;
  if (!input.idMode) return false;
  if (!Number.isInteger(input.accountCount) || input.accountCount <= 0) return false;
  if (input.idMode === 'test_ids' && input.accountCount > TEST_IDS_MAX_ACCOUNT_COUNT) {
    return false;
  }
  if (!input.startDate || !input.endDate) return false;
  return new Date(input.endDate) >= new Date(input.startDate);
}
