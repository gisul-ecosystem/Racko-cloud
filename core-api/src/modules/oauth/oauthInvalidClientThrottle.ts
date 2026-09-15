import { getRateLimitStore } from '../../utils/rateLimitStore';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 20;

function bucketKey(throttleKey: string): string {
  return `oauth:invalid_client:${throttleKey}`;
}

export async function assertInvalidClientAllowed(throttleKey: string): Promise<void> {
  const count = await getRateLimitStore().count(bucketKey(throttleKey), WINDOW_MS);
  if (count >= MAX_FAILURES) {
    throw new OAuthThrottleError();
  }
}

export async function recordInvalidClient(throttleKey: string): Promise<void> {
  await getRateLimitStore().increment(bucketKey(throttleKey), WINDOW_MS);
}

/** Same OAuth error shape as invalid_client — do not reveal throttle vs bad secret. */
export class OAuthThrottleError extends Error {
  readonly statusCode = 401;
  readonly error = 'invalid_client' as const;
  readonly errorDescription = 'Client authentication failed.';
}
