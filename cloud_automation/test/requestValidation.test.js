const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../src/utils/AppError');
const { validateRequestPayload } = require('../src/validators/requestPayloadValidator');
const {
  createDefaultSchedule,
  validateUsageSchedule,
  getMaxDailyLimitMinutes,
  getZonedParts,
} = require('../src/utils/usageSchedule');

const validPayload = {
  customerEmail: 'customer@example.com',
  accountCount: 5,
  location: 'eastus',
  serviceIds: [1, 2],
  selectedRoles: [
    { serviceId: 1, roles: ['Contributor'] },
    { serviceId: 2, roles: ['Reader'] },
  ],
  selectedInstances: [{ serviceId: 1, instanceOption: 'Standard_B2s' }],
  startDate: '2026-06-01T09:00:00',
  endDate: '2026-07-01T09:00:00',
  enableDailyUsage: false,
};

function expectValidationError(fn, messageIncludes) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 400);
    if (messageIncludes) {
      assert.match(error.message, new RegExp(messageIncludes, 'i'));
    }
    return true;
  });
}

test('validateRequestPayload accepts a valid request payload', () => {
  assert.doesNotThrow(() => validateRequestPayload(validPayload));
});

test('validateRequestPayload rejects invalid customer email', () => {
  expectValidationError(
    () => validateRequestPayload({ ...validPayload, customerEmail: 'not-an-email' }),
    'customerEmail'
  );
});

test('validateRequestPayload rejects non-positive account count', () => {
  expectValidationError(
    () => validateRequestPayload({ ...validPayload, accountCount: 0 }),
    'accountCount'
  );
});

test('validateRequestPayload requires startDate and endDate', () => {
  const { startDate, ...withoutStart } = validPayload;
  expectValidationError(() => validateRequestPayload(withoutStart), 'startDate');

  const { endDate, ...withoutEnd } = validPayload;
  expectValidationError(() => validateRequestPayload(withoutEnd), 'endDate');
});

test('validateRequestPayload rejects endDate before startDate', () => {
  expectValidationError(
    () =>
      validateRequestPayload({
        ...validPayload,
        startDate: '2026-08-01T09:00:00',
        endDate: '2026-07-01T09:00:00',
      }),
    'endDate must be on or after startDate'
  );
});

test('validateRequestPayload rejects unknown selectedRoles serviceId', () => {
  expectValidationError(
    () =>
      validateRequestPayload({
        ...validPayload,
        selectedRoles: [{ serviceId: 99, roles: ['Contributor'] }],
      }),
    'unknown serviceId'
  );
});

test('validateRequestPayload rejects unknown selectedInstances serviceId', () => {
  expectValidationError(
    () =>
      validateRequestPayload({
        ...validPayload,
        selectedInstances: [{ serviceId: 99, instanceOption: 'Standard_B2s' }],
      }),
    'unknown serviceId'
  );
});

test('validateRequestPayload requires usageSchedule when daily usage is enabled', () => {
  expectValidationError(
    () =>
      validateRequestPayload({
        ...validPayload,
        enableDailyUsage: true,
      }),
    'usageSchedule is required'
  );
});

test('validateUsageSchedule accepts a default schedule', () => {
  const schedule = createDefaultSchedule('UTC');
  assert.deepEqual(validateUsageSchedule(schedule), []);
});

test('validateUsageSchedule rejects invalid timezone', () => {
  const schedule = createDefaultSchedule('Not/A_Timezone');
  const errors = validateUsageSchedule(schedule);
  assert.ok(errors.some((error) => /timezone is invalid/i.test(error)));
});

test('validateUsageSchedule rejects invalid time ranges', () => {
  const schedule = createDefaultSchedule('UTC');
  schedule.days.monday.slots = [{ start: '18:00', end: '09:00' }];
  const errors = validateUsageSchedule(schedule);
  assert.ok(errors.some((error) => /invalid time slot/i.test(error)));
});

test('validateUsageSchedule requires positive limitMinutes on enabled days', () => {
  const schedule = createDefaultSchedule('UTC');
  schedule.days.monday.limitMinutes = 0;
  const errors = validateUsageSchedule(schedule);
  assert.ok(errors.some((error) => /positive limitMinutes/i.test(error)));
});

test('getMaxDailyLimitMinutes returns the highest enabled day limit', () => {
  const schedule = createDefaultSchedule('UTC');
  schedule.days.monday.limitMinutes = 90;
  schedule.days.tuesday.limitMinutes = 240;
  assert.equal(getMaxDailyLimitMinutes(schedule), 240);
});

test('validateRequestPayload accepts per_user costing mode', () => {
  assert.doesNotThrow(() =>
    validateRequestPayload({
      ...validPayload,
      costingMode: 'per_user',
    })
  );
});

test('validateRequestPayload rejects invalid costing mode', () => {
  expectValidationError(
    () => validateRequestPayload({ ...validPayload, costingMode: 'invalid' }),
    "costingMode must be 'shared' or 'per_user'"
  );
});

test('validateRequestPayload requires cleanup interval when cleanup is enabled', () => {
  expectValidationError(
    () => validateRequestPayload({ ...validPayload, cleanupEnabled: true }),
    'Cleanup interval is required when schedule cleanup is enabled'
  );
});

test('validateRequestPayload accepts scheduled cleanup fields', () => {
  assert.doesNotThrow(() =>
    validateRequestPayload({
      ...validPayload,
      cleanupEnabled: true,
      cleanupIntervalHours: 2,
      perUserBudgetUsd: 50
    })
  );
});

test('validateRequestPayload rejects invalid per-user budget', () => {
  expectValidationError(
    () => validateRequestPayload({ ...validPayload, perUserBudgetUsd: 0 }),
    'perUserBudgetUsd'
  );
});

test('validateRequestPayload requires resource cleanup interval when enabled', () => {
  expectValidationError(
    () => validateRequestPayload({ ...validPayload, resourceCleanupEnabled: true }),
    'Cleanup interval is required when resource cleanup is enabled'
  );
});

test('validateRequestPayload accepts resource cleanup and usage windows', () => {
  assert.doesNotThrow(() =>
    validateRequestPayload({
      ...validPayload,
      resourceCleanupEnabled: true,
      resourceCleanupIntervalHours: 2,
      usageWindows: [
        {
          day_of_week: 1,
          window_start_time: '09:00',
          window_end_time: '17:00',
          timezone: 'Asia/Kolkata',
          daily_limit_hours: 4
        }
      ]
    })
  );
});

test('validateRequestPayload rejects invalid daily_limit_hours', () => {
  expectValidationError(
    () =>
      validateRequestPayload({
        ...validPayload,
        usageWindows: [
          {
            day_of_week: 1,
            window_start_time: '09:00',
            window_end_time: '17:00',
            daily_limit_hours: 25
          }
        ]
      }),
    'daily_limit_hours must be a positive number up to 24'
  );
});

test('validateRequestPayload rejects invalid usage window times', () => {
  expectValidationError(
    () =>
      validateRequestPayload({
        ...validPayload,
        usageWindows: [
          {
            day_of_week: 1,
            window_start_time: '18:00',
            window_end_time: '09:00'
          }
        ]
      }),
    'window_end_time must be after window_start_time'
  );
});

test('getZonedParts resolves weekday in timezone', () => {
  const parts = getZonedParts(new Date('2026-06-15T15:00:00Z'), 'UTC');
  assert.equal(parts.weekday, 'monday');
  assert.equal(parts.hour, 15);
});
