const DEFAULT_PROXIMITY_MINUTES = 2;

const getSignInSessionProximityMs = () =>
  Number(process.env.SIGNIN_SESSION_PROXIMITY_MINUTES || DEFAULT_PROXIMITY_MINUTES) * 60 * 1000;

/**
 * True when a Graph sign-in event should attach to an existing open session
 * (Portal + ARM + resource-token events from one real login).
 */
function isSignInNearOpenSession(loginTime, sessionLoginAt, proximityMs = getSignInSessionProximityMs()) {
  const signInMs = loginTime instanceof Date ? loginTime.getTime() : new Date(loginTime).getTime();
  const sessionMs =
    sessionLoginAt instanceof Date ? sessionLoginAt.getTime() : new Date(sessionLoginAt).getTime();

  if (!Number.isFinite(signInMs) || !Number.isFinite(sessionMs)) {
    return false;
  }

  return Math.abs(signInMs - sessionMs) <= proximityMs;
}

module.exports = {
  DEFAULT_PROXIMITY_MINUTES,
  getSignInSessionProximityMs,
  isSignInNearOpenSession
};
