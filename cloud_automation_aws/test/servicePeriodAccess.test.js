import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateServicePeriodAccess,
  assertConsoleAccessAllowed,
} from '../src/utils/servicePeriodAccess.js';

test('evaluateServicePeriodAccess blocks before start date', () => {
  const request = {
    startDate: new Date('2026-06-26T09:00:00'),
    endDate: new Date('2026-07-26T09:00:00'),
  };

  const access = evaluateServicePeriodAccess(request, new Date('2026-06-25T12:00:00'));

  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'before_start');
});

test('evaluateServicePeriodAccess allows within service window', () => {
  const request = {
    startDate: new Date('2026-06-26T09:00:00'),
    endDate: new Date('2026-07-26T09:00:00'),
  };

  const access = evaluateServicePeriodAccess(request, new Date('2026-06-26T10:00:00'));

  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'ok');
});

test('assertConsoleAccessAllowed throws before start date', () => {
  const request = {
    startDate: new Date('2026-06-26T09:00:00'),
    endDate: new Date('2026-07-26T09:00:00'),
  };

  assert.throws(
    () => assertConsoleAccessAllowed(request, new Date('2026-06-25T12:00:00')),
    (err) => err.statusCode === 403
  );
});
