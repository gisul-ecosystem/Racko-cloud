const COUNTABLE_KEYS = [
  'terminated',
  'stopped',
  'deleted',
  'bucketsDeleted',
  'notebooksDeleted',
  'trainingJobsStopped',
  'instancesDeleted',
  'dbsDeleted',
];

export function countCleanupDeleted(results) {
  if (!results || typeof results !== 'object') return 0;

  if (Array.isArray(results)) {
    return results.reduce((sum, entry) => sum + countCleanupDeleted(entry), 0);
  }

  let count = 0;

  for (const [key, value] of Object.entries(results)) {
    if (key === 'userIndex') continue;
    if (!value || typeof value !== 'object') continue;

    let serviceCount = 0;
    for (const metric of COUNTABLE_KEYS) {
      serviceCount += Number(value[metric] || 0);
    }

    if (serviceCount === 0 && value.error) continue;

    count += serviceCount;
  }

  return count;
}

export function buildRequestLabel(request) {
  const requestId = String(request._id || request.requestId || '');
  return request.requestName?.trim() || `Request #${requestId.slice(-8)}`;
}
