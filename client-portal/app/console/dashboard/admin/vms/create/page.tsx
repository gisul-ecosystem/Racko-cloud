'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  MemoryStick,
  Network,
  Plus,
  Server,
  Wallet,
  Wand2,
  X,
} from 'lucide-react';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { ApiError } from '@/lib/apiClient';
import { parseBillingDiscounts } from '@/lib/billingPeriodUtils';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { tenantVps } from '@/lib/tenantAdminRoutes';
import {
  createTenantOrder,
  createTenantWalletTopup,
  getTenantOrderCatalog,
  getTenantOrderTemplateDetail,
  getTenantWallet,
  quoteTenantOrder,
} from '@/lib/tenantPortalApi';
import type {
  BillingPeriod,
  PlaceOrderInput,
  TenantOrderTemplate,
  TenantTemplateDetail,
  TenantWallet,
  VmManagementPricing,
} from '@/types/tenantPortal';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Step = 1 | 2 | 3 | 4;
type PasswordMode = 'fixed' | 'dynamic';
type NetworkType = 'public' | 'private';

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400';
const labelClass = 'block text-xs font-medium text-gray-700 mb-1';
const MAX_VM_COUNT = Number(process.env['NEXT_PUBLIC_VM_MAX_BULK_COUNT']) || 50;

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function validateName(value: string): string {
  if (!value.trim()) return 'Name is required';
  if (!/^[a-zA-Z0-9-]+$/.test(value)) return 'Letters, numbers, and hyphens only';
  if (value.length > 63) return 'Max 63 characters';
  return '';
}

