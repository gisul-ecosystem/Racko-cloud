'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AwsOrgAdminError,
  deleteAwsOrgRequest,
  deleteAwsOrgUser,
  fixAwsOrgRequestPermissions,
  forceAwsOrgLogout,
  generateAwsOrgConsoleUrl,
  getAwsOrgMonitoringLogs,
  getAwsOrgRequestDetail,
  getAwsOrgUserCost,
  listAwsIamPolicies,
  listAwsOrgAccessRequests,
  listAwsOrgRequests,
  reinstateAwsOrgUser,
  reviewAwsOrgAccessRequest,
  renewAwsOrgUserBudget,
  suspendAwsOrgUser,
  syncAwsOrgRequestSpend,
  triggerAwsOrgUserCleanup,
  triggerAwsOrgAllCleanup,
  unblockAwsOrgUser,
  updateAwsOrgCleanupSettings,
  updateAwsOrgRequestCleanupSettings,
  updateAwsOrgUserPermissions,
} from '../api/orgAdminClient';
import type {
  AwsIamPolicyGroup,
  AwsOrgAdminAccessRequest,
  AwsOrgAdminMonitoringResponse,
  AwsOrgAdminRequestDetail,
  AwsOrgAdminRequestSummary,
  AwsOrgAdminUserCost,
  AwsOrgAdminSharedCost,
} from '../types/orgAdmin';

const STATUS_FILTERS = ['All', 'Completed', 'Expired', 'Provisioning', 'Failed', 'Pending'] as const;

