'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OrgAdminError,
  deleteOrgAdminUser,
  deleteOrgAdminRequest,
  extendOrgAdminRequestExpiration,
  forceOrgAdminLogout,
  getOrgMonitoringLogs,
  getOrgResourceGroupDetail,
  getOrgUserAzureCost,
  getOrgSharedAzureCost,
  listOrgAccessRequests,
  listOrgAzureRoles,
  listOrgPrivilegedRoleRequests,
  listOrgRequests,
  renewOrgAdminUserBudget,
  reviewOrgAccessRequest,
  reviewOrgPrivilegedRoleRequest,
  reprovisionOrgAdminRoles,
  sendOrgAdminPurchaseConfirmationMail,
  triggerOrgAdminCleanup,
  triggerOrgRequestCleanup,
  unblockOrgAdminUser,
  unblockAllOrgAdminUsers,
  blockAllOrgAdminUsers,
  addOrgAdminUser,
  updateOrgAdminCleanupSettings,
  updateOrgAdminUserRoles,
} from '../api/orgAdminClient';
import type {
  OrgAdminAccessRequest,
  OrgAdminPrivilegedRoleRequest,
  OrgAdminAzureRoleOption,
  OrgAdminMonitoringResponse,
  OrgAdminRequestDetail,
  OrgAdminRequestSummary,
  OrgAdminUser,
  OrgAdminUserAzureCost,
  OrgAdminSharedAzureCostSummary,
} from '../types/orgAdmin';

interface UseOrgAdminPortalResult {
  requests: OrgAdminRequestSummary[];
  selectedRequestId: number | null;
  requestDetail: OrgAdminRequestDetail | null;
  users: OrgAdminUser[];
  availableRoles: OrgAdminAzureRoleOption[];
  accessRequests: OrgAdminAccessRequest[];
  privilegedRoleRequests: OrgAdminPrivilegedRoleRequest[];
  overviewLoading: boolean;
  detailLoading: boolean;
  accessLoading: boolean;
  privilegedRoleLoading: boolean;
  saving: boolean;
  overviewError: string | null;
  detailError: string | null;
  actionError: string | null;
  actionSuccess: string | null;
  selectRequest: (requestId: number | null) => void;
  refreshOverview: () => Promise<void>;
  refreshDetail: () => Promise<void>;
  refreshAccessRequests: () => Promise<void>;
  refreshPrivilegedRoleRequests: () => Promise<void>;
  updateRoles: (userId: number, roles: string[]) => Promise<boolean>;
  deleteUser: (userId: number) => Promise<boolean>;
  deleteRequest: () => Promise<boolean>;
  extendExpiration: (expiresAt: string) => Promise<boolean>;
  sendPurchaseConfirmationMail: () => Promise<boolean>;
  forceLogout: (userId: number) => Promise<boolean>;
  reviewAccess: (
    id: number,
    status: 'approved' | 'rejected',
    reviewNotes?: string
  ) => Promise<boolean>;
  reviewPrivilegedRole: (
    id: number,
    status: 'approved' | 'rejected',
    reviewNotes?: string
  ) => Promise<boolean>;
  fetchUserMonitoring: (userId: number) => Promise<OrgAdminMonitoringResponse | null>;
  fetchUserAzureCost: (userId: number, options?: { refresh?: boolean }) => Promise<OrgAdminUserAzureCost | null>;
  fetchSharedAzureCost: (options?: { refresh?: boolean }) => Promise<OrgAdminSharedAzureCostSummary | null>;
  renewBudget: (userId: number, topUpAmount: number) => Promise<boolean>;
  updateCleanupSettings: (
    userId: number,
    payload: { cleanupDisabled?: boolean; cleanupIntervalOverride?: number | null }
  ) => Promise<boolean>;
  triggerCleanup: (userId: number) => Promise<boolean>;
  triggerRequestCleanup: () => Promise<boolean>;
  unblockUser: (userId: number, options?: { resetUsage?: boolean }) => Promise<boolean>;
  unblockAllUsers: () => Promise<boolean>;
  blockAllUsers: () => Promise<boolean>;
  addUser: () => Promise<boolean>;
  reprovisionRoles: () => Promise<boolean>;
  clearActionFeedback: () => void;
  lastUpdatedAt: Date | null;
  isRefreshing: boolean;
  hasActiveUsers: boolean;
}

