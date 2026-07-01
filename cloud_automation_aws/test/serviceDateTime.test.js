import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatServiceDateTime,
  parseServiceDateTime,
} from '../src/utils/serviceDateTime.js';
import { evaluateServicePeriodAccess } from '../src/utils/servicePeriodAccess.js';

test('parseServiceDateTime treats datetime-local as request timezone, not UTC', () => {
  const parsed = parseServiceDateTime('2026-07-01T09:00', 'Asia/Kolkata');
  assert.equal(parsed.toISOString(), '2026-07-01T03:30:00.000Z');
});

test('evaluateServicePeriodAccess formats blocked message in request timezone', () => {
  const request = {
    timezone: 'Asia/Kolkata',
    startDate: parseServiceDateTime('2026-07-01T09:00', 'Asia/Kolkata'),
    endDate: parseServiceDateTime('2026-07-02T09:00', 'Asia/Kolkata'),
  };

  const access = evaluateServicePeriodAccess(
    request,
    new Date('2026-07-01T03:00:00.000Z')
  );

  assert.equal(access.allowed, false);
  assert.match(access.message, /9:00:00 am/i);
});

test('evaluateServicePeriodAccess allows after local start time', () => {
  const request = {
    timezone: 'Asia/Kolkata',
    startDate: parseServiceDateTime('2026-07-01T09:00', 'Asia/Kolkata'),
    endDate: parseServiceDateTime('2026-07-02T09:00', 'Asia/Kolkata'),
  };

  const access = evaluateServicePeriodAccess(
    request,
    new Date('2026-07-01T04:00:00.000Z')
  );

  assert.equal(access.allowed, true);
});

test('formatServiceDateTime renders stored UTC instant in local timezone', () => {
  const formatted = formatServiceDateTime(
    new Date('2026-07-01T03:30:00.000Z'),
    'Asia/Kolkata'
  );
  assert.match(formatted, /9:00:00 am/i);
});