export function useOrgAdminPortal() {
  const [requests, setRequests] = useState<AwsOrgAdminRequestSummary[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestDetail, setRequestDetail] = useState<AwsOrgAdminRequestDetail | null>(null);
  const [iamPolicies, setIamPolicies] = useState<AwsIamPolicyGroup[]>([]);
  const [accessRequests, setAccessRequests] = useState<AwsOrgAdminAccessRequest[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [regionFilter, setRegionFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<
    'users' | 'history' | 'cleanup' | 'budget' | 'custom-config'
  >('users');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);

  const hasActiveUsers = Boolean(
    requestDetail?.users?.some(
      (user) => user.hasActiveSession || user.activeSession || user.status === 'Active'
    )
  );

  const handleApiError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof AwsOrgAdminError) {
      setActionError(err.message);
      return;
    }
    setActionError(fallback);
  }, []);

  const refreshOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const data = await listAwsOrgRequests();
      setRequests(data);

      if (data.length === 0) {
        setSelectedRequestId(null);
        setRequestDetail(null);
      }
    } catch (err) {
      setOverviewError(err instanceof AwsOrgAdminError ? err.message : 'Failed to load requests.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!selectedRequestId) return;
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setDetailLoading(true);
    setIsRefreshing(true);
    setDetailError(null);

    try {
      const detail = await getAwsOrgRequestDetail(selectedRequestId);
      setRequestDetail(detail);
      setLastUpdatedAt(new Date());
    } catch (err) {
      setDetailError(err instanceof AwsOrgAdminError ? err.message : 'Failed to load request detail.');
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
      setDetailLoading(false);
    }
  }, [selectedRequestId]);

  const refreshAccessRequests = useCallback(async () => {
    setAccessLoading(true);
    try {
      setAccessRequests(await listAwsOrgAccessRequests({ status: 'pending' }));
    } catch {
      setAccessRequests([]);
    } finally {
      setAccessLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshOverview();
    void refreshAccessRequests();
    void listAwsIamPolicies()
      .then(setIamPolicies)
      .catch(() => setIamPolicies([]));
  }, [refreshOverview, refreshAccessRequests]);

  useEffect(() => {
    if (selectedRequestId) {
      void refreshDetail();
    } else {
      setRequestDetail(null);
      setDetailError(null);
    }
  }, [selectedRequestId, refreshDetail]);

  useEffect(() => {
    if (!selectedRequestId) return undefined;

    const intervalId = window.setInterval(() => {
      void refreshDetail();
    }, hasActiveUsers ? 10_000 : 60_000);

    return () => window.clearInterval(intervalId);
  }, [selectedRequestId, refreshDetail, hasActiveUsers]);

  const stats = useMemo(
    () => ({
      active: requests.filter((request) => request.status === 'Completed').length,
      expired: requests.filter((request) => request.status === 'Expired').length,
      total: requests.length,
      totalUsers: requests.reduce((sum, request) => sum + request.userCount, 0),
    }),
    [requests]
  );

  const regions = useMemo(() => {
    const unique = new Set(requests.map((request) => request.region).filter(Boolean));
    return Array.from(unique).sort();
  }, [requests]);

  const selectRequest = useCallback((requestId: string | null) => {
    setSelectedRequestId((current) => (current === requestId ? null : requestId));
    setActiveTab('users');
    setActionError(null);
    setActionSuccess(null);
  }, []);

  const clearActionFeedback = useCallback(() => {
    setActionError(null);
    setActionSuccess(null);
  }, []);

  const runAction = useCallback(
    async (action: () => Promise<void>, successMessage: string, fallbackError: string) => {
      if (!selectedRequestId) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await action();
        setActionSuccess(successMessage);
        await refreshDetail();
        await refreshOverview();
        return true;
      } catch (err) {
        handleApiError(err, fallbackError);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, refreshDetail, refreshOverview, handleApiError]
  );

  const handleSuspend = useCallback(
    (userIndex: number) =>
      runAction(
        () => suspendAwsOrgUser(selectedRequestId!, userIndex),
        `User ${userIndex + 1} suspended.`,
        'Failed to suspend user.'
      ),
    [runAction, selectedRequestId]
  );

  const handleReinstate = useCallback(
    (userIndex: number) =>
      runAction(
        () => reinstateAwsOrgUser(selectedRequestId!, userIndex),
        `User ${userIndex + 1} reinstated.`,
        'Failed to reinstate user.'
      ),
    [runAction, selectedRequestId]
  );

  const handleDeleteUser = useCallback(
    (userIndex: number) =>
      runAction(
        () => deleteAwsOrgUser(selectedRequestId!, userIndex),
        `User ${userIndex + 1} deleted.`,
        'Failed to delete user.'
      ),
    [runAction, selectedRequestId]
  );

  const handleConsoleUrl = useCallback(
    async (userIndex: number) => {
      if (!selectedRequestId) return false;

      setSaving(true);
      setActionError(null);

      try {
        const result = await generateAwsOrgConsoleUrl(selectedRequestId, userIndex);
        window.open(result.consoleUrl, '_blank', 'noopener,noreferrer');
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to generate console URL.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, handleApiError]
  );

  const handleUpdatePermissions = useCallback(
    (userIndex: number, policies: string[]) =>
      runAction(
        () => updateAwsOrgUserPermissions(selectedRequestId!, userIndex, policies),
        'Permissions updated successfully.',
        'Failed to update permissions.'
      ),
    [runAction, selectedRequestId]
  );

  const handleRenewBudget = useCallback(
    async (userIndex: number, topUpAmount: number) => {
      if (!selectedRequestId) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        const result = await renewAwsOrgUserBudget(selectedRequestId, userIndex, topUpAmount);
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

  const handleCleanup = useCallback(
    async (userIndex: number) => {
      if (!selectedRequestId) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        const action = requestDetail?.resourceCleanupAction || 'delete';
        const result = await triggerAwsOrgUserCleanup(selectedRequestId, userIndex, action);
        setActionSuccess(`${action === 'pause' ? 'Pause' : 'Cleanup'} completed. ${result.deletedCount} resource action(s) applied.`);
        await refreshDetail();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to trigger cleanup.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, requestDetail?.resourceCleanupAction, refreshDetail, handleApiError]
  );

  const handleSyncSpend = useCallback(async () => {
    if (!selectedRequestId) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await syncAwsOrgRequestSpend(selectedRequestId);
      setActionSuccess('Spend synced from Cost Explorer.');
      await refreshDetail();
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to sync spend.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, refreshDetail, handleApiError]);

  const handleReviewAccess = useCallback(
    async (id: string, status: 'approved' | 'rejected', reviewNotes?: string) => {
      setSaving(true);
      clearActionFeedback();
      try {
        await reviewAwsOrgAccessRequest(id, { status, reviewNotes });
        setActionSuccess(`Access request ${status}.`);
        await refreshAccessRequests();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to review access request.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [clearActionFeedback, handleApiError, refreshAccessRequests]
  );

  const handleDeleteRequest = useCallback(async () => {
    if (!selectedRequestId) return false;
    setSaving(true);
    clearActionFeedback();
    try {
      await deleteAwsOrgRequest(selectedRequestId);
      setSelectedRequestId(null);
      setRequestDetail(null);
      setActionSuccess('AWS request deleted.');
      await refreshOverview();
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to delete request.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, clearActionFeedback, refreshOverview, handleApiError]);

  const handleFixPermissions = useCallback(
    () =>
      runAction(
        () => fixAwsOrgRequestPermissions(selectedRequestId!),
        'IAM permissions repaired.',
        'Failed to repair permissions.'
      ),
    [runAction, selectedRequestId]
  );

  const handleRequestCleanup = useCallback(async () => {
    if (!selectedRequestId) return false;
    setSaving(true);
    clearActionFeedback();
    try {
      const action = requestDetail?.resourceCleanupAction || 'delete';
      const result = await triggerAwsOrgAllCleanup(selectedRequestId, action);
      setActionSuccess(
        `Request ${action} completed. ${result.deletedCount ?? 0} resource action(s) applied.`
      );
      await refreshDetail();
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to clean up request.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, requestDetail?.resourceCleanupAction, clearActionFeedback, refreshDetail, handleApiError]);

  const fetchSharedCost = useCallback(
    async (options: { refresh?: boolean } = {}): Promise<AwsOrgAdminSharedCost | null> => {
      if (!selectedRequestId) return null;
      try {
        const { getAwsOrgSharedCost } = await import('../api/orgAdminClient');
        return await getAwsOrgSharedCost(selectedRequestId, options);
      } catch (err) {
        handleApiError(err, 'Failed to load shared AWS cost.');
        return null;
      }
    },
    [selectedRequestId, handleApiError]
  );

  const handleToggleCleanup = useCallback(
    async (userIndex: number, cleanupEnabled: boolean) => {
      if (!selectedRequestId) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await updateAwsOrgCleanupSettings(selectedRequestId, userIndex, { cleanupEnabled });
        setActionSuccess('Cleanup settings updated.');
        await refreshDetail();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to update cleanup settings.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, refreshDetail, handleApiError]
  );

  const handleRequestCleanupSettings = useCallback(
    async (settings: {
      cleanupEnabled?: boolean;
      cleanupIntervalHours?: number;
      action?: 'delete' | 'pause';
    }) => {
      if (!selectedRequestId) return false;
      setSaving(true);
      clearActionFeedback();
      try {
        await updateAwsOrgRequestCleanupSettings(selectedRequestId, settings);
        setActionSuccess('Request cleanup schedule updated.');
        await refreshDetail();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to update request cleanup settings.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, clearActionFeedback, refreshDetail, handleApiError]
  );

  const handleUnblock = useCallback(
    (userIndex: number) =>
      runAction(
        () => unblockAwsOrgUser(selectedRequestId!, userIndex),
        `User ${userIndex + 1} unblocked.`,
        'Failed to unblock user.'
      ),
    [runAction, selectedRequestId]
  );

  const fetchUserCost = useCallback(
    async (userIndex: number): Promise<AwsOrgAdminUserCost | null> => {
      if (!selectedRequestId) return null;

      try {
        return await getAwsOrgUserCost(selectedRequestId, userIndex);
      } catch (err) {
        if (err instanceof AwsOrgAdminError) {
          setActionError(err.message);
        } else {
          setActionError('Failed to fetch user cost.');
        }
        return null;
      }
    },
    [selectedRequestId]
  );

  const handleForceLogout = useCallback(
    (userIndex: number) =>
      runAction(
        () => forceAwsOrgLogout(selectedRequestId!, userIndex),
        `User ${userIndex + 1} session ended.`,
        'Failed to force logout user.'
      ),
    [runAction, selectedRequestId]
  );

  const fetchUserMonitoring = useCallback(
    async (userIndex: number): Promise<AwsOrgAdminMonitoringResponse | null> => {
      if (!selectedRequestId) return null;

      try {
        return await getAwsOrgMonitoringLogs(selectedRequestId, {
          userIndex,
          limit: 30,
        });
      } catch {
        return null;
      }
    },
    [selectedRequestId]
  );

  const handleRefresh = useCallback(() => {
    clearActionFeedback();
    void refreshOverview();
    void refreshAccessRequests();
    if (selectedRequestId) {
      void refreshDetail();
    }
  }, [clearActionFeedback, refreshOverview, refreshAccessRequests, refreshDetail, selectedRequestId]);

  return {
    requests,
    selectedRequestId,
    requestDetail,
    iamPolicies,
    accessRequests,
    overviewLoading,
    detailLoading,
    accessLoading,
    saving,
    overviewError,
    detailError,
    actionError,
    actionSuccess,
    statusFilter,
    setStatusFilter,
    regionFilter,
    setRegionFilter,
    search,
    setSearch,
    activeTab,
    setActiveTab,
    stats,
    regions,
    statusFilters: STATUS_FILTERS,
    selectRequest,
    refreshOverview,
    refreshDetail,
    handleRefresh,
    handleSuspend,
    handleReinstate,
    handleDeleteUser,
    handleConsoleUrl,
    handleUpdatePermissions,
    handleRenewBudget,
    handleCleanup,
    handleSyncSpend,
    handleReviewAccess,
    handleDeleteRequest,
    handleFixPermissions,
    handleRequestCleanup,
    handleToggleCleanup,
    handleRequestCleanupSettings,
    handleUnblock,
    fetchUserCost,
    fetchSharedCost,
    handleForceLogout,
    fetchUserMonitoring,
    clearActionFeedback,
    refreshAccessRequests,
    lastUpdatedAt,
    isRefreshing,
    hasActiveUsers,
  };
}