function isRequestNotFoundError(err: unknown): boolean {
  return (
    err instanceof OrgAdminError &&
    err.status === 404 &&
    /not found/i.test(err.message)
  );
}

export function useOrgAdminPortal(): UseOrgAdminPortalResult {
  const [requests, setRequests] = useState<OrgAdminRequestSummary[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [requestDetail, setRequestDetail] = useState<OrgAdminRequestDetail | null>(null);
  const [users, setUsers] = useState<OrgAdminUser[]>([]);
  const [availableRoles, setAvailableRoles] = useState<OrgAdminAzureRoleOption[]>([]);
  const [accessRequests, setAccessRequests] = useState<OrgAdminAccessRequest[]>([]);
  const [privilegedRoleRequests, setPrivilegedRoleRequests] = useState<
    OrgAdminPrivilegedRoleRequest[]
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
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);

  const hasActiveUsers = users.some(
    (user) =>
      user.hasActiveSession ||
      user.displayStatus === 'Active' ||
      user.status === 'Active'
  );

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

      setSelectedRequestId((current) => {
        if (current != null && !data.some((request) => request.id === current)) {
          setRequestDetail(null);
          setUsers([]);
          setDetailError(null);
          return null;
        }

        if (data.length === 0) {
          setRequestDetail(null);
          setUsers([]);
          return null;
        }

        return current;
      });
    } catch (err) {
      setOverviewError(err instanceof OrgAdminError ? err.message : 'Failed to load requests.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (selectedRequestId == null) return;

    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setDetailLoading(true);
    setIsRefreshing(true);
    setDetailError(null);

    try {
      const detail = await getOrgResourceGroupDetail(selectedRequestId);
      setRequestDetail(detail.request);
      setUsers(detail.users);
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (isRequestNotFoundError(err)) {
        setSelectedRequestId(null);
        setRequestDetail(null);
        setUsers([]);
        setDetailError(null);
        await refreshOverview();
        return;
      }

      setDetailError(err instanceof OrgAdminError ? err.message : 'Failed to load request detail.');
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
      setDetailLoading(false);
    }
  }, [selectedRequestId, refreshOverview]);

  const refreshDetailSilent = useCallback(async () => {
    if (selectedRequestId == null) return;

    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setIsRefreshing(true);

    try {
      const detail = await getOrgResourceGroupDetail(selectedRequestId);
      setRequestDetail(detail.request);
      setUsers(detail.users);
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (isRequestNotFoundError(err)) {
        setSelectedRequestId(null);
        setRequestDetail(null);
        setUsers([]);
        setDetailError(null);
        await refreshOverview();
        return;
      }

      // Surface permission errors; stop silent polling from hammering 403s.
      if (err instanceof OrgAdminError && (err.status === 403 || err.status === 401)) {
        setDetailError(err.message || 'Failed to load request detail.');
      }
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [selectedRequestId, refreshOverview]);

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

  const refreshPrivilegedRoleRequests = useCallback(async () => {
    setPrivilegedRoleLoading(true);

    try {
      const requests = await listOrgPrivilegedRoleRequests({ status: 'pending' });
      setPrivilegedRoleRequests(requests);
    } catch {
      // Non-blocking for the main view.
    } finally {
      setPrivilegedRoleLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshOverview();
    void refreshAccessRequests();
    void refreshPrivilegedRoleRequests();
    void listOrgAzureRoles()
      .then(setAvailableRoles)
      .catch(() => setAvailableRoles([]));
  }, [refreshOverview, refreshAccessRequests, refreshPrivilegedRoleRequests]);

  useEffect(() => {
    if (selectedRequestId != null) {
      setDetailLoading(true);
      void refreshDetail();
    } else {
      setRequestDetail(null);
      setUsers([]);
      setDetailError(null);
      setLastUpdatedAt(null);
    }
  }, [selectedRequestId, refreshDetail]);

  useEffect(() => {
    if (selectedRequestId == null) return undefined;
    // Don't keep polling when the session lacks Lab Management permission.
    if (detailError && /insufficient permissions/i.test(detailError)) return undefined;

    // Always poll frequently so Offline → Online after login/stale-reopen appears quickly.
    // Slightly faster when someone is already active.
    const refreshInterval = hasActiveUsers ? 8_000 : 15_000;

    const intervalId = window.setInterval(() => {
      void refreshDetailSilent();
    }, refreshInterval);

    return () => window.clearInterval(intervalId);
  }, [selectedRequestId, hasActiveUsers, refreshDetailSilent, detailError]);

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
        setActionSuccess('User deleted from Azure and removed from this request.');
        await refreshOverview();
        await refreshDetail();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to delete user.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, refreshOverview, refreshDetail, handleApiError]
  );

  const deleteRequest = useCallback(async () => {
    if (selectedRequestId == null) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await deleteOrgAdminRequest(selectedRequestId);
      const summary = [
        `${result.usersDeleted}/${result.usersTotal} Azure users deleted`,
        `${result.resourceGroupsDeleted} resource group deletion(s) started in Azure`,
      ].join(', ');

      if (result.userErrors?.length || result.roleErrors?.length || result.partialAzureCleanup) {
        setActionSuccess(
          `Request #${selectedRequestId} removed from Racko. ${summary}. Some Azure cleanup steps failed — check server logs.`
        );
      } else {
        setActionSuccess(
          `Request #${selectedRequestId} deleted. ${summary}. Azure may take a few minutes to finish removing resource groups.`
        );
      }
      setSelectedRequestId(null);
      setRequestDetail(null);
      setUsers([]);
      await refreshOverview();
      return true;
    } catch (err) {
      if (isRequestNotFoundError(err)) {
        setActionSuccess(`Request #${selectedRequestId} was already removed.`);
        setSelectedRequestId(null);
        setRequestDetail(null);
        setUsers([]);
        await refreshOverview();
        return true;
      }

      handleApiError(err, 'Failed to delete request.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, refreshOverview, handleApiError]);

  const extendExpiration = useCallback(
    async (expiresAt: string) => {
      if (selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        const result = await extendOrgAdminRequestExpiration(selectedRequestId, expiresAt);
        setActionSuccess(
          result.message ||
            result.data?.message ||
            `Request #${selectedRequestId} expiration extended.`
        );
        await refreshOverview();
        await refreshDetail();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to extend expiration.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, refreshOverview, refreshDetail, handleApiError]
  );

  const sendPurchaseConfirmationMail = useCallback(async () => {
    if (selectedRequestId == null) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await sendOrgAdminPurchaseConfirmationMail(selectedRequestId);
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

  const forceLogout = useCallback(
    async (userId: number) => {
      if (selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        const result = await forceOrgAdminLogout(selectedRequestId, userId);
        const detail =
          typeof result === 'object' && result && 'data' in result
            ? (result as { data?: { message?: string } }).data
            : null;
        setActionSuccess(detail?.message || 'User force logged out and blocked.');
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

  const reviewPrivilegedRole = useCallback(
    async (id: number, status: 'approved' | 'rejected', reviewNotes?: string) => {
      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        const result = await reviewOrgPrivilegedRoleRequest(id, { status, reviewNotes });
        const assignedCount =
          status === 'approved' && result.request?.rolesAssigned
            ? ` Assigned to ${result.request.rolesAssigned} user role(s).`
            : '';
        setActionSuccess(`Privileged role request ${status}.${assignedCount}`);
        await refreshPrivilegedRoleRequests();
        if (selectedRequestId != null) {
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
    [selectedRequestId, refreshPrivilegedRoleRequests, refreshDetail, handleApiError]
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
    async (userId: number, options: { refresh?: boolean } = {}) => {
      if (selectedRequestId == null) return null;

      try {
        const response = await getOrgUserAzureCost(selectedRequestId, userId, options);
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

  const fetchSharedAzureCost = useCallback(
    async (options: { refresh?: boolean } = {}) => {
      if (selectedRequestId == null) return null;

      try {
        const response = await getOrgSharedAzureCost(selectedRequestId, options);
        return response.summary ?? null;
      } catch (err) {
        if (isRequestNotFoundError(err)) {
          setSelectedRequestId(null);
          setRequestDetail(null);
          setUsers([]);
          setDetailError(null);
          await refreshOverview();
          return null;
        }

        setActionError(
          err instanceof OrgAdminError
            ? err.message
            : 'Failed to fetch shared Azure cost for this request.'
        );
        return null;
      }
    },
    [selectedRequestId, refreshOverview]
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
        await refreshDetailSilent();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to trigger cleanup.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, refreshDetailSilent, handleApiError]
  );

  const triggerRequestCleanupAction = useCallback(async () => {
    if (selectedRequestId == null) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await triggerOrgRequestCleanup(selectedRequestId);
      const count = result.totalDeleted ?? result.deletedCount ?? 0;
      const verb = result.action === 'pause' ? 'paused' : 'deleted';
      setActionSuccess(`Cleanup completed. ${count} resource(s) ${verb}.`);
      await refreshDetailSilent();
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to trigger request cleanup.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, refreshDetailSilent, handleApiError]);

  const unblockUser = useCallback(
    async (userId: number, options: { resetUsage?: boolean; pauseWindowEnforcement?: boolean } = {}) => {
      if (selectedRequestId == null) return false;

      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        const result = await unblockOrgAdminUser(selectedRequestId, userId, {
          resetUsage: options.resetUsage !== false,
          pauseWindowEnforcement: options.pauseWindowEnforcement !== false,
        });
        const pauseNote = result.windowEnforcementPausedUntil
          ? ' Usage window enforcement paused for 24 hours.'
          : '';
        const passwordNote = result.temporaryPassword
          ? ` New password: ${result.temporaryPassword}`
          : '';
        setActionSuccess(`User "${result.username}" unblocked.${pauseNote}${passwordNote}`);
        await refreshDetailSilent();
        return true;
      } catch (err) {
        handleApiError(err, 'Failed to unblock user.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedRequestId, refreshDetailSilent, handleApiError]
  );

  const unblockAllUsers = useCallback(async () => {
    if (selectedRequestId == null) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await unblockAllOrgAdminUsers(selectedRequestId, {
        resetUsage: true,
        pauseWindowEnforcement: true,
      });
      setActionSuccess(
        `Unblocked ${result.unblockedCount} of ${result.totalUsers} user(s) immediately.` +
          (result.failedCount > 0 ? ` ${result.failedCount} failed.` : '')
      );
      await refreshDetailSilent();
      return result.failedCount === 0;
    } catch (err) {
      handleApiError(err, 'Failed to unblock all users.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, refreshDetailSilent, handleApiError]);

  const blockAllUsers = useCallback(async () => {
    if (selectedRequestId == null) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await blockAllOrgAdminUsers(selectedRequestId);
      setActionSuccess(
        `Blocked ${result.blockedCount} of ${result.totalUsers} user(s) immediately.` +
          (result.failedCount > 0 ? ` ${result.failedCount} failed.` : '')
      );
      await refreshDetailSilent();
      return result.failedCount === 0;
    } catch (err) {
      handleApiError(err, 'Failed to block all users.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, refreshDetailSilent, handleApiError]);

  const addUser = useCallback(async () => {
    if (selectedRequestId == null) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await addOrgAdminUser(selectedRequestId);
      const emailNote = result.emailSent
        ? ' Credentials emailed to the customer.'
        : result.emailError
          ? ` User created but email failed: ${result.emailError}`
          : '';

      setActionSuccess(
        `Added user ${result.user.username} (${result.userCount} user${result.userCount !== 1 ? 's' : ''}, account count ${result.accountCount}).${emailNote}`
      );

      setRequests((current) =>
        current.map((entry) =>
          entry.id === selectedRequestId
            ? { ...entry, userCount: result.userCount }
            : entry
        )
      );

      await refreshDetailSilent();
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to add user.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedRequestId, refreshDetailSilent, handleApiError]);

  const reprovisionRoles = useCallback(async () => {
    if (selectedRequestId == null) return false;

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await reprovisionOrgAdminRoles(selectedRequestId);
      const rolesList =
        result.rolesAssigned?.length > 0 ? ` Assigned: ${result.rolesAssigned.join(', ')}.` : '';
      setActionSuccess((result.message || 'Roles re-provisioned successfully.') + rolesList);
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
    selectRequest,
    refreshOverview,
    refreshDetail,
    refreshAccessRequests,
    refreshPrivilegedRoleRequests,
    updateRoles,
    deleteUser,
    deleteRequest,
    extendExpiration,
    sendPurchaseConfirmationMail,
    forceLogout,
    reviewAccess,
    reviewPrivilegedRole,
    fetchUserMonitoring,
    fetchUserAzureCost,
    fetchSharedAzureCost,
    renewBudget,
    updateCleanupSettings,
    triggerCleanup,
    triggerRequestCleanup: triggerRequestCleanupAction,
    unblockUser,
    unblockAllUsers,
    blockAllUsers,
    addUser,
    reprovisionRoles,
    clearActionFeedback,
    lastUpdatedAt,
    isRefreshing,
    hasActiveUsers,
  };
}
