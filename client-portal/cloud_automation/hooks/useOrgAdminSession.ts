'use client';

import { useCallback, useEffect, useState } from 'react';
import { OrgAdminError, loginOrgAdmin } from '../api/orgAdminClient';
import type { OrgAdminSession } from '../types/orgAdmin';
import {
  clearOrgAdminSession,
  loadOrgAdminSession,
  saveOrgAdminSession,
} from '../utils/orgAdminSession';

interface UseOrgAdminSessionResult {
  session: OrgAdminSession | null;
  bootstrapping: boolean;
  loginError: string | null;
  sessionExpired: boolean;
  login: (params: { email: string; username: string; password: string }) => Promise<boolean>;
  logout: () => void;
  invalidateSession: () => void;
  clearLoginError: () => void;
}

export function useOrgAdminSession(): UseOrgAdminSessionResult {
  const [session, setSession] = useState<OrgAdminSession | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    setSession(loadOrgAdminSession());
    setBootstrapping(false);
  }, []);

  const logout = useCallback(() => {
    clearOrgAdminSession();
    setSession(null);
    setSessionExpired(false);
    setLoginError(null);
  }, []);

  const invalidateSession = useCallback(() => {
    clearOrgAdminSession();
    setSession(null);
    setSessionExpired(true);
  }, []);

  const login = useCallback(
    async (params: { email: string; username: string; password: string }) => {
      setLoginError(null);
      setSessionExpired(false);

      try {
        const result = await loginOrgAdmin(params);
        const nextSession: OrgAdminSession = {
          sessionToken: result.sessionToken,
          expiresAt: result.expiresAt,
          admin: result.admin,
        };

        saveOrgAdminSession(nextSession);
        setSession(nextSession);
        return true;
      } catch (error) {
        if (error instanceof OrgAdminError) {
          setLoginError(error.message);
        } else {
          setLoginError('Unable to sign in. Please try again.');
        }
        return false;
      }
    },
    []
  );

  const clearLoginError = useCallback(() => {
    setLoginError(null);
  }, []);

  return {
    session,
    bootstrapping,
    loginError,
    sessionExpired,
    login,
    logout,
    invalidateSession,
    clearLoginError,
  };
}
