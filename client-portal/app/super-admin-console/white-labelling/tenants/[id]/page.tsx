'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  BookOpen,
  CheckCircle2,
  Cloud,
  Globe,
  Loader2,
  Monitor,
  MonitorCheck,
  Palette,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { ApiError } from '../../../../../lib/apiClient';
import {
  assignTenantService,
  createTenantAdmin,
  fetchTenant,
  fetchTenantAdmins,
  fetchTenantServices,
  fetchTenantVms,
  fetchSuperAdminOrders,
  removeTenantService,
  setTenantAdminActive,
  updateTenant,
  updateTenantService,
} from '../../../../../lib/tenantApi';
import type {
  ServiceKey,
  Tenant,
  TenantAdmin,
  TenantServiceConfig,
  TenantStatus,
  VmManagementLimits,
  VmManagementPricing,
  SuperAdminOrder,
  SuperAdminTenantVm,
} from '../../../../../lib/tenantTypes';
import { PLATFORM_SERVICE_CATALOG } from '../../../../../lib/tenantTypes';
import { OrderStatusBadge } from '@/components/tenant/OrderStatusBadge';
import { VMStatusBadge } from '@/components/dashboard/VMStatusBadge';
import type { VMStatus } from '@/lib/vmApi';
import { deleteVM } from '@/lib/vmApi';
import { formatBillingPeriod } from '@/lib/tenantPlanUtils';
import { ErrorState } from '../../../../../components/dashboard/ErrorState';
import { TenantStatusBadge } from '../../../../../components/super-admin-console/white-labelling/TenantStatusBadge';
import { WhiteLabellingEmptyState } from '../../../../../components/super-admin-console/white-labelling/WhiteLabellingEmptyState';
import { VmManagementConfigPanel } from '../../../../../components/super-admin-console/white-labelling/VmManagementConfigPanel';
import { ServiceConfigSummary } from '../../../../../components/super-admin-console/white-labelling/ServiceConfigSummary';
import { BrandingUploadSection } from '../../../../../components/super-admin-console/white-labelling/BrandingUploadSection';
import { TenantWalletPanel } from '../../../../../components/super-admin-console/white-labelling/TenantWalletPanel';

type Tab = 'general' | 'services' | 'wallet' | 'orders' | 'admins' | 'vms';

const VM_STATUS_VALUES: VMStatus[] = [
  'running',
  'stopped',
  'creating',
  'paused',
  'suspended',
  'error',
  'deleting',
  'deleted',
];

function isVmStatus(status: string): status is VMStatus {
  return VM_STATUS_VALUES.includes(status as VMStatus);
}

const DEFAULT_VM_LIMITS: VmManagementLimits = {
  maxVms: 50,
  maxTotalVcpu: 200,
  maxTotalRamGb: 512,
  maxTotalDiskGb: 5000,
};

