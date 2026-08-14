'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GcpOrgAdminError,
  deleteGcpOrgRequest,
  deleteGcpOrgUser,
  fixGcpOrgRequestPermissions,
  forceGcpOrgLogout,
  generateGcpOrgConsoleUrl,
  getGcpOrgMonitoringLogs,
  getGcpOrgRequestDetail,
  getGcpOrgUserCost,
  listGcpIamPolicies,
  listGcpOrgAccessRequests,
  listGcpOrgRequests,
  listGcpOrgPrivilegedRoleRequests,
  reinstateGcpOrgUser,
  reviewGcpOrgAccessRequest,
  reviewGcpOrgPrivilegedRoleRequest,
  renewGcpOrgUserBudget,
  suspendGcpOrgUser,
  syncGcpOrgRequestSpend,
  triggerGcpOrgUserCleanup,
  triggerGcpOrgAllCleanup,
  unblockGcpOrgUser,
  addGcpOrgUsers,
  blockAllGcpOrgUsers,
  unblockAllGcpOrgUsers,
  updateGcpOrgCleanupSettings,
  updateGcpOrgRequestCleanupSettings,
  updateGcpOrgUserPermissions,
  sendGcpOrgPurchaseConfirmationMail,
} from '../api/orgAdminClient';
import type {
  GcpIamPolicyGroup,
  GcpOrgAdminAccessRequest,
  GcpOrgAdminMonitoringResponse,
  GcpOrgAdminPrivilegedRoleRequest,
  GcpOrgAdminRequestDetail,
  GcpOrgAdminRequestSummary,
  GcpOrgAdminUserCost,
  GcpOrgAdminSharedCost,
} from '../types/orgAdmin';

const STATUS_FILTERS = ['All', 'Completed', 'Expired', 'Provisioning', 'Failed', 'Pending'] as const;

