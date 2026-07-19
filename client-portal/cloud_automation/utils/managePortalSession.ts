import type { ManagePortalSession } from '../types/managePortal';

const STORAGE_PREFIX = 'racko.managePortal.';

const KEYS = {
  sessionToken: `${STORAGE_PREFIX}sessionToken`,
  requestId: `${STORAGE_PREFIX}requestId`,
  customerEmail: `${STORAGE_PREFIX}customerEmail`,
  resourceGroup: `${STORAGE_PREFIX}resourceGroup`,
  expiresAt: `${STORAGE_PREFIX}expiresAt`,
  userId: `${STORAGE_PREFIX}userId`,
  role: `${STORAGE_PREFIX}role`,
} as const;

export function saveManagePortalSession(session: ManagePortalSession): void {
  if (typeof window === 'undefined') return;

  sessionStorage.setItem(KEYS.sessionToken, session.sessionToken);
  sessionStorage.setItem(KEYS.requestId, String(session.requestId));
  sessionStorage.setItem(KEYS.customerEmail, session.customerEmail);
  sessionStorage.setItem(KEYS.resourceGroup, session.resourceGroup ?? '');
  sessionStorage.setItem(KEYS.expiresAt, session.expiresAt);
  sessionStorage.setItem(KEYS.userId, session.userId != null ? String(session.userId) : '');
  sessionStorage.setItem(KEYS.role, session.role);
}

export function loadManagePortalSession(): ManagePortalSession | null {
  if (typeof window === 'undefined') return null;

  const sessionToken = sessionStorage.getItem(KEYS.sessionToken)?.trim();
  const requestIdRaw = sessionStorage.getItem(KEYS.requestId);
  const customerEmail = sessionStorage.getItem(KEYS.customerEmail)?.trim();
  const expiresAt = sessionStorage.getItem(KEYS.expiresAt)?.trim();

  if (!sessionToken || !requestIdRaw || !customerEmail || !expiresAt) {
    return null;
  }

  const requestId = Number(requestIdRaw);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return null;
  }

  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    clearManagePortalSession();
    return null;
  }

  const userIdRaw = sessionStorage.getItem(KEYS.userId)?.trim();
  const userId = userIdRaw ? Number(userIdRaw) : null;
  const roleRaw = sessionStorage.getItem(KEYS.role)?.trim();
  const role: ManagePortalSession['role'] = roleRaw === 'user' ? 'user' : 'admin';

  return {
    sessionToken,
    requestId,
    customerEmail,
    resourceGroup: sessionStorage.getItem(KEYS.resourceGroup) || null,
    expiresAt,
    userId: userId != null && Number.isInteger(userId) ? userId : null,
    role,
  };
}

export function clearManagePortalSession(): void {
  if (typeof window === 'undefined') return;

  Object.values(KEYS).forEach((key) => sessionStorage.removeItem(key));
}

export function isSessionActive(session: ManagePortalSession | null): boolean {
  if (!session) return false;
  return new Date(session.expiresAt).getTime() > Date.now();
}