const DEFAULT_VM_PRICING: VmManagementPricing = {
  cpuRatePerCoreMonthly: 500,
  ramRatePerGbMonthly: 100,
  diskRatePerGbMonthly: 10,
  billingDiscounts: { quarterly: 0, yearly: 0 },
  fixedPlans: [],
};

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const [tab, setTab] = useState<Tab>('general');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [services, setServices] = useState<TenantServiceConfig[]>([]);
  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [generalForm, setGeneralForm] = useState({
    name: '',
    domain: '',
    status: 'pending' as TenantStatus,
    logoUrl: '',
    primaryColor: '',
    supportEmail: '',
  });

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignKey, setAssignKey] = useState<ServiceKey>('vm-management');
  const [assignLimits, setAssignLimits] = useState(DEFAULT_VM_LIMITS);
  const [assignPricing, setAssignPricing] = useState(DEFAULT_VM_PRICING);
  const [assigningKey, setAssigningKey] = useState<ServiceKey | null>(null);
  const [disallowingKey, setDisallowingKey] = useState<ServiceKey | null>(null);

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: '', password: '' });

  const [tenantOrders, setTenantOrders] = useState<SuperAdminOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [tenantVms, setTenantVms] = useState<SuperAdminTenantVm[]>([]);
  const [vmsLoading, setVmsLoading] = useState(false);
  const [vmsError, setVmsError] = useState<string | null>(null);
  const [deletingVmId, setDeletingVmId] = useState<string | null>(null);
  const [vmDeleteTarget, setVmDeleteTarget] = useState<SuperAdminTenantVm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenantData, servicesData, adminsData] = await Promise.all([
        fetchTenant(tenantId),
        fetchTenantServices(tenantId),
        fetchTenantAdmins(tenantId),
      ]);
      setTenant(tenantData);
      setServices(servicesData);
      setAdmins(adminsData);
      setGeneralForm({
        name: tenantData.name,
        domain: tenantData.domain,
        status: tenantData.status,
        logoUrl: tenantData.branding?.logoUrl ?? '',
        primaryColor: tenantData.branding?.primaryColor ?? '#1a73e8',
        supportEmail: tenantData.branding?.supportEmail ?? '',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tenant');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (msg: string) => {
    setActionMsg(msg);
    setActionErr(null);
    setTimeout(() => setActionMsg(null), 4000);
  };

  const flashErr = (msg: string) => {
    setActionErr(msg);
    setActionMsg(null);
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateTenant(tenantId, {
        name: generalForm.name.trim(),
        domain: generalForm.domain.trim().toLowerCase(),
        status: generalForm.status,
        branding: {
          logoUrl: (tenant?.branding?.logoUrl || generalForm.logoUrl) || undefined,
          faviconUrl: tenant?.branding?.faviconUrl || undefined,
          loginPageImageUrl: tenant?.branding?.loginPageImageUrl || undefined,
          primaryColor: generalForm.primaryColor || undefined,
          secondaryColor: tenant?.branding?.secondaryColor || undefined,
          supportEmail: generalForm.supportEmail || undefined,
        },
      });
      setTenant(updated);
      flash('Tenant updated successfully.');
    } catch (err) {
      flashErr(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignService = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await assignServiceByKey(assignKey, {
        limits: assignKey === 'vm-management' ? { ...assignLimits } : {},
        pricing: assignKey === 'vm-management' ? { ...assignPricing } : {},
      });
      setAssignOpen(false);
    } catch (err) {
      flashErr(err instanceof ApiError ? err.message : 'Failed to assign service');
    } finally {
      setSaving(false);
    }
  };

  const assignServiceByKey = async (
    serviceKey: ServiceKey,
    options?: { limits?: Record<string, unknown>; pricing?: Record<string, unknown> }
  ) => {
    const limits =
      options?.limits ??
      (serviceKey === 'vm-management' ? { ...DEFAULT_VM_LIMITS } : {});
    const pricing =
      options?.pricing ??
      (serviceKey === 'vm-management' ? { ...DEFAULT_VM_PRICING } : {});

    const config = await assignTenantService(tenantId, {
      serviceKey,
      limits,
      pricing,
    });
    setServices((prev) => [...prev, config]);
    flash(`Service "${serviceKey}" assigned.`);
    return config;
  };

  const handleToggleServiceStatus = async (config: TenantServiceConfig) => {
    const newStatus = config.status === 'active' ? 'suspended' : 'active';
    try {
      const updated = await updateTenantService(tenantId, config.serviceKey, {
        status: newStatus,
      });
      setServices((prev) =>
        prev.map((s) => (s.id === config.id ? updated : s))
      );
      flash(`Service ${newStatus === 'active' ? 'activated' : 'suspended'}.`);
    } catch (err) {
      flashErr(err instanceof ApiError ? err.message : 'Update failed');
    }
  };

  const handleRemoveService = async (config: TenantServiceConfig, force: boolean) => {
    if (!confirm(force ? 'Permanently remove this service config?' : 'Suspend this service?')) {
      return;
    }
    try {
      await removeTenantService(tenantId, config.serviceKey, force);
      if (force) {
        setServices((prev) => prev.filter((s) => s.id !== config.id));
        flash('Service removed.');
      } else {
        setServices((prev) =>
          prev.map((s) =>
            s.id === config.id ? { ...s, status: 'suspended' as const } : s
          )
        );
        flash('Service suspended.');
      }
    } catch (err) {
      flashErr(err instanceof ApiError ? err.message : 'Remove failed');
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const admin = await createTenantAdmin(tenantId, adminForm);
      setAdmins((prev) => [admin, ...prev]);
      setAdminOpen(false);
      setAdminForm({ email: '', password: '' });
      flash('Tenant admin created.');
    } catch (err) {
      flashErr(err instanceof ApiError ? err.message : 'Failed to create admin');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAdmin = async (admin: TenantAdmin) => {
    if (admin.isActive === undefined) return;
    try {
      const updated = await setTenantAdminActive(tenantId, admin.id, !admin.isActive);
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? updated : a)));
      flash(`Admin ${updated.isActive ? 'activated' : 'deactivated'}.`);
    } catch (err) {
      flashErr(err instanceof ApiError ? err.message : 'Update failed');
    }
  };

  const assignedKeys = new Set(services.map((s) => s.serviceKey));
  const availableServices: ServiceKey[] = PLATFORM_SERVICE_CATALOG.map((s) => s.key).filter(
    (k) => !assignedKeys.has(k)
  );

  const openAssignModal = (serviceKey?: ServiceKey) => {
    const nextKey =
      serviceKey && availableServices.includes(serviceKey)
        ? serviceKey
        : availableServices[0];
    if (!nextKey) return;
    setAssignKey(nextKey);
    setAssignLimits(DEFAULT_VM_LIMITS);
    setAssignPricing(DEFAULT_VM_PRICING);
    setAssignOpen(true);
  };

  /** Allow a catalog service. Generic services assign immediately; VM opens config modal. */
  const allowService = async (serviceKey: ServiceKey) => {
    if (!availableServices.includes(serviceKey)) return;

    if (serviceKey === 'vm-management') {
      openAssignModal('vm-management');
      return;
    }

    setAssigningKey(serviceKey);
    try {
      await assignServiceByKey(serviceKey);
    } catch (err) {
      flashErr(err instanceof ApiError ? err.message : 'Failed to assign service');
    } finally {
      setAssigningKey(null);
    }
  };

  /** Permanently remove a service so it is no longer available to the tenant. */
  const disallowService = async (config: TenantServiceConfig) => {
    if (
      !confirm(
        `Disallow "${config.serviceKey}" for this tenant? It will no longer appear in the tenant portal.`
      )
    ) {
      return;
    }

    setDisallowingKey(config.serviceKey);
    try {
      await removeTenantService(tenantId, config.serviceKey, true);
      setServices((prev) => prev.filter((s) => s.id !== config.id));
      flash(`Service "${config.serviceKey}" disallowed.`);
    } catch (err) {
      flashErr(err instanceof ApiError ? err.message : 'Failed to disallow service');
    } finally {
      setDisallowingKey(null);
    }
  };

  const loadTenantOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const all = await fetchSuperAdminOrders();
      setTenantOrders(all.filter((o) => o.tenantId === tenantId));
    } catch (err) {
      setOrdersError(err instanceof ApiError ? err.message : 'Failed to load orders.');
    } finally {
      setOrdersLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tab === 'orders') void loadTenantOrders();
  }, [tab, loadTenantOrders]);

  const loadTenantVms = useCallback(async () => {
    setVmsLoading(true);
    setVmsError(null);
    try {
      const result = await fetchTenantVms(tenantId);
      setTenantVms(result.vms);
    } catch (err) {
      setVmsError(err instanceof ApiError ? err.message : 'Failed to load VMs.');
    } finally {
      setVmsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tab === 'vms') void loadTenantVms();
  }, [tab, loadTenantVms]);

  const handleDeleteVm = async () => {
    if (!vmDeleteTarget) return;

    const vm = vmDeleteTarget;
    setDeletingVmId(vm.id);
    try {
      await deleteVM(vm.id);
      setTenantVms((prev) => prev.filter((v) => v.id !== vm.id));
      setVmDeleteTarget(null);
      flash('VM deleted successfully.');
    } catch (err) {
      flashErr(err instanceof ApiError ? err.message : 'Failed to delete VM.');
    } finally {
      setDeletingVmId(null);
    }
  };

  const serviceIcon = (key: ServiceKey) => {
    switch (key) {
      case 'vm-management':
        return MonitorCheck;
      case 'elastic-servers':
        return Globe;
      case 'azure':
      case 'aws':
      case 'gcp':
        return Cloud;
      case 'docs':
        return BookOpen;
      case 'machine-manager':
        return Monitor;
      default:
        return Shield;
    }
  };

  if (loading && !tenant) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error && !tenant) {
    return <ErrorState title="Failed to load tenant" message={error} onRetry={load} />;
  }

  if (!tenant) return null;

  const tabs: Array<{ id: Tab; label: string; icon: typeof Settings }> = [
    { id: 'general', label: 'General & Branding', icon: Settings },
    { id: 'services', label: 'Services', icon: Shield },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'orders', label: 'Orders', icon: MonitorCheck },
    { id: 'admins', label: 'Tenant Admins', icon: Users },
    { id: 'vms', label: 'Assigned VMs', icon: Server },
  ];

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/super-admin-console/white-labelling/tenants"
            className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
          >
            <ArrowLeft className="h-3 w-3" /> Back to tenants
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
            <TenantStatusBadge status={tenant.status} />
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {tenant.domain} · <span className="font-mono text-xs">{tenant.slug}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {(actionMsg || actionErr) && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            actionErr ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}
        >
          {actionErr ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          {actionErr ?? actionMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? 'bg-red-50 text-[#B91C1C]'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <form
          onSubmit={handleSaveGeneral}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5"
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-[#B91C1C]" />
            <h2 className="text-sm font-semibold text-gray-900">Tenant details</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Name</label>
              <input
                required
                value={generalForm.name}
                onChange={(e) => setGeneralForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Domain</label>
              <input
                required
                value={generalForm.domain}
                onChange={(e) => setGeneralForm((f) => ({ ...f, domain: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Status</label>
              <select
                value={generalForm.status}
                onChange={(e) =>
                  setGeneralForm((f) => ({ ...f, status: e.target.value as TenantStatus }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Palette className="h-4 w-4 text-[#B91C1C]" />
            <h2 className="text-sm font-semibold text-gray-900">Branding</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Logo URL</label>
              <input
                value={generalForm.logoUrl}
                onChange={(e) => setGeneralForm((f) => ({ ...f, logoUrl: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Primary color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={generalForm.primaryColor || '#1a73e8'}
                  onChange={(e) =>
                    setGeneralForm((f) => ({ ...f, primaryColor: e.target.value }))
                  }
                  className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200"
                />
                <input
                  value={generalForm.primaryColor}
                  onChange={(e) =>
                    setGeneralForm((f) => ({ ...f, primaryColor: e.target.value }))
                  }
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-[#B91C1C] focus:outline-none"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">Support email</label>
              <input
                type="email"
                value={generalForm.supportEmail}
                onChange={(e) =>
                  setGeneralForm((f) => ({ ...f, supportEmail: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
              />
            </div>
          </div>

          <BrandingUploadSection
            tenantId={tenantId}
            tenant={tenant}
            onUpdated={(updated) => {
              setTenant(updated);
              setGeneralForm((f) => ({
                ...f,
                logoUrl: updated.branding?.logoUrl ?? '',
                primaryColor: updated.branding?.primaryColor ?? f.primaryColor,
                supportEmail: updated.branding?.supportEmail ?? f.supportEmail,
              }));
            }}
            onFlash={flash}
            onFlashErr={flashErr}
          />

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#991B1B] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>
          </div>
        </form>
      )}

      {tab === 'services' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Service catalog</p>
              <p className="text-sm text-gray-500">
                Allow services for this tenant. Only enabled services appear in the tenant portal.
              </p>
            </div>
            {availableServices.length > 0 && (
              <button
                type="button"
                onClick={() => openAssignModal()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-3 py-2 text-sm font-medium text-white hover:bg-[#991B1B]"
              >
                <Plus className="h-4 w-4" />
                Assign service
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {PLATFORM_SERVICE_CATALOG.map((service) => {
              const assigned = services.find((s) => s.serviceKey === service.key);
              const ServiceIcon = serviceIcon(service.key);
              return (
                <div
                  key={service.key}
                  className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50">
                      <ServiceIcon className="h-5 w-5 text-[#B91C1C]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{service.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-400">{service.key}</p>
                      <p className="mt-1 text-xs text-gray-500">{service.description}</p>
                      {assigned ? (
                        <span
                          className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            assigned.status === 'active'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-orange-50 text-orange-700'
                          }`}
                        >
                          {assigned.status === 'active' ? 'Allowed' : 'Suspended'}
                        </span>
                      ) : (
                        <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Not assigned
                        </span>
                      )}
                    </div>
                  </div>
                  {!assigned ? (
                    <button
                      type="button"
                      disabled={assigningKey === service.key || saving}
                      onClick={() => void allowService(service.key)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#B91C1C] px-3 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-red-50 disabled:opacity-50"
                    >
                      {assigningKey === service.key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      Allow
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={disallowingKey === service.key || saving}
                      onClick={() => void disallowService(assigned)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {disallowingKey === service.key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Ban className="h-3 w-3" />
                      )}
                      Disallow
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {services.length === 0 ? (
            <WhiteLabellingEmptyState
              icon={Shield}
              title="No services assigned yet"
              description="Use Allow on a service above to enable it for this tenant."
              action={
                availableServices.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => openAssignModal()}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
                  >
                    <Plus className="h-4 w-4" />
                    Assign first service
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-900">Assigned service configs</p>
              {services.map((config) => {
                const ServiceIcon = serviceIcon(config.serviceKey);
                return (
                <div
                  key={config.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                        <ServiceIcon className="h-4 w-4 text-[#B91C1C]" />
                      </div>
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {config.serviceKey}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          config.status === 'active'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-orange-50 text-orange-700'
                        }`}
                      >
                        {config.status}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleServiceStatus(config)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
                      >
                        {config.status === 'active' ? (
                          <>
                            <Pause className="h-3 w-3" />
                            Suspend
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3" />
                            Activate
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveService(config, false)}
                        className="rounded-lg border border-orange-200 px-3 py-1.5 text-xs text-orange-700 hover:bg-orange-50"
                      >
                        Soft delete
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveService(config, true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Force remove
                      </button>
                    </div>
                  </div>
                  <ServiceConfigSummary
                    serviceKey={config.serviceKey}
                    limits={config.limits}
                    pricing={config.pricing}
                  />
                  {config.serviceKey === 'vm-management' && config.status === 'active' ? (
                    <VmManagementConfigPanel
                      tenantId={tenantId}
                      initialPricing={{
                        cpuRatePerCoreMonthly: Number(config.pricing['cpuRatePerCoreMonthly'] ?? 0),
                        ramRatePerGbMonthly: Number(config.pricing['ramRatePerGbMonthly'] ?? 0),
                        diskRatePerGbMonthly: Number(config.pricing['diskRatePerGbMonthly'] ?? 0),
                        billingDiscounts: {
                          quarterly: Number(
                            (config.pricing['billingDiscounts'] as Record<string, unknown> | undefined)
                              ?.quarterly ?? 0
                          ),
                          yearly: Number(
                            (config.pricing['billingDiscounts'] as Record<string, unknown> | undefined)
                              ?.yearly ?? 0
                          ),
                        },
                        fixedPlans: Array.isArray(config.pricing['fixedPlans'])
                          ? (config.pricing['fixedPlans'] as VmManagementPricing['fixedPlans'])
                          : [],
                        templatePricing:
                          config.pricing['templatePricing'] &&
                          typeof config.pricing['templatePricing'] === 'object' &&
                          !Array.isArray(config.pricing['templatePricing'])
                            ? (config.pricing['templatePricing'] as VmManagementPricing['templatePricing'])
                            : {},
                      }}
                      onFlash={flash}
                      onFlashErr={flashErr}
                      onPricingSaved={(pricing) => {
                        setServices((prev) =>
                          prev.map((s) =>
                            s.id === config.id
                              ? { ...s, pricing: pricing as unknown as Record<string, unknown> }
                              : s
                          )
                        );
                      }}
                    />
                  ) : null}
                </div>
              );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'wallet' && (
        <TenantWalletPanel tenantId={tenantId} onFlash={flash} onFlashErr={flashErr} />
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">VM orders placed by this tenant.</p>
            <Link
              href="/super-admin-console/white-labelling/orders"
              className="text-xs font-medium text-[#B91C1C] hover:underline"
            >
              All tenant orders →
            </Link>
          </div>

          {ordersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : ordersError ? (
            <ErrorState title="Orders unavailable" message={ordersError} onRetry={() => void loadTenantOrders()} />
          ) : tenantOrders.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
              No orders for this tenant yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Template</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Billing</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantOrders.map((order) => (
                      <tr key={order.id} className="border-b border-gray-50 align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{order.templateName}</p>
                          <p className="text-xs text-gray-500">× {order.count}</p>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {new Intl.NumberFormat('en-IN', {
                            style: 'currency',
                            currency: 'INR',
                          }).format(order.calculatedAmount)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {formatBillingPeriod(order.billingPeriod ?? 'monthly')}
                        </td>
                        <td className="px-4 py-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(order.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'admins' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Create and manage tenant admin accounts for portal access.
            </p>
            <button
              type="button"
              onClick={() => setAdminOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-3 py-2 text-sm font-medium text-white hover:bg-[#991B1B]"
            >
              <Plus className="h-4 w-4" />
              Create admin
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Verified</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10">
                      <WhiteLabellingEmptyState
                        icon={UserPlus}
                        title="No tenant admins yet"
                        description="Create an admin account so the tenant can sign in to their portal."
                        action={
                          <button
                            type="button"
                            onClick={() => setAdminOpen(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
                          >
                            <UserPlus className="h-4 w-4" />
                            Create admin
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  admins.map((admin) => (
                    <tr key={admin.id}>
                      <td className="px-5 py-3.5 font-medium text-gray-900">{admin.email}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            admin.isActive !== false
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {admin.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {admin.isEmailVerified ? 'Yes' : 'No'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500">
                        {new Date(admin.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {admin.isActive !== undefined && (
                          <button
                            type="button"
                            onClick={() => void handleToggleAdmin(admin)}
                            className="text-xs font-medium text-[#B91C1C] hover:underline"
                          >
                            {admin.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'vms' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              VMs provisioned for this tenant via orders and their end-user assignments.
            </p>
            <button
              type="button"
              onClick={() => void loadTenantVms()}
              disabled={vmsLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${vmsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {vmsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : vmsError ? (
            <ErrorState title="VMs unavailable" message={vmsError} onRetry={() => void loadTenantVms()} />
          ) : tenantVms.length === 0 ? (
            <WhiteLabellingEmptyState
              icon={Server}
              title="No VMs assigned yet"
              description="VMs appear here after tenant orders are fulfilled and provisioned."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">VM</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Specs</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Assigned to</th>
                      <th className="px-4 py-3">IP</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantVms.map((vm) => (
                      <tr key={vm.id} className="border-b border-gray-50 align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{vm.name}</p>
                          <p className="text-xs text-gray-500">{vm.templateName}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-gray-400">
                            {vm.node} · vmid {vm.vmid}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {isVmStatus(vm.status) ? (
                            <VMStatusBadge status={vm.status} />
                          ) : (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                              {vm.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {vm.allocatedCpu} vCPU · {vm.allocatedMemoryGb} GB RAM
                          <br />
                          {vm.allocatedDiskGb} GB disk
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {vm.planStatus ? (
                            <>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  vm.planStatus === 'active'
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-orange-50 text-orange-700'
                                }`}
                              >
                                {vm.planStatus}
                              </span>
                              {vm.billingPeriod ? (
                                <p className="mt-1">{formatBillingPeriod(vm.billingPeriod)}</p>
                              ) : null}
                              {vm.planPeriodEnd ? (
                                <p className="mt-0.5 text-gray-500">
                                  until {new Date(vm.planPeriodEnd).toLocaleDateString()}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {vm.assignment ? (
                            <div>
                              <p className="font-medium text-gray-900">{vm.assignment.email}</p>
                              <p
                                className={
                                  vm.assignment.isActive ? 'text-green-600' : 'text-gray-500'
                                }
                              >
                                {vm.assignment.isActive ? 'Active user' : 'Inactive user'}
                              </p>
                            </div>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {vm.ipAddress ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(vm.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setVmDeleteTarget(vm)}
                            disabled={deletingVmId === vm.id || vm.status === 'deleting'}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Delete VM"
                          >
                            {deletingVmId === vm.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#B91C1C]" />
                <h2 className="text-base font-semibold text-gray-900">Assign service</h2>
              </div>
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="rounded p-1 text-gray-400 transition hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAssignService} className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Service</label>
                <select
                  value={assignKey}
                  onChange={(e) => setAssignKey(e.target.value as ServiceKey)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {availableServices.map((k) => {
                    const meta = PLATFORM_SERVICE_CATALOG.find((s) => s.key === k);
                    return (
                      <option key={k} value={k}>
                        {meta ? `${meta.name} (${k})` : k}
                      </option>
                    );
                  })}
                </select>
              </div>

              {assignKey === 'vm-management' ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Limits
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ['maxVms', 'Max VMs'],
                        ['maxTotalVcpu', 'Max vCPU'],
                        ['maxTotalRamGb', 'Max RAM (GB)'],
                        ['maxTotalDiskGb', 'Max Disk (GB)'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-1 block text-xs text-gray-600">{label}</label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={assignLimits[key]}
                          onChange={(e) =>
                            setAssignLimits((l) => ({
                              ...l,
                              [key]: Number(e.target.value),
                            }))
                          }
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Pricing (monthly rates)
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        ['cpuRatePerCoreMonthly', 'CPU / core'],
                        ['ramRatePerGbMonthly', 'RAM / GB'],
                        ['diskRatePerGbMonthly', 'Disk / GB'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-1 block text-xs text-gray-600">{label}</label>
                        <input
                          type="number"
                          required
                          min={0}
                          value={assignPricing[key]}
                          onChange={(e) =>
                            setAssignPricing((p) => ({
                              ...p,
                              [key]: Number(e.target.value),
                            }))
                          }
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  This service will be enabled for the tenant portal with no extra limits or pricing
                  setup.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {adminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-[#B91C1C]" />
                <h2 className="text-base font-semibold text-gray-900">Create tenant admin</h2>
              </div>
              <button
                type="button"
                onClick={() => setAdminOpen(false)}
                className="rounded p-1 text-gray-400 transition hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAdmin} className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  required
                  value={adminForm.email}
                  onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={adminForm.password}
                  onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Min 8 chars, uppercase, lowercase, number & special character.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdminOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {vmDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-600" />
                <h2 className="text-base font-semibold text-gray-900">Delete VM</h2>
              </div>
              <button
                type="button"
                onClick={() => setVmDeleteTarget(null)}
                disabled={deletingVmId === vmDeleteTarget.id}
                className="rounded p-1 text-gray-400 transition hover:bg-gray-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-gray-600">
                Delete VM{' '}
                <span className="font-medium text-gray-900">&quot;{vmDeleteTarget.name}&quot;</span>{' '}
                (vmid {vmDeleteTarget.vmid})? This will stop and purge it from Proxmox.
              </p>
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
                This action cannot be undone. The VM will be removed from the cluster and deleted
                from the platform.
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVmDeleteTarget(null)}
                  disabled={deletingVmId === vmDeleteTarget.id}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteVm()}
                  disabled={deletingVmId === vmDeleteTarget.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingVmId === vmDeleteTarget.id && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Delete VM
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