/** Same 4-step Create VM wizard as admin; submits via tenant order API. */
export default function TenantCreateVmPage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();
  const isAdmin = tenantUser?.role === 'tenant_admin';

  const [step, setStep] = useState<Step>(1);
  const [templates, setTemplates] = useState<TenantOrderTemplate[]>([]);
  const [pricing, setPricing] = useState<VmManagementPricing | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateDetails, setTemplateDetails] = useState<TenantTemplateDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [cloneType, setCloneType] = useState<'dedicated_storage' | 'dynamic_storage'>(
    'dedicated_storage'
  );
  const [cpuOverride, setCpuOverride] = useState('');
  const [ramOverride, setRamOverride] = useState('');
  const [diskOverride, setDiskOverride] = useState('');
  const [description, setDescription] = useState('');
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('fixed');
  const [consolePassword, setConsolePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nameError, setNameError] = useState('');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [networkType, setNetworkType] = useState<NetworkType>('public');
  const [submitting, setSubmitting] = useState(false);

  const [wallet, setWallet] = useState<TenantWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupPending, setTopupPending] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  useEffect(() => {
    if (!isAdmin) {
      router.replace(tenantVps.vms);
      return;
    }
    setTemplatesLoading(true);
    void getTenantOrderCatalog()
      .then((catalog) => {
        setTemplates(catalog.templates);
        setPricing(catalog.pricing);
        setTemplatesError(null);
      })
      .catch((err) => {
        setTemplatesError(err instanceof ApiError ? err.message : 'Failed to load templates.');
      })
      .finally(() => setTemplatesLoading(false));
  }, [isAdmin, router]);

  const refreshWallet = useCallback(async () => {
    const w = await getTenantWallet();
    setWallet(w);
    return w;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setWalletLoading(true);
    void refreshWallet()
      .catch(() => undefined)
      .finally(() => setWalletLoading(false));
  }, [isAdmin, refreshWallet]);

  useEffect(() => {
    if (!selectedTemplateId || !isAdmin) {
      setTemplateDetails(null);
      return;
    }
    setDetailsLoading(true);
    void getTenantOrderTemplateDetail(selectedTemplateId)
      .then(setTemplateDetails)
      .catch(() => setTemplateDetails(null))
      .finally(() => setDetailsLoading(false));
  }, [selectedTemplateId, isAdmin]);

  const selectedTemplate = templates.find((t) => t.templateId === selectedTemplateId);
  const minCpu = templateDetails?.baselineSpecs.cpuCores ?? 1;
  const minRam = templateDetails?.baselineSpecs.memoryGb ?? 1;
  const minDisk = templateDetails?.baselineSpecs.diskGb ?? 10;

  const safeCpu = Math.max(minCpu, parseInt(cpuOverride, 10) || minCpu);
  const safeRam = Math.max(minRam, parseFloat(ramOverride) || minRam);
  const safeDisk = Math.max(minDisk, parseInt(diskOverride, 10) || minDisk);

  const cpuError =
    cpuOverride !== '' && parseInt(cpuOverride, 10) < minCpu
      ? `Must be ≥ ${minCpu}`
      : '';
  const ramError =
    ramOverride !== '' && parseFloat(ramOverride) < minRam ? `Must be ≥ ${minRam}` : '';
  const diskError =
    diskOverride !== '' && parseInt(diskOverride, 10) < minDisk
      ? `Must be ≥ ${minDisk}`
      : '';

  const orderInput: PlaceOrderInput | null = useMemo(() => {
    if (!selectedTemplateId || !templateDetails) return null;
    return {
      templateId: selectedTemplateId,
      count,
      billingPeriod,
      networkType,
      ...(safeCpu > minCpu ? { cpuCores: safeCpu } : {}),
      ...(safeRam > minRam ? { memoryGb: safeRam } : {}),
      ...(cloneType === 'dedicated_storage' && safeDisk > minDisk ? { diskGb: safeDisk } : {}),
    };
  }, [
    selectedTemplateId,
    templateDetails,
    count,
    billingPeriod,
    networkType,
    safeCpu,
    safeRam,
    safeDisk,
    minCpu,
    minRam,
    minDisk,
    cloneType,
  ]);

  const billingDiscounts = useMemo(
    () => parseBillingDiscounts(pricing?.billingDiscounts),
    [pricing]
  );

  const localEstimate = useMemo(() => {
    if (!selectedTemplateId || !pricing) return null;
    const tplPricing = pricing.templatePricing?.[String(selectedTemplateId)];
    const cpuRate = tplPricing?.cpuRatePerCoreMonthly ?? pricing.cpuRatePerCoreMonthly ?? 0;
    const ramRate = tplPricing?.ramRatePerGbMonthly ?? pricing.ramRatePerGbMonthly ?? 0;
    const diskRate = tplPricing?.diskRatePerGbMonthly ?? pricing.diskRatePerGbMonthly ?? 0;
    const monthly =
      (safeCpu * cpuRate + safeRam * ramRate + safeDisk * diskRate) * count;
    if (billingPeriod === 'quarterly') return monthly * 3 * (1 - (billingDiscounts.quarterly ?? 0));
    if (billingPeriod === 'yearly') return monthly * 12 * (1 - (billingDiscounts.yearly ?? 0));
    return monthly;
  }, [
    selectedTemplateId,
    pricing,
    safeCpu,
    safeRam,
    safeDisk,
    count,
    billingPeriod,
    billingDiscounts,
  ]);

  const pricingConfigured = Boolean(pricing && localEstimate !== null && localEstimate > 0);
  const displayCost = quoteAmount ?? localEstimate ?? 0;
  const hasSufficientBalance = !wallet || wallet.balance >= displayCost;

  const fetchQuote = useCallback(async () => {
    if (!orderInput) return;
    setQuoteLoading(true);
    try {
      const q = await quoteTenantOrder(orderInput);
      setQuoteAmount(q.amount);
    } catch {
      setQuoteAmount(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [orderInput]);

  function canProceedStep1() {
    return Boolean(selectedTemplateId && templateDetails && !detailsLoading);
  }

  function canProceedStep2() {
    if (validateName(name)) return false;
    if (cpuError || ramError || diskError) return false;
    if (passwordMode === 'fixed' && !consolePassword.trim()) return false;
    return true;
  }

  function startBalancePoll(previousBalance: number) {
    clearPoll();
    setTopupPending('Payment received — updating balance…');
    pollRef.current = setInterval(() => {
      pollCountRef.current += 1;
      void refreshWallet().then((w) => {
        if (w.balance !== previousBalance) {
          clearPoll();
          setTopupPending(null);
          setTopupOpen(false);
          addToast('success', `Wallet topped up! New balance: ${formatMoney(w.balance)}`);
        } else if (pollCountRef.current >= 10) {
          clearPoll();
          setTopupPending('Balance may take a moment to update. Refresh if needed.');
        }
      });
    }, 3000);
  }

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setTopupLoading(true);
    setTopupPending(null);
    try {
      const previousBalance = wallet?.balance ?? 0;
      const data = await createTenantWalletTopup(amount);
      if (!window.Razorpay) {
        addToast('error', 'Payment SDK not loaded. Try again.');
        return;
      }
      new window.Razorpay({
        key: data.keyId,
        amount: data.amount * 100,
        currency: data.currency,
        order_id: data.razorpayOrderId,
        handler: () => startBalancePoll(previousBalance),
        theme: { color: accentColor },
      }).open();
      setTopupAmount('');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Top-up failed.');
    } finally {
      setTopupLoading(false);
    }
  }

  async function handleSubmit() {
    if (!orderInput) return;
    if (pricingConfigured && !hasSufficientBalance) {
      addToast('error', 'Insufficient wallet balance. Please top up before creating a VM.');
      return;
    }
    setSubmitting(true);
    try {
      const order = await createTenantOrder(orderInput);
      if (order.status === 'pending_payment') {
        addToast('error', 'Insufficient wallet balance. Please top up and try again.');
        await refreshWallet();
        return;
      }
      addToast(
        'success',
        count === 1 ? 'VM creation started.' : `Bulk job started for ${count} VMs.`
      );
      router.push(`${tenantVps.jobs}/${order.id}`);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to create VM.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAdmin) return null;

  const primaryBtn = {
    className:
      'inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-medium rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90',
    style: tenantAccentButton(accentColor),
  };

  return (
    <div className="max-w-2xl">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create VM</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Provision a new virtual machine from a template
        </p>
      </div>

      <div className="mb-8 flex items-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                step >= s ? 'text-white' : 'bg-gray-100 text-gray-400'
              }`}
              style={step >= s ? { backgroundColor: accentColor } : undefined}
            >
              {step > s ? <Check className="h-3.5 w-3.5" /> : s}
            </div>
            <span className={`text-xs font-medium ${step === s ? 'text-gray-900' : 'text-gray-400'}`}>
              {['Select Template', 'Configure', 'Network', 'Review'][idx]}
            </span>
            {idx < 3 ? <ChevronRight className="mx-1 h-3.5 w-3.5 text-gray-300" /> : null}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Choose a template</h2>
          {templatesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : templatesError ? (
            <p className="text-sm text-red-500">{templatesError}</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-400">
              No templates available. Ask your platform admin to assign VPS templates.
            </p>
          ) : (
            <div className="space-y-2">
              {templates.map((tpl) => {
                const isSelected = selectedTemplateId === tpl.templateId;
                return (
                  <button
                    key={tpl.templateId}
                    type="button"
                    onClick={() => setSelectedTemplateId(tpl.templateId)}
                    className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    style={
                      isSelected
                        ? { borderColor: accentColor, backgroundColor: `${accentColor}14` }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                          <Server className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                          <p className="text-xs text-gray-400">
                            Node: {tpl.node} · ID: {tpl.templateId}
                          </p>
                        </div>
                      </div>
                      {isSelected ? <Check className="h-4 w-4" style={{ color: accentColor }} /> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedTemplateId && templateDetails ? (
            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                Template specs
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-600">
                    {templateDetails.baselineSpecs.cpuCores} vCPU
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MemoryStick className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-600">
                    {templateDetails.baselineSpecs.memoryGb} GB RAM
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-600">
                    {templateDetails.baselineSpecs.diskGb} GB disk
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canProceedStep1()}
              className={primaryBtn.className}
              style={primaryBtn.style}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && templateDetails ? (
        <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Configure VM</h2>

          <div>
            <label className={labelClass}>
              VM Name{' '}
              {count > 1 ? (
                <span className="text-gray-400">(prefix: name-1, name-2…)</span>
              ) : null}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(validateName(e.target.value));
              }}
              onBlur={() => setNameError(validateName(name))}
              placeholder="my-vm"
              className={`${inputClass} ${nameError ? 'border-red-300 focus:ring-red-500' : ''}`}
            />
            {nameError ? <p className="mt-1 text-xs text-red-500">{nameError}</p> : null}
            <p className="mt-1 text-xs text-gray-400">
              Letters, numbers, hyphens only. Stored as lowercase.
            </p>
          </div>

          <div>
            <label className={labelClass}>
              Count <span className="text-gray-400">(1–{MAX_VM_COUNT})</span>
            </label>
            <input
              type="number"
              min={1}
              max={MAX_VM_COUNT}
              value={count}
              onChange={(e) =>
                setCount(Math.max(1, Math.min(MAX_VM_COUNT, parseInt(e.target.value, 10) || 1)))
              }
              className={inputClass}
            />
            {count > 1 ? (
              <p className="mt-1 text-xs text-blue-600">
                Bulk creation — job will be created and processed in background.
              </p>
            ) : null}
          </div>

          <div>
            <label className={labelClass}>Billing period</label>
            <div className="grid grid-cols-3 gap-2">
              {(['monthly', 'quarterly', 'yearly'] as BillingPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBillingPeriod(p)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize ${
                    billingPeriod === p
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Storage Type</label>
            <div className="grid grid-cols-2 gap-3">
              {(['dedicated_storage', 'dynamic_storage'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCloneType(type)}
                  className={`rounded-xl border px-4 py-3 text-left transition-all ${
                    cloneType === type
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Layers
                      className={`h-3.5 w-3.5 ${cloneType === type ? 'text-blue-600' : 'text-gray-400'}`}
                    />
                    <span className="text-xs font-semibold text-gray-900">
                      {type === 'dedicated_storage' ? 'Dedicated' : 'Dynamic'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {type === 'dedicated_storage'
                      ? 'Full clone — independent disk copy'
                      : 'Linked clone — shared base image'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={labelClass}>
              Resource Overrides{' '}
              <span className="text-gray-400">(optional — must be ≥ template values)</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">CPU cores (min {minCpu})</label>
                <input
                  type="number"
                  min={minCpu}
                  max={128}
                  value={cpuOverride}
                  onChange={(e) => setCpuOverride(e.target.value)}
                  placeholder={String(minCpu)}
                  className={`${inputClass} ${cpuError ? 'border-red-300' : ''}`}
                />
                {cpuError ? <p className="mt-1 text-xs text-red-500">{cpuError}</p> : null}
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">RAM GB (min {minRam})</label>
                <input
                  type="number"
                  min={minRam}
                  max={512}
                  step={0.5}
                  value={ramOverride}
                  onChange={(e) => setRamOverride(e.target.value)}
                  placeholder={String(minRam)}
                  className={`${inputClass} ${ramError ? 'border-red-300' : ''}`}
                />
                {ramError ? <p className="mt-1 text-xs text-red-500">{ramError}</p> : null}
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Disk GB (min {minDisk})</label>
                <input
                  type="number"
                  min={minDisk}
                  max={10000}
                  value={diskOverride}
                  onChange={(e) => setDiskOverride(e.target.value)}
                  placeholder={String(minDisk)}
                  disabled={cloneType === 'dynamic_storage'}
                  className={`${inputClass} ${cloneType === 'dynamic_storage' ? 'opacity-50' : ''} ${diskError ? 'border-red-300' : ''}`}
                />
                {diskError ? <p className="mt-1 text-xs text-red-500">{diskError}</p> : null}
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Optional notes…"
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="border-t border-gray-100 pt-2">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Console Password</h3>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              {(
                [
                  { mode: 'fixed' as PasswordMode, icon: Lock, title: 'Set Password', desc: 'Use one password for all VMs' },
                  { mode: 'dynamic' as PasswordMode, icon: Wand2, title: 'Auto Generate', desc: 'Unique password per VM' },
                ] as const
              ).map(({ mode, icon: Icon, title, desc }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPasswordMode(mode)}
                  className={`rounded-xl border px-4 py-3 text-left transition-all ${
                    passwordMode === mode
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Icon
                      className={`h-3.5 w-3.5 ${passwordMode === mode ? 'text-blue-600' : 'text-gray-400'}`}
                    />
                    <span className="text-xs font-semibold text-gray-900">{title}</span>
                  </div>
                  <p className="text-xs text-gray-400">{desc}</p>
                </button>
              ))}
            </div>
            {passwordMode === 'fixed' ? (
              <div>
                <label className={labelClass}>Console Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={consolePassword}
                    onChange={(e) => setConsolePassword(e.target.value)}
                    placeholder="Enter password"
                    className={`${inputClass} pr-10`}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs text-blue-700">
                  A unique secure password will be generated for each VM. View credentials after
                  creation on the VM details page.
                </p>
              </div>
            )}
          </div>

          {pricingConfigured && localEstimate !== null ? (
            <div className="border-t border-gray-100 pt-2">
              <div className="mb-2 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Estimated cost</h3>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="text-sm text-gray-700">
                  {count} VM{count > 1 ? 's' : ''} · {billingPeriod} ·{' '}
                  <span className="font-semibold text-gray-900">{formatMoney(localEstimate)}</span>
                </div>
                {!walletLoading && wallet ? (
                  <div
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      wallet.balance >= localEstimate
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    Wallet: {formatMoney(wallet.balance)}
                    {wallet.balance < localEstimate ? ' (insufficient)' : ''}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!canProceedStep2()}
              className={primaryBtn.className}
              style={primaryBtn.style}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && templateDetails ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Network</h2>
          <p className="mb-4 text-xs text-gray-500">
            Choose how this VM connects to the network. This applies to all{' '}
            {count > 1 ? `${count} VMs` : 'the VM'} in this batch.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setNetworkType('public')}
              className={`rounded-xl border px-4 py-4 text-left transition-all ${
                networkType === 'public'
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              style={
                networkType === 'public'
                  ? { borderColor: accentColor, backgroundColor: `${accentColor}14` }
                  : undefined
              }
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Globe className={`h-4 w-4 ${networkType === 'public' ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="text-sm font-semibold text-gray-900">Public IP</span>
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Internet-routable IP address. Accessible directly over the internet — best for
                public-facing services.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setNetworkType('private')}
              className={`rounded-xl border px-4 py-4 text-left transition-all ${
                networkType === 'private'
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              style={
                networkType === 'private'
                  ? { borderColor: accentColor, backgroundColor: `${accentColor}14` }
                  : undefined
              }
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Network className={`h-4 w-4 ${networkType === 'private' ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="text-sm font-semibold text-gray-900">Private IP</span>
              </div>
              <p className="text-xs text-gray-500">
                Internal-only IP address (10.110.0.0/16). Not reachable from the internet — best
                for backend/internal services.
              </p>
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(4);
                void fetchQuote();
              }}
              className={primaryBtn.className}
              style={primaryBtn.style}
            >
              Review <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 && templateDetails && selectedTemplate ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-sm font-semibold text-gray-900">Review &amp; Create</h2>

          <div className="mb-6 space-y-3">
            {[
              {
                label: 'Template',
                value: `${selectedTemplate.name} (ID: ${selectedTemplate.templateId})`,
              },
              {
                label: 'VM Name',
                value:
                  count > 1
                    ? `${name.toLowerCase()}-1 … ${name.toLowerCase()}-${count}`
                    : name.toLowerCase(),
              },
              {
                label: 'Count',
                value: count === 1 ? '1 VM (async job)' : `${count} VMs (bulk job)`,
              },
              {
                label: 'Storage Type',
                value:
                  cloneType === 'dedicated_storage'
                    ? 'Dedicated (full clone)'
                    : 'Dynamic (linked clone)',
              },
              { label: 'Billing', value: billingPeriod },
              {
                label: 'Network',
                value: networkType === 'private' ? 'Private IP (10.110.0.0/16)' : 'Public IP',
              },
              { label: 'Node', value: selectedTemplate.node },
              { label: 'CPU', value: `${safeCpu} vCPU` },
              { label: 'RAM', value: `${safeRam} GB` },
              {
                label: 'Disk',
                value:
                  cloneType === 'dedicated_storage' ? `${safeDisk} GB` : 'Shared (dynamic)',
              },
              {
                label: 'Password',
                value: passwordMode === 'dynamic' ? 'Auto-generated per VM' : 'Custom (set)',
              },
              ...(description ? [{ label: 'Description', value: description }] : []),
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex items-start justify-between border-b border-gray-50 py-2 last:border-0"
              >
                <span className="w-32 shrink-0 text-xs font-medium text-gray-500">{label}</span>
                <span className="text-right text-xs text-gray-900">{value}</span>
              </div>
            ))}
          </div>

          {pricingConfigured ? (
            <div className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              <div className="border-b border-gray-200 bg-white px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Cost Summary
                  </p>
                </div>
              </div>
              {quoteLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-1.5 px-4 py-3 text-xs">
                  <div className="flex justify-between font-semibold text-gray-900">
                    <span>
                      Total ({billingPeriod} × {count} VM{count > 1 ? 's' : ''})
                    </span>
                    <span>{formatMoney(displayCost)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Wallet balance</span>
                    <span>
                      {walletLoading ? '…' : wallet ? formatMoney(wallet.balance) : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {pricingConfigured && wallet && !hasSufficientBalance ? (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">Insufficient wallet balance</p>
                  <p className="mt-0.5 text-xs text-red-700">
                    You need {formatMoney(displayCost)} but your wallet has{' '}
                    {formatMoney(wallet.balance)}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTopupOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                  style={tenantAccentButton(accentColor)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Top up wallet
                </button>
              </div>
            </div>
          ) : null}

          <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <p className="text-xs text-blue-700">
              {count === 1
                ? "VM creation runs in the background. You'll be redirected to track progress."
                : 'Bulk creation: A job will be created and you will be redirected to track progress.'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || (pricingConfigured && !hasSufficientBalance)}
              className={`${primaryBtn.className} px-6 shadow-sm`}
              style={primaryBtn.style}
            >
              {submitting ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : null}
              {count > 1 ? `Create ${count} VMs` : 'Create VM'}
            </button>
          </div>
        </div>
      ) : null}

      {topupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <p className="text-sm font-semibold text-gray-900">Top up wallet</p>
              <button
                type="button"
                onClick={() => {
                  setTopupOpen(false);
                  clearPoll();
                  setTopupPending(null);
                }}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleTopup(e)} className="space-y-4 px-5 py-4">
              <div>
                <label className={labelClass}>Amount (INR)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              {topupPending ? <p className="text-xs text-blue-600">{topupPending}</p> : null}
              <button
                type="submit"
                disabled={topupLoading}
                className="w-full rounded-lg py-2 text-sm font-medium text-white disabled:opacity-50"
                style={tenantAccentButton(accentColor)}
              >
                {topupLoading ? 'Starting…' : 'Pay with Razorpay'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
