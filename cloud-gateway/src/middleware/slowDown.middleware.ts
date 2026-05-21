import slowDown from 'express-slow-down';

/**
 * Progressive slow-down for login endpoint.
 * Slows after 3 attempts, adds 500ms delay per request after that.
 * Effectively blocks after 10 attempts (5000ms delay).
 */
export const loginSlowDown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 3,             // start slowing after 3 requests
  delayMs: (used) => (used - 3) * 500, // 500ms per request above threshold
  maxDelayMs: 5000,          // cap at 5 seconds
});
