const test = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { evaluateCombinedLabAccess } = require('../src/utils/labAccess');

const windows = [
  {
    day_of_week: DateTime.fromISO('2026-07-28T10:00:00', { zone: 'Asia/Kolkata' }).weekday % 7,
    window_start_time: '14:48:00',
    window_end_time: '17:00:00',
    timezone: 'Asia/Kolkata'
  }
];

const request = {
  starts_at: '2026-07-28T09:17:00.000Z',
  expires_at: '2026-07-29T11:30:00.000Z'
};

test('evaluateCombinedLabAccess blocks before starts_at even inside daily window', () => {
  const at = DateTime.fromISO('2026-07-28T14:46:00', { zone: 'Asia/Kolkata' }).toJSDate();
  const access = evaluateCombinedLabAccess(request, windows, at);

  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'before_start');
});

test('evaluateCombinedLabAccess blocks after starts_at but before daily window opens', () => {
  const at = DateTime.fromISO('2026-07-28T14:47:30', { zone: 'Asia/Kolkata' }).toJSDate();
  const access = evaluateCombinedLabAccess(request, windows, at);

  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'outside_window');
});

test('evaluateCombinedLabAccess allows when both starts_at and daily window are open', () => {
  const at = DateTime.fromISO('2026-07-28T15:00:00', { zone: 'Asia/Kolkata' }).toJSDate();
  const access = evaluateCombinedLabAccess(request, windows, at);

  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'ok');
});
