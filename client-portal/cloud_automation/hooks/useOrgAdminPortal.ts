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
  listOrgAzureRoles,
  listOrgRequests,
  renewOrgAdminUserBudget,
  reviewOrgAccessRequest,
  reprovisionOrgAdminRoles,
  triggerOrgAdminCleanup,
  updateOrgAdminCleanupSettings,
  updateOrgAdminUserRoles,
} from '../api/orgAdminClient';
import type {
  OrgAdminAccessRequest,
  OrgAdminAzureRoleOption,
  OrgAdminMonitoringResponse,
  OrgAdminRequestDetail,
  OrgAdminRequestSummary,
  OrgAdminUser,
  OrgAdminUserAzureCost,
} from '../types/orgAdmin';

interface UseOrgAdminPortalResult {
  requests: OrgAdminRequestSummary[];
  selectedRequestId: number | null;
  requestDetail: OrgAdminRequestDetail | null;
  users: OrgAdminUser[];
  availableRoles: OrgAdminAzureRoleOption[];
  accessRequests: OrgAdminAccessRequest[];
  overviewLoading: boolean;
  detailLoading: boolean;
  accessLoading: boolean;
  saving: boolean;
  overviewError: string | null;
  detailError: string | null;
  actionError: string | null;
  actionSuccess: string | null;
  selectRequest: (requestId: number | null) => void;
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
  renewBudget: (userId: number, topUpAmount: number) => Promise<boolean>;
  updateCleanupSettings: (
    userId: number,
    payload: { cleanupDisabled?: boolean; cleanupIntervalOverride?: number | null }
  ) => Promise<boolean>;
  triggerCleanup: (userId: number) => Promise<boolean>;
  reprovisionRoles: () => Promise<boolean>;
  clearActionFeedback: () => void;
}

