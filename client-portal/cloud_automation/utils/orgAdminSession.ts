import type { OrgAdminProfile, OrgAdminSession } from '../types/orgAdmin';

const TOKEN_KEY = 'org-admin-session-token';
const PROFILE_KEY = 'org-admin-profile';
const EXPIRES_KEY = 'org-admin-expires-at';

export function saveOrgAdminSession(session: OrgAdminSession): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(TOKEN_KEY, session.sessionToken);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(session.admin));
  localStorage.setItem(EXPIRES_KEY, session.expiresAt);
}

export function loadOrgAdminSession(): OrgAdminSession | null {
  if (typeof window === 'undefined') return null;

  const sessionToken = localStorage.getItem(TOKEN_KEY)?.trim();
  const expiresAt = localStorage.getItem(EXPIRES_KEY)?.trim();
  const profileRaw = localStorage.getItem(PROFILE_KEY);

  if (!sessionToken || !expiresAt || !profileRaw) {
    return null;
  }

  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    clearOrgAdminSession();
    return null;
  }

  let admin: OrgAdminProfile;
  try {
    admin = JSON.parse(profileRaw) as OrgAdminProfile;
  } catch {
    clearOrgAdminSession();
    return null;
  }

  if (!admin?.email || !admin?.username) {
    clearOrgAdminSession();
    return null;
  }

  return { sessionToken, expiresAt, admin };
}

export function clearOrgAdminSession(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}
