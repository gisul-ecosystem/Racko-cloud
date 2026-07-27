/**
 * Limits concurrent PostgreSQL operations so Supabase session pooler
 * (typically pool_size 15 shared across all app instances) is not exhausted.
 */
class DbQueryGate {
  constructor(maxConcurrent) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.inFlight = 0;
    this.waiters = [];
  }

  async acquire() {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight += 1;
      return;
    }

    await new Promise((resolve) => {
      this.waiters.push(resolve);
    });
    this.inFlight += 1;
  }

  release() {
    this.inFlight = Math.max(0, this.inFlight - 1);

    if (this.waiters.length > 0) {
      const next = this.waiters.shift();
      next();
    }
  }

  async run(task) {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

const configuredMax = Number(process.env.SUPABASE_DB_MAX_CONCURRENT_QUERIES);
// Allow enough concurrency for large-lab provisioning without exhausting the pooler.
const maxConcurrent =
  Number.isFinite(configuredMax) && configuredMax > 0
    ? Math.min(configuredMax, 12)
    : Math.min(8, Math.max(2, Number(process.env.SUPABASE_DB_POOL_MAX || 10) - 2));

const dbQueryGate = new DbQueryGate(maxConcurrent);

module.exports = {
  DbQueryGate,
  dbQueryGate,
  maxConcurrentDbOperations: maxConcurrent
};
