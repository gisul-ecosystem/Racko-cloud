const test = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const {
  normalizeTimeToComparable,
  isWithinUsageWindowTime
} = require('../src/utils/usageWindowTime');

test('normalizeTimeToComparable handles HH:mm and HH:mm:ss', () => {
  assert.equal(normalizeTimeToComparable('09:00'), '09:00:00');
  assert.equal(normalizeTimeToComparable('09:00:00'), '09:00:00');
  assert.equal(normalizeTimeToComparable('9:30'), '09:30:00');
});

test('isWithinUsageWindowTime opens at configured start time', () => {
  const windows = [
    {
      day_of_week: DateTime.fromISO('2026-07-27T09:00:00', { zone: 'Asia/Kolkata' }).weekday % 7,
      window_start_time: '09:00:00',
      window_end_time: '18:00:00',
      timezone: 'Asia/Kolkata'
    }
  ];

  const atNine = DateTime.fromISO('2026-07-27T09:00:00', { zone: 'Asia/Kolkata' }).toJSDate();
  const beforeNine = DateTime.fromISO('2026-07-27T08:59:59', { zone: 'Asia/Kolkata' }).toJSDate();

  assert.equal(isWithinUsageWindowTime(windows, atNine), true);
  assert.equal(isWithinUsageWindowTime(windows, beforeNine), false);
});

test('isWithinUsageWindowTime matches day_of_week as string from postgres', () => {
  const windows = [
    {
      day_of_week: '1',
      window_start_time: '09:00:00',
      window_end_time: '18:00:00',
      timezone: 'Asia/Kolkata'
    }
  ];

  const mondayTen = DateTime.fromISO('2026-07-27T10:00:00', { zone: 'Asia/Kolkata' }).toJSDate();
  assert.equal(isWithinUsageWindowTime(windows, mondayTen), true);
});