export function useOrgAdminPortal() {
  const [requests, setRequests] = useState<GcpOrgAdminRequestSummary[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestDetail, setRequestDetail] = useState<GcpOrgAdminRequestDetail | null>(null);
  const [iamPolicies, setIamPolicies] = useState<GcpIamPolicyGroup[]>([]);
  const [accessRequests, setAccessRequests] = useState<GcpOrgAdminAccessRequest[]>([]);
  const [privilegedRoleRequests, setPrivilegedRoleRequests] = useState<
    GcpOrgAdminPrivilegedRoleRequest[]
  >([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [privilegedRoleLoading, setPrivilegedRoleLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [regionFilter, setRegionFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<
    'users' | 'history' | 'cleanup' | 'budget' | 'custom-config' | 'privileged-roles'
  >('users');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const selectedRequestIdRef = useRef<string | null>(null);
  selectedRequestIdRef.current = selectedRequestId;

  const hasActiveUsers = Boolean(
    requestDetail?.users?.some(
      (user) => user.hasActiveSession || user.activeSession || user.status === 'Active'
    )
  );

  const handleApiError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof GcpOrgAdminError) {
      setActionError(err.message);
      return;
    }
    setActionError(fallback);
  }, []);

  const refreshOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const data = await listGcpOrgRequests();
      setRequests(data);

      if (data.length === 0) {
        setSelectedRequestId(null);
        setRequestDetail(null);
      }
    } catch (err) {
      setOverviewError(err instanceof GcpOrgAdminError ? err.message : 'Failed to load requests.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!selectedRequestId) return;

    const requestId = selectedRequestId;
    refreshInFlightRef.current = true;
    setDetailLoading(true);
    setIsRefreshing(true);
    setDetailError(null);

    try {
      const detail = await getGcpOrgRequestDetail(requestId);
      if (selectedRequestIdRef.current !== requestId) return;
      setRequestDetail(detail);
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (selectedRequestIdRef.current !== requestId) return;
      setDetailError(err instanceof GcpOrgAdminError ? err.message : 'Failed to load request detail.');
    } finally {
      if (selectedRequestIdRef.current === requestId) {
        refreshInFlightRef.current = false;
        setIsRefreshing(false);
        setDetailLoading(false);
      }
    }
  }, [selectedRequestId]);

  const refreshDetailSilent = useCallback(async () => {
    if (!selectedRequestId) return;
    if (refreshInFlightRef.current) return;

    const requestId = selectedRequestId;
    refreshInFlightRef.current = true;
    setIsRefreshing(true);

    try {
      const detail = await getGcpOrgRequestDetail(requestId);
      if (selectedRequestIdRef.current !== requestId) return;
      setRequestDetail(detail);
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (selectedRequestIdRef.current !== requestId) return;
      if (err instanceof GcpOrgAdminError && (err.status === 403 || err.status === 401)) {
        setDetailError(err.message || 'Failed to load request detail.');
      }
    } finally {
      if (selectedRequestIdRef.current === requestId) {
        refreshInFlightRef.current = false;
        setIsRefreshing(false);
      }
    }
  }, [selectedRequestId]);

  const refreshAccessRequests = useCallback(async () => {
    setAccessLoading(true);
    try {
      setAccessRequests(await listGcpOrgAccessRequests({ status: 'pending' }));
    } catch {
      setAccessRequests([]);
    } finally {
      setAccessLoading(false);
    }
  }, []);

  const refreshPrivilegedRoleRequests = useCallback(async () => {
    setPrivilegedRoleLoading(true);
    try {
      setPrivilegedRoleRequests(await listGcpOrgPrivilegedRoleRequests({ status: 'pending' }));
    } catch {
      setPrivilegedRoleRequests([]);
    } finally {
      setPrivilegedRoleLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshOverview();
    void refreshAccessRequests();
    void refreshPrivilegedRoleRequests();
    void listGcpIamPolicies()
      .then(setIamPolicies)
      .catch(() => setIamPolicies([]));
  }, [refreshOverview, refreshAccessRequests, refreshPrivilegedRoleRequests]);

  useEffect(() => {
    if (selectedRequestId) {
      setRequestDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      void refreshDetail();
    } else {
      setRequestDetail(null);
      setDetailError(null);
      setDetailLoading(false);
    }
  }, [selectedRequestId, refreshDetail]);

  useEffect(() => {
    if (!selectedRequestId) return undefined;

    const intervalId = window.setInterval(() => {
      void refreshDetailSilent();
    }, hasActiveUsers ? 10_000 : 60_000);

    return () => window.clearInterval(intervalId);
  }, [selectedRequestId, refreshDetailSilent, hasActiveUsers]);

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
    setSelectedRequestId((current) => {
      const next = current === requestId ? null : requestId;
      if (next !== current) {
        refreshInFlightRef.current = false;
        setRequestDetail(null);
        setDetailError(null);
        if (next) setDetailLoading(true);
      }
      return next;
    });
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
        () => suspendGcpOrgUser(selectedRequestId!, userIndex),
        `User ${userIndex + 1} suspended.`,
        'Failed to suspend user.'
      ),
    [runAction, selectedRequestId]
  );

  const handleReinstate = useCallback(
    (userIndex: number) =>
      runAction(
        () => reinstateGcpOrgUser(selectedRequestId!, userIndex),
        `User ${userIndex + 1} reinstated.`,
        'Failed to reinstate user.'
      ),
    [runAction, selectedRequestId]
  );

  const handleDeleteUser = useCallback(
    (userIndex: number) =>
      runAction(
        () => deleteGcpOrgUser(selectedRequestId!, userIndex),
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
        const result = await generateGcpOrgConsoleUrl(selectedRequestId, userIndex);
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
        () => updateGcpOrgUserPermissions(selectedRequestId!, userIndex, policies),
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
        const result = await renewGcpOrgUserBudget(selectedRequestId, userIndex, topUpAmount);
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
        const result = await triggerGcpOrgUserCleanup(selectedRequestId, userIndex, action);
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
      await syncGcpOrgRequestSpend(selectedRequestId);
      setActionSuccess('Spend synced from GCP billing.');
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
        await reviewGcpOrgAccessRequest(id, { status, reviewNotes });
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

  const handleReviewPrivilegedRole = useCallback(
    async (id: string, status: 'approved' | 'rejected', reviewNotes?: string) => {
      setSaving(true);
      clearActionFeedback();
      try {
        const result = await reviewGcpOrgPrivilegedRoleRequest(id, { status, reviewNotes });
        const assignedCount =
          status === 'approved' && result.request?.rolesAssigned
            ? ` Assigned to ${result.request.rolesAssigned} user role(s).`
            : status === 'approved' && !result.request?.accessApplied
              ? ' Will apply when the lab is provisioned.'
              : '';
        setActionSuccess(`Privileged role request ${status}.${assignedCount}`);
        await refreshPrivilegedRoleRequests();
        if (selectedRequestId) {
          await refreshDetail();
        }
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to review privileged role request.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      clearActionFeedback,
      handleApiError,
      refreshPrivilegedRoleRequests,
      refreshDetail,
      selectedRequestId,
    ]
  );

  const handleDeleteRequest = useCallback(async () => {
    if (!selectedRequestId) return false;
    setSaving(true);
    clearActionFeedback();
    try {
      await deleteGcpOrgRequest(selectedRequestId);
      setSelectedRequestId(null);
      setRequestDetail(null);
      setActionSuccess('Gcp request deleted. Lab resources and IAM users/roles were removed.');
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
        () => fixGcpOrgRequestPermissions(selectedRequestId!),
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
      const result = await triggerGcpOrgAllCleanup(selectedRequestId, action);
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
    async (options: { refresh?: boolean } = {}): Promise<GcpOrgAdminSharedCost | null> => {
      if (!selectedRequestId) return null;
      try {
        const { getGcpOrgSharedCost } = await import('../api/orgAdminClient');
        return await getGcpOrgSharedCost(selectedRequestId, options);
      } catch (err) {
        handleApiError(err, 'Failed to load shared Gcp cost.');
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
        await updateGcpOrgCleanupSettings(selectedRequestId, userIndex, { cleanupEnabled });
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
        await updateGcpOrgRequestCleanupSettings(selectedRequestId, settings);
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
        () => unblockGcpOrgUser(selectedRequestId!, userIndex),
        `User ${userIndex + 1} unblocked.`,
        'Failed to unblock user.'
      ),
    [runAction, selectedRequestId]
  );

  const handleAddUser = useCallback(
    async (count = 1) => {
      if (!selectedRequestId) return false;
      setSaving(true);
      clearActionFeedback();
      try {
        const result = await addGcpOrgUsers(selectedRequestId, count);
        setActionSuccess(
          `Added ${result.addedCount} user(s)` +
            (result.customerEmail ? ` — credentials emailed to ${result.customerEmail}` : '') +
            ` (${result.userCount} total, account count ${result.accountCount}).`
        );
        await refreshDetail();
        await refreshOverview();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to add users.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, clearActionFeedback, refreshDetail, refreshOverview, handleApiError]
  );

  const handleBlockAll = useCallback(async () => {
    if (!selectedRequestId) return false;
    setSaving(true);
    clearActionFeedback();
    try {
      const result = await blockAllGcpOrgUsers(selectedRequestId);
      const failed = (result.attempted || 0) - (result.successCount || 0);
      setActionSuccess(
        `Blocked ${result.successCount} of ${result.attempted} user(s) immediately.` +
          (failed > 0 ? ` ${failed} failed.` : '')
      );
      await refreshDetail();
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to block all users.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, clearActionFeedback, refreshDetail, handleApiError]);

  const handleUnblockAll = useCallback(async () => {
    if (!selectedRequestId) return false;
    setSaving(true);
    clearActionFeedback();
    try {
      const result = await unblockAllGcpOrgUsers(selectedRequestId, {
        resetUsage: true,
        pauseWindowEnforcement: true,
        pauseWindowHours: 24,
      });
      const failed = (result.attempted || 0) - (result.successCount || 0);
      setActionSuccess(
        `Unblocked ${result.successCount} of ${result.attempted} user(s) immediately.` +
          (failed > 0 ? ` ${failed} failed.` : '')
      );
      await refreshDetail();
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to unblock all users.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, clearActionFeedback, refreshDetail, handleApiError]);

  const fetchUserCost = useCallback(
    async (userIndex: number): Promise<GcpOrgAdminUserCost | null> => {
      if (!selectedRequestId) return null;

      try {
        return await getGcpOrgUserCost(selectedRequestId, userIndex);
      } catch (err) {
        if (err instanceof GcpOrgAdminError) {
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
        () => forceGcpOrgLogout(selectedRequestId!, userIndex),
        `User ${userIndex + 1} session ended.`,
        'Failed to force logout user.'
      ),
    [runAction, selectedRequestId]
  );

  const sendPurchaseConfirmationMail = useCallback(async () => {
    if (!selectedRequestId) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await sendGcpOrgPurchaseConfirmationMail(selectedRequestId);
      setActionSuccess(
        result.message ||
          `Confirmation mail sent${result.recipientEmail ? ` to ${result.recipientEmail}` : ''}.`
      );
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to send confirmation mail.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, handleApiError]);

  const fetchUserMonitoring = useCallback(
    async (userIndex: number): Promise<GcpOrgAdminMonitoringResponse | null> => {
      if (!selectedRequestId) return null;

      try {
        return await getGcpOrgMonitoringLogs(selectedRequestId, {
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
    void refreshPrivilegedRoleRequests();
    if (selectedRequestId) {
      void refreshDetailSilent();
    }
  }, [
    clearActionFeedback,
    refreshOverview,
    refreshAccessRequests,
    refreshPrivilegedRoleRequests,
    refreshDetailSilent,
    selectedRequestId,
  ]);

  return {
    requests,
    selectedRequestId,
    requestDetail,
    iamPolicies,
    accessRequests,
    privilegedRoleRequests,
    overviewLoading,
    detailLoading,
    accessLoading,
    privilegedRoleLoading,
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
    handleReviewPrivilegedRole,
    handleDeleteRequest,
    handleFixPermissions,
    handleRequestCleanup,
    handleToggleCleanup,
    handleRequestCleanupSettings,
    handleUnblock,
    handleAddUser,
    handleBlockAll,
    handleUnblockAll,
    fetchUserCost,
    fetchSharedCost,
    handleForceLogout,
    sendPurchaseConfirmationMail,
    fetchUserMonitoring,
    clearActionFeedback,
    refreshAccessRequests,
    refreshPrivilegedRoleRequests,
    lastUpdatedAt,
    isRefreshing,
    hasActiveUsers,
  };
}
