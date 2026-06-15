'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OrgAdminError,
  deleteOrgAdminUser,
  forceOrgAdminLogout,
  getOrgMonitoringLogs,
  getOrgResourceGroupDetail,
  getOrgUserAzureCost,
  listOrgAccessRequests,
  listOrgResourceGroups,
  reviewOrgAccessRequest,
  updateOrgAdminUserRoles,
} from '../api/orgAdminClient';
import type {
  OrgAdminAccessRequest,
  OrgAdminMonitoringResponse,
  OrgAdminRequestDetail,
  OrgAdminResourceGroup,
  OrgAdminSession,
  OrgAdminUser,
  OrgAdminUserAzureCost,
} from '../types/orgAdmin';

interface UseOrgAdminPortalResult {
  resourceGroups: OrgAdminResourceGroup[];
  selectedRequestId: number | null;
  requestDetail: OrgAdminRequestDetail | null;
  users: OrgAdminUser[];
  accessRequests: OrgAdminAccessRequest[];
  overviewLoading: boolean;
  detailLoading: boolean;
  accessLoading: boolean;
  saving: boolean;
  overviewError: string | null;
  detailError: string | null;
  actionError: string | null;
  actionSuccess: string | null;
  selectRequest: (requestId: number) => void;
  refreshOverview: () => Promise<void>;
  refreshDetail: () => Promise<void>;
  refreshAccessRequests: () => Promise<void>;
  updateRoles: (userId: number, roles: string[]) => Promise<boolean>;
  deleteUser: (userId: number) => Promise<boolean>;
  forceLogout: (userId: number) => Promise<boolean>;
  reviewAccess: (
    id: number,
    status: 'approved' | 'rejected',
    reviewNotes?: string
  ) => Promise<boolean>;
  fetchUserMonitoring: (userId: number) => Promise<OrgAdminMonitoringResponse | null>;
  fetchUserAzureCost: (userId: number) => Promise<OrgAdminUserAzureCost | null>;
  clearActionFeedback: () => void;
}

