/**
 * Resolve logout timestamp and duration when closing a stale open session.
 * When daily limit was already enforced, never truncate to last_seen_at.
 */
function resolveStaleSessionClose({
  loginAt,
  lastSeenAt,
  now = new Date(),
  limitReached = false,
  limitReachedAt = null
}) {
  const login = loginAt instanceof Date ? loginAt : new Date(loginAt);
  const lastSeen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  const at = now instanceof Date ? now : new Date(now);

  let closeAt;
  let endedReason;

  if (limitReached) {
    const enforcementAt = limitReachedAt
      ? limitReachedAt instanceof Date
        ? limitReachedAt
        : new Date(limitReachedAt)
      : at;
    closeAt = enforcementAt > at ? at : enforcementAt;
    endedReason = 'daily_limit_reached';
  } else {
    closeAt = lastSeen;
    endedReason = 'stale_signin';
  }

  const durationMins = Math.max(1, Math.floor((closeAt.getTime() - login.getTime()) / 60000));

  return { closeAt, durationMins, endedReason };
}

module.exports = {
  resolveStaleSessionClose
};
