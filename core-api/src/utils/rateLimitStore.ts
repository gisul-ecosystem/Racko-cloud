/**
 * Shared fixed-window rate limit store (in-memory today).
 * No Redis in core-api/gateway yet — swap via setRateLimitStore() when REDIS_URL exists.
 */

export interface RateLimitConsumeResult {
  allowed: boolean;
  /** Seconds until the current window resets (for Retry-After). */
  retryAfterSec: number;
  count: number;
}

export interface RateLimitStore {
  /** Increment and enforce limit (public API). */
  consume(key: string, windowMs: number, limit: number): Promise<RateLimitConsumeResult>;
  /** Current count in window without incrementing. */
  count(key: string, windowMs: number): Promise<number>;
  /** Increment count in window (OAuth invalid_client failures). */
  increment(key: string, windowMs: number): Promise<number>;
}

interface Bucket {
  count: number;
  windowStart: number;
}

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  private getBucket(key: string, now: number, windowMs: number): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = { count: 0, windowStart: now };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private retryAfterSec(bucket: Bucket, windowMs: number, now: number): number {
    return Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
  }

  async count(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    return this.getBucket(key, now, windowMs).count;
  }

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const bucket = this.getBucket(key, now, windowMs);
    bucket.count += 1;
    return bucket.count;
  }

  async consume(key: string, windowMs: number, limit: number): Promise<RateLimitConsumeResult> {
    const now = Date.now();
    const bucket = this.getBucket(key, now, windowMs);
    bucket.count += 1;

    if (bucket.count > limit) {
      return {
        allowed: false,
        retryAfterSec: this.retryAfterSec(bucket, windowMs, now),
        count: bucket.count,
      };
    }

    return { allowed: true, retryAfterSec: 0, count: bucket.count };
  }
}

let store: RateLimitStore = new InMemoryRateLimitStore();

/** Inject a Redis-backed store when available. */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

export function getRateLimitStore(): RateLimitStore {
  return store;
}
