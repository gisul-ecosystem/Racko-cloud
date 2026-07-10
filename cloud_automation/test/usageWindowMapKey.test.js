require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadUsageWindowsByRequest } = require('../src/services/usageWindowAccessService');

const buildMapFromRows = (rows) => {
  const usageWindowsByRequest = new Map();

  for (const row of rows) {
    const requestId = Number(row.request_id);
    const list = usageWindowsByRequest.get(requestId) || [];
    list.push(row);
    usageWindowsByRequest.set(requestId, list);
  }

  return usageWindowsByRequest;
};

const resolveWindowsForActiveSessionRow = (usageWindowsByRequest, row) =>
  usageWindowsByRequest.get(Number(row.request_id)) || [];

test('usage window map lookup succeeds when pg row request_id is string', () => {
  const usageWindowsByRequest = buildMapFromRows([
    {
      request_id: 235,
      day_of_week: 4,
      window_start_time: '09:00:00',
      window_end_time: '19:00:00',
      timezone: 'Asia/Kolkata',
      daily_limit_hours: 1
    }
  ]);

  const pgRow = { request_id: '235', user_id: '2334', has_usage_windows: true };
  const windows = resolveWindowsForActiveSessionRow(usageWindowsByRequest, pgRow);

  assert.equal(windows.length, 1);
  assert.equal(windows[0].day_of_week, 4);
});

test('usage window map lookup succeeds when pg row request_id is number', () => {
  const usageWindowsByRequest = buildMapFromRows([
    {
      request_id: 235,
      day_of_week: 4,
      window_start_time: '09:00:00',
      window_end_time: '19:00:00',
      timezone: 'Asia/Kolkata',
      daily_limit_hours: 1
    }
  ]);

  const pgRow = { request_id: 235, user_id: 2334, has_usage_windows: true };
  const windows = resolveWindowsForActiveSessionRow(usageWindowsByRequest, pgRow);

  assert.equal(windows.length, 1);
});

test('string lookup without Number coercion fails (regression guard)', () => {
  const usageWindowsByRequest = buildMapFromRows([
    {
      request_id: 235,
      day_of_week: 4,
      window_start_time: '09:00:00',
      window_end_time: '19:00:00',
      timezone: 'Asia/Kolkata',
      daily_limit_hours: 1
    }
  ]);

  const brokenLookup = usageWindowsByRequest.get('235') || [];
  assert.equal(brokenLookup.length, 0);
});

test('loadUsageWindowsByRequest uses numeric map keys for string request id input', async (t) => {
  const db = require('../src/db/postgres');
  const originalQuery = db.query.bind(db);

  t.after(() => {
    db.query = originalQuery;
  });

  db.query = async (sql, params) => ({
    rows: [
      {
        request_id: 236,
        day_of_week: 4,
        window_start_time: '09:00:00',
        window_end_time: '19:00:00',
        timezone: 'Asia/Kolkata',
        daily_limit_hours: 1
      }
    ]
  });

  const usageWindowsByRequest = await loadUsageWindowsByRequest(['236']);
  const windowsFromStringRow = resolveWindowsForActiveSessionRow(usageWindowsByRequest, {
    request_id: '236'
  });
  const windowsFromNumberRow = resolveWindowsForActiveSessionRow(usageWindowsByRequest, {
    request_id: 236
  });

  assert.equal(windowsFromStringRow.length, 1);
  assert.equal(windowsFromNumberRow.length, 1);
});
