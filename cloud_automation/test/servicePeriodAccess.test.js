const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateServicePeriodAccess } = require('../src/utils/servicePeriodAccess');

test('evaluateServicePeriodAccess blocks before starts_at', () => {
  const access = evaluateServicePeriodAccess(
    {
      starts_at: '2026-08-01T09:00:00.000Z',
      expires_at: '2026-08-10T18:00:00.000Z'
    },
    new Date('2026-07-31T12:00:00.000Z')
  );

  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'before_start');
});

test('evaluateServicePeriodAccess allows within service period', () => {
  const access = evaluateServicePeriodAccess(
    {
      starts_at: '2026-08-01T09:00:00.000Z',
      expires_at: '2026-08-10T18:00:00.000Z'
    },
    new Date('2026-08-05T12:00:00.000Z')
  );

  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'ok');
});
