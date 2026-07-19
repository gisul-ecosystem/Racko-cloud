'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ManagePortalError,
  deleteManagePortalUser,
  fetchManagePortalUsers,
  updateManagePortalUserRoles,
} from '../api/managePortalClient';
import type { ManagePortalSession, ManagePortalUser } from '../types/managePortal';

interface UseManagePortalUsersResult {
  users: ManagePortalUser[];
  loading: boolean;
  error: string | null;
  blocked: boolean;
  actionError: string | null;
  actionSuccess: string | null;
  saving: boolean;
  refetch: () => Promise<void>;
  updateRoles: (userId: number, roles: string[]) => Promise<boolean>;
  deleteUser: (userId: number) => Promise<boolean>;
  clearActionFeedback: () => void;
}

export function useManagePortalUsers(
  session: ManagePortalSession | null,
  onUnauthorized: () => void
): UseManagePortalUsersResult {
  const [users, setUsers] = useState<ManagePortalUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ManagePortalError) {
        if (err.status === 401 || err.status === 403) {
          if (err.kind === 'blocked_access') {
            setBlocked(true);
            setError(err.message);
            return;
          }
          onUnauthorized();
          return;
        }
        setActionError(err.message);
        return;
      }
      setActionError(fallback);
    },
    [onUnauthorized]
  );

  const refetch = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    setError(null);
    setBlocked(false);

    try {
      const result = await fetchManagePortalUsers(session.requestId, session.sessionToken);
      setUsers(result.users);
    } catch (err) {
      if (err instanceof ManagePortalError) {
        if (err.status === 401 || err.status === 403) {
          if (err.kind === 'blocked_access') {
            setBlocked(true);
            setError(err.message);
          } else {
            onUnauthorized();
          }
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to load provisioned users.');
      }
    } finally {
      setLoading(false);
    }
  }, [session, onUnauthorized]);

  useEffect(() => {
    if (session) {
      void refetch();
    } else {
      setUsers([]);
      setError(null);
      setBlocked(false);
    }
  }, [session, refetch]);

  const updateRoles = useCallback(
    async (userId: number, roles: string[]) => {
      if (!session) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await updateManagePortalUserRoles({
          requestId: session.requestId,
          userId,
          roles,
          sessionToken: session.sessionToken,
        });
        setActionSuccess('Roles updated successfully.');
        await refetch();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to update roles.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [session, refetch, handleApiError]
  );

  const deleteUser = useCallback(
    async (userId: number) => {
      if (!session) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await deleteManagePortalUser({
          requestId: session.requestId,
          userId,
          sessionToken: session.sessionToken,
        });
        setUsers((current) => current.filter((user) => user.id !== userId));
        setActionSuccess('User removed successfully.');
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to delete user.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [session, handleApiError]
  );

  const clearActionFeedback = useCallback(() => {
    setActionError(null);
    setActionSuccess(null);
  }, []);

  return {
    users,
    loading,
    error,
    blocked,
    actionError,
    actionSuccess,
    saving,
    refetch,
    updateRoles,
    deleteUser,
    clearActionFeedback,
  };
}