export function useOrgAdminPortal(): UseOrgAdminPortalResult {
  const [requests, setRequests] = useState<OrgAdminRequestSummary[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [requestDetail, setRequestDetail] = useState<OrgAdminRequestDetail | null>(null);
  const [users, setUsers] = useState<OrgAdminUser[]>([]);
  const [availableRoles, setAvailableRoles] = useState<OrgAdminAzureRoleOption[]>([]);
  const [accessRequests, setAccessRequests] = useState<OrgAdminAccessRequest[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleApiError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof OrgAdminError) {
      setActionError(err.message);
      return;
    }
    setActionError(fallback);
  }, []);

  const refreshOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const data = await listOrgRequests();
      setRequests(data);

      if (data.length === 0) {
        setSelectedRequestId(null);
        setRequestDetail(null);
        setUsers([]);
      }
    } catch (err) {
      setOverviewError(err instanceof OrgAdminError ? err.message : 'Failed to load requests.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (selectedRequestId == null) return;

    setDetailLoading(true);
    setDetailError(null);

    try {
      const detail = await getOrgResourceGroupDetail(selectedRequestId);
      setRequestDetail(detail.request);
      setUsers(detail.users);
    } catch (err) {
      setDetailError(err instanceof OrgAdminError ? err.message : 'Failed to load request detail.');
    } finally {
      setDetailLoading(false);
    }
  }, [selectedRequestId]);

  const refreshAccessRequests = useCallback(async () => {
    setAccessLoading(true);

    try {
      const requests = await listOrgAccessRequests({ status: 'pending' });
      setAccessRequests(requests);
    } catch {
      // Non-blocking for the main view.
    } finally {
      setAccessLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshOverview();
    void refreshAccessRequests();
    void listOrgAzureRoles()
      .then(setAvailableRoles)
      .catch(() => setAvailableRoles([]));
  }, [refreshOverview, refreshAccessRequests]);

  useEffect(() => {
    if (selectedRequestId != null) {
      void refreshDetail();
    } else {
      setRequestDetail(null);
      setUsers([]);
      setDetailError(null);
    }
  }, [selectedRequestId, refreshDetail]);

  useEffect(() => {
    if (selectedRequestId == null) return undefined;

    const intervalId = window.setInterval(() => {
      void refreshDetail();
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [selectedRequestId, refreshDetail]);

  const selectRequest = useCallback((requestId: number | null) => {
    setSelectedRequestId(requestId);
    setActionError(null);
    setActionSuccess(null);
  }, []);

  const updateRoles = useCallback(
    async (userId: number, roles: string[]) => {
      if (selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await updateOrgAdminUserRoles(selectedRequestId, userId, roles);
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
    [selectedRequestId, refreshDetail, handleApiError]
  );

  const deleteUser = useCallback(
    async (userId: number) => {
      if (selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await deleteOrgAdminUser(selectedRequestId, userId);
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
    [selectedRequestId, refreshOverview, handleApiError]
  );

  const forceLogout = useCallback(
    async (userId: number) => {
      if (selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await forceOrgAdminLogout(selectedRequestId, userId);
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
    [selectedRequestId, refreshDetail, handleApiError]
  );

  const reviewAccess = useCallback(
    async (id: number, status: 'approved' | 'rejected', reviewNotes?: string) => {
      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await reviewOrgAccessRequest(id, { status, reviewNotes });
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
    [selectedRequestId, refreshAccessRequests, refreshDetail, handleApiError]
  );

  const fetchUserMonitoring = useCallback(
    async (userId: number) => {
      if (selectedRequestId == null) return null;

      try {
        return await getOrgMonitoringLogs(selectedRequestId, {
          userId,
          limit: 30,
        });
      } catch {
        return null;
      }
    },
    [selectedRequestId]
  );

  const fetchUserAzureCost = useCallback(
    async (userId: number) => {
      if (selectedRequestId == null) return null;

      try {
        const response = await getOrgUserAzureCost(selectedRequestId, userId);
        return response.cost ?? null;
      } catch (err) {
        if (err instanceof OrgAdminError) {
          setActionError(err.message);
        } else {
          setActionError('Failed to fetch Azure cost for this user.');
        }
        return null;
      }
    },
    [selectedRequestId]
  );

  const clearActionFeedback = useCallback(() => {
    setActionError(null);
    setActionSuccess(null);
  }, []);

  const renewBudget = useCallback(
    async (userId: number, topUpAmount: number) => {
      if (selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        const result = await renewOrgAdminUserBudget(selectedRequestId, userId, topUpAmount);
        setActionSuccess(`Budget renewed. New total: $${result.newTotalBudget.toFixed(2)}`);
        await refreshDetail();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to renew budget.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, refreshDetail, handleApiError]
  );

  const updateCleanupSettings = useCallback(
    async (
      userId: number,
      payload: { cleanupDisabled?: boolean; cleanupIntervalOverride?: number | null }
    ) => {
      if (selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await updateOrgAdminCleanupSettings(selectedRequestId, userId, payload);
        setUsers((current) =>
          current.map((user) =>
            user.id === userId
              ? {
                  ...user,
                  cleanupDisabled: payload.cleanupDisabled ?? user.cleanupDisabled,
                  cleanupIntervalOverride:
                    payload.cleanupIntervalOverride !== undefined
                      ? payload.cleanupIntervalOverride
                      : user.cleanupIntervalOverride,
                }
              : user
          )
        );
        setActionSuccess('Cleanup settings updated.');
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to update cleanup settings.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, handleApiError]
  );

  const triggerCleanup = useCallback(
    async (userId: number) => {
      if (selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        const result = await triggerOrgAdminCleanup(selectedRequestId, userId);
        const count = result.action === 'pause' ? result.pausedCount : result.deletedCount;
        const verb = result.action === 'pause' ? 'paused' : 'deleted';
        const actionLabel = result.action === 'pause' ? 'Pause' : 'Cleanup';
        setActionSuccess(`${actionLabel} completed. ${count} resource(s) ${verb}.`);
        await refreshDetail();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to trigger cleanup.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, refreshDetail, handleApiError]
  );

  const reprovisionRoles = useCallback(async () => {
    if (selectedRequestId == null) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await reprovisionOrgAdminRoles(selectedRequestId);
      setActionSuccess(result.message || 'Roles re-provisioned successfully.');
      await refreshDetail();
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to re-provision roles.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, refreshDetail, handleApiError]);

  return {
    requests,
    selectedRequestId,
    requestDetail,
    users,
    availableRoles,
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
    renewBudget,
    updateCleanupSettings,
    triggerCleanup,
    reprovisionRoles,
    clearActionFeedback,
  };
}
