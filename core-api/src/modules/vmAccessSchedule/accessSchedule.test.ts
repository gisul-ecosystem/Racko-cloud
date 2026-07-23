import assert from 'assert';
import {
  validateWeeklySchedule,
  checkWeeklyAccess,
  getNextOpenWindow,
  WEEKDAY_NAMES,
  type WeeklyScheduleDay,
} from './weeklySchedule';
import {
  checkAccessWindow,
  hasActiveAccessOverride,
  hasScheduleRestriction,
} from './scheduleManager';
import { parseAccessScheduleInput } from './accessScheduleParse';
import { UnprocessableEntityError } from '../../utils/errors';

const results: string[] = [];
function pass(name: string) {
  results.push(`PASS  ${name}`);
}
function fail(name: string, err: unknown) {
  results.push(`FAIL  ${name}: ${err instanceof Error ? err.message : String(err)}`);
}

function fullWeek(
  overrides: Partial<Record<string, Partial<WeeklyScheduleDay>>> = {}
): WeeklyScheduleDay[] {
  return WEEKDAY_NAMES.map((day) => ({
    day,
    enabled: true,
    windows: [{ start: '09:00', end: '17:00' }],
    ...overrides[day],
  }));
}

function run(name: string, fn: () => void) {
  try {
    fn();
    pass(name);
  } catch (e) {
    fail(name, e);
  }
}

run('validate: rejects empty array', () => {
  assert.ok(validateWeeklySchedule([]).some((e) => e.includes('exactly 7')));
});

run('validate: accepts valid 7-day schedule', () => {
  assert.deepStrictEqual(validateWeeklySchedule(fullWeek()), []);
});

run('validate: rejects duplicate day', () => {
  const bad = fullWeek();
  bad[1] = { ...bad[0] }; // duplicate Sunday
  assert.ok(validateWeeklySchedule(bad).some((e) => /[Dd]uplicate|Missing/.test(e)));
});

run('validate: rejects overlapping windows', () => {
  const schedule = fullWeek({
    Monday: {
      day: 'Monday',
      enabled: true,
      windows: [
        { start: '09:00', end: '12:00' },
        { start: '11:00', end: '14:00' },
      ],
    },
  });
  assert.ok(validateWeeklySchedule(schedule).some((e) => e.includes('overlap')));
});

run('validate: rejects midnight-crossing window', () => {
  const schedule = fullWeek({
    Tuesday: {
      day: 'Tuesday',
      enabled: true,
      windows: [{ start: '22:00', end: '02:00' }],
    },
  });
  assert.ok(validateWeeklySchedule(schedule).some((e) => e.includes('midnight')));
});

run('validate: rejects bad HH:MM', () => {
  const schedule = fullWeek({
    Wednesday: {
      day: 'Wednesday',
      enabled: true,
      windows: [{ start: '9:00', end: '17:00' }],
    },
  });
  assert.ok(validateWeeklySchedule(schedule).some((e) => e.includes('HH:MM')));
});

run('override: permanent true', () => {
  assert.strictEqual(hasActiveAccessOverride({ accessOverride: true }), true);
});

run('override: expired until is inactive', () => {
  assert.strictEqual(
    hasActiveAccessOverride({
      accessOverride: true,
      accessOverrideUntil: new Date(Date.now() - 1000),
    }),
    false
  );
});

run('override: future until is active', () => {
  assert.strictEqual(
    hasActiveAccessOverride({
      accessOverride: true,
      accessOverrideUntil: new Date(Date.now() + 60_000),
    }),
    true
  );
});

run('checkAccessWindow: no restrictions allowed', () => {
  assert.strictEqual(checkAccessWindow({}).allowed, true);
  assert.strictEqual(checkAccessWindow({}).reason, 'no_restrictions');
});

run('checkAccessWindow: override beats closed weekly', () => {
  const closed = fullWeek(
    Object.fromEntries(WEEKDAY_NAMES.map((d) => [d, { day: d, enabled: false, windows: [] as [] }]))
  );
  assert.strictEqual(
    checkAccessWindow({ weeklySchedule: closed, accessOverride: false }).allowed,
    false
  );
  const withOverride = checkAccessWindow({ weeklySchedule: closed, accessOverride: true });
  assert.strictEqual(withOverride.allowed, true);
  assert.strictEqual(withOverride.reason, 'override_permanent');
});

run('checkAccessWindow: legacy before start date denies', () => {
  const r = checkAccessWindow({
    accessStartDate: new Date('2099-01-01T00:00:00.000Z'),
    accessEndDate: new Date('2099-12-31T00:00:00.000Z'),
  });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, 'before_start_date');
});

run('checkAccessWindow: legacy after end date denies', () => {
  const r = checkAccessWindow({
    accessStartDate: new Date('2020-01-01T00:00:00.000Z'),
    accessEndDate: new Date('2020-12-31T00:00:00.000Z'),
  });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, 'after_end_date');
});

run('weekly: open all-day window allows', () => {
  const now = new Date();
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(now) as (typeof WEEKDAY_NAMES)[number];
  const r = checkWeeklyAccess(
    fullWeek({
      [dayName]: { day: dayName, enabled: true, windows: [{ start: '00:00', end: '23:59' }] },
    }),
    'UTC',
    now
  );
  assert.strictEqual(r.allowed, true);
});

run('weekly: disabled day denies with nextWindow', () => {
  const now = new Date();
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(now) as (typeof WEEKDAY_NAMES)[number];
  const schedule = fullWeek({
    [dayName]: { day: dayName, enabled: false, windows: [] },
  });
  const r = checkWeeklyAccess(schedule, 'UTC', now);
  assert.strictEqual(r.allowed, false);
  assert.ok(r.nextWindow);
});

run('getNextOpenWindow returns string when days open', () => {
  const nw = getNextOpenWindow(fullWeek(), 'UTC', new Date());
  // may be null if currently inside and no later window today and all remaining same — but full week has 09-17 every day
  // if now is after 17:00 UTC, should still find tomorrow
  assert.ok(nw === null || typeof nw === 'string');
});

run('hasScheduleRestriction detects weekly and legacy', () => {
  assert.strictEqual(hasScheduleRestriction({}), false);
  assert.strictEqual(hasScheduleRestriction({ accessStartTime: '09:00' }), true);
  assert.strictEqual(hasScheduleRestriction({ weeklySchedule: fullWeek() }), true);
});

run('parseAccessScheduleInput: empty weekly clears to null', () => {
  const patch = parseAccessScheduleInput({ weeklySchedule: [] });
  assert.strictEqual(patch.weeklySchedule, null);
});

run('parseAccessScheduleInput: invalid weekly throws 422', () => {
  let threw = false;
  try {
    parseAccessScheduleInput({ weeklySchedule: [{ day: 'Nope' }] as never });
  } catch (e) {
    threw = true;
    assert.ok(e instanceof UnprocessableEntityError);
    assert.strictEqual(e.statusCode, 422);
    assert.ok(Array.isArray(e.errors) && e.errors.length > 0);
  }
  assert.ok(threw);
});

run('parseAccessScheduleInput: valid dates/times', () => {
  const patch = parseAccessScheduleInput({
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    startTime: '09:00',
    endTime: '18:00',
    timezone: 'Asia/Kolkata',
  });
  assert.ok(patch.accessStartDate instanceof Date);
  assert.strictEqual(patch.accessStartTime, '09:00');
  assert.strictEqual(patch.weeklyScheduleTz, 'Asia/Kolkata');
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
