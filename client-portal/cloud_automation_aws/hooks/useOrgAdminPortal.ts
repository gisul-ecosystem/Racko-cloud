'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AwsOrgAdminError,
  deleteAwsOrgUser,
  forceAwsOrgLogout,
  generateAwsOrgConsoleUrl,
  getAwsOrgMonitoringLogs,
  getAwsOrgRequestDetail,
  getAwsOrgUserCost,
  listAwsIamPolicies,
  listAwsOrgRequests,
  reinstateAwsOrgUser,
  renewAwsOrgUserBudget,
  suspendAwsOrgUser,
  syncAwsOrgRequestSpend,
  triggerAwsOrgUserCleanup,
  updateAwsOrgCleanupSettings,
  updateAwsOrgUserPermissions,
} from '../api/orgAdminClient';
import type {
  AwsIamPolicyGroup,
  AwsOrgAdminMonitoringResponse,
  AwsOrgAdminRequestDetail,
  AwsOrgAdminRequestSummary,
  AwsOrgAdminUserCost,
} from '../types/orgAdmin';

const STATUS_FILTERS = ['All', 'Completed', 'Expired', 'Provisioning', 'Failed', 'Pending'] as const;

export function useOrgAdminPortal() {
  const [requests, setRequests] = useState<AwsOrgAdminRequestSummary[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestDetail, setRequestDetail] = useState<AwsOrgAdminRequestDetail | null>(null);
  const [iamPolicies, setIamPolicies] = useState<AwsIamPolicyGroup[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [regionFilter, setRegionFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'cleanup' | 'budget'>('users');

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
      const data = await listAwsOrgRequests({
        status: statusFilter,
        region: regionFilter,
      });
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
  }, [statusFilter, regionFilter]);

  const refreshDetail = useCallback(async () => {
    if (!selectedRequestId) return;

    setDetailLoading(true);
    setDetailError(null);

    try {
      const detail = await getAwsOrgRequestDetail(selectedRequestId);
      setRequestDetail(detail);
    } catch (err) {
      setDetailError(err instanceof AwsOrgAdminError ? err.message : 'Failed to load request detail.');
    } finally {
      setDetailLoading(false);
    }
  }, [selectedRequestId]);

  useEffect(() => {
    void refreshOverview();
    void listAwsIamPolicies()
      .then(setIamPolicies)
      .catch(() => setIamPolicies([]));
  }, [refreshOverview]);

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
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [selectedRequestId, refreshDetail]);

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
        const result = await triggerAwsOrgUserCleanup(selectedRequestId, userIndex);
        setActionSuccess(`Cleanup completed. ${result.deletedCount} resource(s) removed.`);
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

  const handleToggleCleanup = useCallback(
    async (cleanupEnabled: boolean) => {
      if (!selectedRequestId) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await updateAwsOrgCleanupSettings(selectedRequestId, 0, { cleanupEnabled });
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
    if (selectedRequestId) {
      void refreshDetail();
    }
  }, [clearActionFeedback, refreshOverview, refreshDetail, selectedRequestId]);

  return {
    requests,
    selectedRequestId,
    requestDetail,
    iamPolicies,
    overviewLoading,
    detailLoading,
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
    handleToggleCleanup,
    fetchUserCost,
    handleForceLogout,
    fetchUserMonitoring,
    clearActionFeedback,
  };
}
