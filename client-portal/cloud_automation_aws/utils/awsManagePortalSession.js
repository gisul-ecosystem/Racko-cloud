const STORAGE_PREFIX = 'racko.awsManagePortal.';

const KEYS = {
  jwtToken: `${STORAGE_PREFIX}jwtToken`,
  requestId: `${STORAGE_PREFIX}requestId`,
  customerEmail: `${STORAGE_PREFIX}customerEmail`,
  expiresAt: `${STORAGE_PREFIX}expiresAt`,
};

export function saveAwsManagePortalSession(session) {
  if (typeof window === 'undefined') return;

  sessionStorage.setItem(KEYS.jwtToken, session.jwtToken);
  sessionStorage.setItem(KEYS.requestId, String(session.requestId));
  sessionStorage.setItem(KEYS.customerEmail, session.customerEmail);
  sessionStorage.setItem(KEYS.expiresAt, session.expiresAt);
}

export function loadAwsManagePortalSession() {
  if (typeof window === 'undefined') return null;

  const jwtToken = sessionStorage.getItem(KEYS.jwtToken)?.trim();
  const requestId = sessionStorage.getItem(KEYS.requestId)?.trim();
  const customerEmail = sessionStorage.getItem(KEYS.customerEmail)?.trim();
  const expiresAt = sessionStorage.getItem(KEYS.expiresAt)?.trim();

  if (!jwtToken || !requestId || !customerEmail || !expiresAt) {
    return null;
  }

  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    clearAwsManagePortalSession();
    return null;
  }

  return { jwtToken, requestId, customerEmail, expiresAt };
}

export function clearAwsManagePortalSession() {
  if (typeof window === 'undefined') return;
  Object.values(KEYS).forEach((key) => sessionStorage.removeItem(key));
}
