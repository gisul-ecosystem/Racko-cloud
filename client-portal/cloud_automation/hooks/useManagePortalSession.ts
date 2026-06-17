'use client';

import { useCallback, useEffect, useState } from 'react';
import { ManagePortalError, loginManagePortal } from '../api/managePortalClient';
import type { ManagePortalSession } from '../types/managePortal';
import {
  clearManagePortalSession,
  loadManagePortalSession,
  saveManagePortalSession,
} from '../utils/managePortalSession';

interface UseManagePortalSessionResult {
  session: ManagePortalSession | null;
  bootstrapping: boolean;
  loginError: string | null;
  loginErrorKind: ManagePortalError['kind'] | null;
  sessionExpired: boolean;
  login: (params: { token: string; username: string; password: string }) => Promise<boolean>;
  logout: () => void;
  invalidateSession: () => void;
  clearLoginError: () => void;
}

export function useManagePortalSession(enabled: boolean): UseManagePortalSessionResult {
  const [session, setSession] = useState<ManagePortalSession | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginErrorKind, setLoginErrorKind] = useState<ManagePortalError['kind'] | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setBootstrapping(false);
      return;
    }

    setSession(loadManagePortalSession());
    setBootstrapping(false);
  }, [enabled]);

  const logout = useCallback(() => {
    clearManagePortalSession();
    setSession(null);
    setSessionExpired(false);
    setLoginError(null);
    setLoginErrorKind(null);
  }, []);

  const invalidateSession = useCallback(() => {
    clearManagePortalSession();
    setSession(null);
    setSessionExpired(true);
  }, []);

  const login = useCallback(async (params: { token: string; username: string; password: string }) => {
    setLoginError(null);
    setLoginErrorKind(null);
    setSessionExpired(false);

    try {
      const result = await loginManagePortal(params);
      const nextSession: ManagePortalSession = {
        sessionToken: result.sessionToken,
        requestId: result.requestId,
        customerEmail: result.customerEmail,
        resourceGroup: result.resourceGroup,
        expiresAt: result.expiresAt,
        userId: result.userId,
        role: result.role === 'user' ? 'user' : 'admin',
      };

      saveManagePortalSession(nextSession);
      setSession(nextSession);
      return true;
    } catch (error) {
      if (error instanceof ManagePortalError) {
        setLoginError(error.message);
        setLoginErrorKind(error.kind);
      } else {
        setLoginError('Unable to sign in. Please try again.');
        setLoginErrorKind('unknown');
      }
      return false;
    }
  }, []);

  const clearLoginError = useCallback(() => {
    setLoginError(null);
    setLoginErrorKind(null);
  }, []);

  return {
    session,
    bootstrapping,
    loginError,
    loginErrorKind,
    sessionExpired,
    login,
    logout,
    invalidateSession,
    clearLoginError,
  };
}
