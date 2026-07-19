const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollUntil(fn, options = {}) {
  const {
    intervalMs = 5000,
    timeoutMs = 20 * 60 * 1000,
    isComplete = (result) => Boolean(result),
    isFailed = () => false,
    onPoll = null,
  } = options;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await fn();

    if (onPoll) {
      onPoll(result);
    }

    if (isFailed(result)) {
      const reason =
        result?.message ||
        result?.failureReason ||
        result?.reason ||
        'Polling failed';
      const error = new Error(reason);
      error.details = result;
      throw error;
    }

    if (isComplete(result)) {
      return result;
    }

    await sleep(intervalMs);
  }

  const error = new Error(`Polling timed out after ${timeoutMs}ms`);
  error.code = 'POLL_TIMEOUT';
  throw error;
}
