const STORAGE_PREFIX = 'racko.awsManagePortal.';

const KEYS = {
  jwtToken: `${STORAGE_PREFIX}jwtToken`,
  requestId: `${STORAGE_PREFIX}requestId`,
  customerEmail: `${STORAGE_PREFIX}customerEmail`,
  expiresAt: `${STORAGE_PREFIX}expiresAt`,
  role: `${STORAGE_PREFIX}role`,
  userIndex: `${STORAGE_PREFIX}userIndex`,
  username: `${STORAGE_PREFIX}username`,
};

export function saveAwsManagePortalSession(session) {
  if (typeof window === 'undefined') return;

  sessionStorage.setItem(KEYS.jwtToken, session.jwtToken);
  sessionStorage.setItem(KEYS.requestId, String(session.requestId));
  sessionStorage.setItem(KEYS.customerEmail, session.customerEmail);
  sessionStorage.setItem(KEYS.expiresAt, session.expiresAt);
  sessionStorage.setItem(KEYS.role, session.role || 'admin');
  if (session.userIndex != null) {
    sessionStorage.setItem(KEYS.userIndex, String(session.userIndex));
  } else {
    sessionStorage.removeItem(KEYS.userIndex);
  }
  if (session.username) {
    sessionStorage.setItem(KEYS.username, session.username);
  } else {
    sessionStorage.removeItem(KEYS.username);
  }
}

export function loadAwsManagePortalSession() {
  if (typeof window === 'undefined') return null;

  const jwtToken = sessionStorage.getItem(KEYS.jwtToken)?.trim();
  const requestId = sessionStorage.getItem(KEYS.requestId)?.trim();
  const customerEmail = sessionStorage.getItem(KEYS.customerEmail)?.trim();
  const expiresAt = sessionStorage.getItem(KEYS.expiresAt)?.trim();
  const roleRaw = sessionStorage.getItem(KEYS.role)?.trim();
  const userIndexRaw = sessionStorage.getItem(KEYS.userIndex)?.trim();
  const username = sessionStorage.getItem(KEYS.username)?.trim() || null;

  if (!jwtToken || !requestId || !customerEmail || !expiresAt) {
    return null;
  }

  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    clearAwsManagePortalSession();
    return null;
  }

  const role = roleRaw === 'user' ? 'user' : 'admin';
  const userIndex =
    userIndexRaw != null && userIndexRaw !== '' ? Number(userIndexRaw) : null;

  return {
    jwtToken,
    requestId,
    customerEmail,
    expiresAt,
    role,
    userIndex,
    username,
  };
}

export function clearAwsManagePortalSession() {
  if (typeof window === 'undefined') return;
  Object.values(KEYS).forEach((key) => sessionStorage.removeItem(key));
}
