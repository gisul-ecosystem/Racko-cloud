import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSessionStartLookbackMinutes,
  isRecentActivityEvent,
} from '../src/services/awsConsoleLoginMonitor.js';

describe('session start lookback', () => {
  it('caps start lookback at 3 minutes by default', () => {
    const originalIdle = process.env.AWS_SESSION_IDLE_MINUTES;
    const originalStart = process.env.AWS_SESSION_START_LOOKBACK_MINUTES;
    process.env.AWS_SESSION_IDLE_MINUTES = '15';
    delete process.env.AWS_SESSION_START_LOOKBACK_MINUTES;

    assert.equal(getSessionStartLookbackMinutes(), 3);

    process.env.AWS_SESSION_IDLE_MINUTES = originalIdle;
    if (originalStart == null) {
      delete process.env.AWS_SESSION_START_LOOKBACK_MINUTES;
    } else {
      process.env.AWS_SESSION_START_LOOKBACK_MINUTES = originalStart;
    }
  });

  it('treats only very recent CloudTrail events as live activity', () => {
    const now = new Date('2026-07-13T08:10:00.000Z');
    const originalIdle = process.env.AWS_SESSION_IDLE_MINUTES;
    const originalStart = process.env.AWS_SESSION_START_LOOKBACK_MINUTES;
    process.env.AWS_SESSION_IDLE_MINUTES = '5';
    process.env.AWS_SESSION_START_LOOKBACK_MINUTES = '2';

    assert.equal(isRecentActivityEvent('2026-07-13T08:09:30.000Z', now), true);
    assert.equal(isRecentActivityEvent('2026-07-13T08:07:00.000Z', now), false);

    process.env.AWS_SESSION_IDLE_MINUTES = originalIdle;
    if (originalStart == null) {
      delete process.env.AWS_SESSION_START_LOOKBACK_MINUTES;
    } else {
      process.env.AWS_SESSION_START_LOOKBACK_MINUTES = originalStart;
    }
  });
});