export function useOrgAdminPortal(
  session: OrgAdminSession | null,
  onUnauthorized: () => void
): UseOrgAdminPortalResult {
  const [resourceGroups, setResourceGroups] = useState<OrgAdminResourceGroup[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [requestDetail, setRequestDetail] = useState<OrgAdminRequestDetail | null>(null);
  const [users, setUsers] = useState<OrgAdminUser[]>([]);
  const [accessRequests, setAccessRequests] = useState<OrgAdminAccessRequest[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof OrgAdminError) {
        if (err.status === 401) {
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

  const refreshOverview = useCallback(async () => {
    if (!session) return;

    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const groups = await listOrgResourceGroups(session.sessionToken);
      setResourceGroups(groups);

      if (groups.length === 0) {
        setSelectedRequestId(null);
        setRequestDetail(null);
        setUsers([]);
        return;
      }

      setSelectedRequestId((current) => {
        if (current != null && groups.some((group) => group.requestId === current)) {
          return current;
        }
        return groups[0]?.requestId ?? null;
      });
    } catch (err) {
      if (err instanceof OrgAdminError && err.status === 401) {
        onUnauthorized();
      } else {
        setOverviewError(err instanceof OrgAdminError ? err.message : 'Failed to load resource groups.');
      }
    } finally {
      setOverviewLoading(false);
    }
  }, [session, onUnauthorized]);

  const refreshDetail = useCallback(async () => {
    if (!session || selectedRequestId == null) return;

    setDetailLoading(true);
    setDetailError(null);

    try {
      const detail = await getOrgResourceGroupDetail(session.sessionToken, selectedRequestId);
      setRequestDetail(detail.request);
      setUsers(detail.users);
    } catch (err) {
      if (err instanceof OrgAdminError && err.status === 401) {
        onUnauthorized();
      } else {
        setDetailError(err instanceof OrgAdminError ? err.message : 'Failed to load request detail.');
      }
    } finally {
      setDetailLoading(false);
    }
  }, [session, selectedRequestId, onUnauthorized]);

  const refreshAccessRequests = useCallback(async () => {
    if (!session) return;

    setAccessLoading(true);

    try {
      const requests = await listOrgAccessRequests(session.sessionToken, { status: 'pending' });
      setAccessRequests(requests);
    } catch (err) {
      if (err instanceof OrgAdminError && err.status === 401) {
        onUnauthorized();
      }
    } finally {
      setAccessLoading(false);
    }
  }, [session, onUnauthorized]);

  useEffect(() => {
    if (session) {
      void refreshOverview();
      void refreshAccessRequests();
    } else {
      setResourceGroups([]);
      setSelectedRequestId(null);
      setRequestDetail(null);
      setUsers([]);
      setAccessRequests([]);
      setOverviewError(null);
      setDetailError(null);
    }
  }, [session, refreshOverview, refreshAccessRequests]);

  useEffect(() => {
    if (session && selectedRequestId != null) {
      void refreshDetail();
    }
  }, [session, selectedRequestId, refreshDetail]);

  const hasActiveSessions = users.some((user) => user.hasActiveSession);

  useEffect(() => {
    if (!session || selectedRequestId == null || !hasActiveSessions) return undefined;

    const intervalId = window.setInterval(() => {
      void refreshDetail();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [session, selectedRequestId, hasActiveSessions, refreshDetail]);

  const selectRequest = useCallback((requestId: number) => {
    setSelectedRequestId(requestId);
    setActionError(null);
    setActionSuccess(null);
  }, []);

  const updateRoles = useCallback(
    async (userId: number, roles: string[]) => {
      if (!session || selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await updateOrgAdminUserRoles(session.sessionToken, selectedRequestId, userId, roles);
        setActionSuccess('Roles updated successfully.');
        await refreshDetail();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to update roles.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [session, selectedRequestId, refreshDetail, handleApiError]
  );

  const deleteUser = useCallback(
    async (userId: number) => {
      if (!session || selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await deleteOrgAdminUser(session.sessionToken, selectedRequestId, userId);
        setUsers((current) => current.filter((user) => user.id !== userId));
        setActionSuccess('User removed successfully.');
        await refreshOverview();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to delete user.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [session, selectedRequestId, refreshOverview, handleApiError]
  );

  const forceLogout = useCallback(
    async (userId: number) => {
      if (!session || selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await forceOrgAdminLogout(session.sessionToken, selectedRequestId, userId);
        setActionSuccess('User session ended.');
        await refreshDetail();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to force logout.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [session, selectedRequestId, refreshDetail, handleApiError]
  );

  const reviewAccess = useCallback(
    async (id: number, status: 'approved' | 'rejected', reviewNotes?: string) => {
      if (!session) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await reviewOrgAccessRequest(session.sessionToken, id, { status, reviewNotes });
        setActionSuccess(`Access request ${status}.`);
        await refreshAccessRequests();
        if (selectedRequestId != null) {
          await refreshDetail();
        }
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to review access request.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [session, selectedRequestId, refreshAccessRequests, refreshDetail, handleApiError]
  );

  const fetchUserMonitoring = useCallback(
    async (userId: number) => {
      if (!session || selectedRequestId == null) return null;

      try {
        return await getOrgMonitoringLogs(session.sessionToken, selectedRequestId, {
          userId,
          limit: 30,
        });
      } catch (err) {
        if (err instanceof OrgAdminError && err.status === 401) {
          onUnauthorized();
        }
        return null;
      }
    },
    [session, selectedRequestId, onUnauthorized]
  );

  const fetchUserAzureCost = useCallback(
    async (userId: number) => {
      if (!session || selectedRequestId == null) return null;

      try {
        const response = await getOrgUserAzureCost(
          session.sessionToken,
          selectedRequestId,
          userId
        );
        return response.cost ?? null;
      } catch (err) {
        if (err instanceof OrgAdminError) {
          if (err.status === 401) {
            onUnauthorized();
          } else {
            setActionError(err.message);
          }
        } else {
          setActionError('Failed to fetch Azure cost for this user.');
        }
        return null;
      }
    },
    [session, selectedRequestId, onUnauthorized]
  );

  const clearActionFeedback = useCallback(() => {
    setActionError(null);
    setActionSuccess(null);
  }, []);

  return {
    resourceGroups,
    selectedRequestId,
    requestDetail,
    users,
    accessRequests,
    overviewLoading,
    detailLoading,
    accessLoading,
    saving,
    overviewError,
    detailError,
    actionError,
    actionSuccess,
    selectRequest,
    refreshOverview,
    refreshDetail,
    refreshAccessRequests,
    updateRoles,
    deleteUser,
    forceLogout,
    reviewAccess,
    fetchUserMonitoring,
    fetchUserAzureCost,
    clearActionFeedback,
  };
}
