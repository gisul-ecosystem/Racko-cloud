import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addUtcDays,
  isProjectEndDateOnWarningDay,
  isProjectEndDatePast,
  startOfUtcDay,
} from './projectExpiryDates';

test('isProjectEndDatePast is true when end date is before today (UTC)', () => {
  const now = new Date('2026-03-10T15:00:00.000Z');
  const endDate = new Date('2026-03-09T00:00:00.000Z');
  assert.equal(isProjectEndDatePast(endDate, now), true);
});

test('isProjectEndDatePast is false on end date day', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');
  const endDate = new Date('2026-03-10T23:59:00.000Z');
  assert.equal(isProjectEndDatePast(endDate, now), false);
});

test('isProjectEndDateOnWarningDay matches tomorrow when warningDays=1', () => {
  const now = new Date('2026-03-10T10:00:00.000Z');
  const endDate = addUtcDays(startOfUtcDay(now), 1);
  assert.equal(isProjectEndDateOnWarningDay(endDate, 1, now), true);
});

test('isProjectEndDateOnWarningDay ignores other days', () => {
  const now = new Date('2026-03-10T10:00:00.000Z');
  const endDate = addUtcDays(startOfUtcDay(now), 3);
  assert.equal(isProjectEndDateOnWarningDay(endDate, 1, now), false);
});
