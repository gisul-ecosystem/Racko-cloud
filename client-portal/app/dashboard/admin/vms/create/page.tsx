'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Script from 'next/script';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../../../context/AuthContext';
import { useTemplates, useTemplateDetails } from '../../../../../hooks/useTemplates';
import { createVM } from '../../../../../lib/vmApi';
import { ApiError } from '../../../../../lib/apiClient';
import { ToastContainer, useToast } from '../../../../../components/ui/Toast';
import { ProjectSelect } from '../../../../../components/console/ProjectSelect';
import {
  getMyAdminWallet,
  quoteAdminVmCreation,
  getAdminPricing,
  createAdminWalletTopup,
} from '../../../../../lib/adminBillingApi';
import type { AdminWallet, AdminVmQuote, AdminPricingConfig } from '../../../../../types/adminBilling';
import {
  Server, ChevronRight, ChevronLeft, Check,
  Cpu, MemoryStick, HardDrive, Layers,
  KeyRound, Eye, EyeOff, Wand2, Lock,
  Wallet, AlertTriangle, Loader2, Plus, X,
} from 'lucide-react';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Step = 1 | 2 | 3;
type PasswordMode = 'fixed' | 'dynamic';

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

export default function CreateVMPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { templates, loading: templatesLoading, error: templatesError } = useTemplates(isAuthenticated);
  const { toasts, addToast, dismiss } = useToast();

  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const { details: templateDetails, loading: detailsLoading } = useTemplateDetails(selectedTemplateId);

  // Step 2
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [cloneType, setCloneType] = useState<'dedicated_storage' | 'dynamic_storage'>('dedicated_storage');
  const [cpuOverride, setCpuOverride] = useState('');
  const [ramOverride, setRamOverride] = useState('');
  const [diskOverride, setDiskOverride] = useState('');
  const [description, setDescription] = useState('');
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('fixed');
  const [consolePassword, setConsolePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nameError, setNameError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Billing
  const [wallet, setWallet] = useState<AdminWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [pricing, setPricing] = useState<AdminPricingConfig | null>(null);
  const [quote, setQuote] = useState<AdminVmQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Top-up modal
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupPending, setTopupPending] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const clearPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    pollCountRef.current = 0;
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  // Pre-select from query param
  useEffect(() => {
    if (templatesLoading || templates.length === 0) return;
    const paramId = searchParams.get('templateId');
    if (!paramId) return;
    const vmid = parseInt(paramId, 10);
    if (isNaN(vmid)) return;
    const match = templates.find((t) => t.vmid === vmid);
    if (match) { setSelectedTemplateId(vmid); setStep(2); }
  }, [templates, templatesLoading, searchParams]);

  // Load wallet + pricing once authenticated
  const refreshWallet = useCallback(async () => {
    const w = await getMyAdminWallet();
    setWallet(w);
    return w;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setWalletLoading(true);
    Promise.all([refreshWallet(), getAdminPricing()])
      .then(([, p]) => { setPricing(p); })
      .catch(() => { /* non-critical */ })
      .finally(() => setWalletLoading(false));
  }, [isAuthenticated, refreshWallet]);

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
      const data = await createAdminWalletTopup(amount);
      if (typeof window.Razorpay === 'undefined') {
        addToast('error', 'Payment checkout failed to load. Please refresh and try again.');
        return;
      }
      new window.Razorpay({
        key: data.keyId,
        amount: data.amount * 100,
        currency: data.currency,
        order_id: data.razorpayOrderId,
        handler: () => startBalancePoll(previousBalance),
        theme: { color: '#2563eb' },
      }).open();
      setTopupAmount('');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Top-up failed.');
    } finally {
      setTopupLoading(false);
    }
  }

  // Derived spec values
  const minCpu = templateDetails?.cpuCores ?? 1;
  const minRam = templateDetails?.memoryGb ?? 0.5;
  const minDisk = templateDetails?.diskGb ?? 10;
  const cpuVal = cpuOverride ? parseInt(cpuOverride, 10) : minCpu;
  const ramVal = ramOverride ? parseFloat(ramOverride) : minRam;
  const diskVal = diskOverride ? parseInt(diskOverride, 10) : minDisk;
  const safeCpu = isNaN(cpuVal) ? 0 : cpuVal;
  const safeRam = isNaN(ramVal) ? 0 : ramVal;
  const safeDisk = isNaN(diskVal) ? 0 : diskVal;

  const cpuError = cpuOverride && (isNaN(cpuVal) || safeCpu < minCpu)
    ? isNaN(cpuVal) ? 'Enter a valid number.' : `Minimum ${minCpu} core${minCpu !== 1 ? 's' : ''} required`
    : null;
  const ramError = ramOverride && (isNaN(ramVal) || safeRam < minRam)
    ? isNaN(ramVal) ? 'Enter a valid number.' : `Minimum ${minRam} GB RAM required`
    : null;
  const diskError = diskOverride && (isNaN(diskVal) || safeDisk < minDisk)
    ? isNaN(diskVal) ? 'Enter a valid number.' : `Minimum ${minDisk} GB disk required`
    : null;

  // Local instant estimate from pricing config (no round-trip)
  const localEstimate = useMemo(() => {
    if (!selectedTemplateId || !pricing) return null;
    const rates = pricing.templatePricing?.[String(selectedTemplateId)];
    if (!rates) return null;
    const perVm =
      safeCpu * rates.cpuRatePerCoreMonthly +
      safeRam * rates.ramRatePerGbMonthly +
      safeDisk * rates.diskRatePerGbMonthly;
    return Math.round(perVm * count * 100) / 100;
  }, [selectedTemplateId, pricing, safeCpu, safeRam, safeDisk, count]);

  // Debounced backend quote (fires when going to step 3)
  async function fetchQuote() {
    if (!selectedTemplateId) return;
    setQuoteLoading(true);
    try {
      const q = await quoteAdminVmCreation({
        templateId: selectedTemplateId,
        cpuCores: safeCpu,
        memoryGb: safeRam,
        diskGb: safeDisk,
        count,
        billingPeriod: 'monthly',
      });
      setQuote(q);
    } catch {
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }

  function validateName(val: string): string {
    if (!val) return 'Name is required.';
    if (val.length < 3) return 'Minimum 3 characters.';
    if (val.length > 50) return 'Maximum 50 characters.';
    if (!/^[a-zA-Z0-9-]+$/.test(val)) return 'Only letters, numbers, and hyphens.';
    return '';
  }

  function canProceedStep1() { return selectedTemplateId !== null && !detailsLoading; }

  function canProceedStep2() {
    const err = validateName(name);
    const consoleOk = passwordMode === 'dynamic' || consolePassword.length > 0;
    return !err && count >= 1 && count <= MAX_VM_COUNT &&
      !cpuError && !ramError && !diskError &&
      safeCpu >= minCpu && safeRam >= minRam && safeDisk >= minDisk && consoleOk;
  }

  const displayCost = quote?.grandTotal ?? localEstimate ?? 0;
  const hasSufficientBalance = wallet !== null && wallet.balance >= displayCost;
  const pricingConfigured = pricing !== null &&
    selectedTemplateId !== null &&
    !!pricing.templatePricing?.[String(selectedTemplateId)];

  async function handleSubmit() {
    if (!selectedTemplateId || !templateDetails) return;
    if (!projectId) {
      addToast('error', 'Select a project for this VM.');
      return;
    }

    // Enforce sufficient balance only if pricing is configured
    if (pricingConfigured && !hasSufficientBalance) {
      addToast('error', 'Insufficient wallet balance. Please top up before creating a VM.');
      return;
    }

    setSubmitting(true);
    try {
      const dto = {
        templateId: selectedTemplateId,
        name: name.toLowerCase(),
        count,
        cloneType,
        passwordMode,
        projectId,
        ...(passwordMode === 'fixed' ? { consolePassword } : {}),
        ...(cpuOverride && safeCpu > minCpu ? { cpuCores: safeCpu } : {}),
        ...(ramOverride && safeRam > minRam ? { memoryGb: safeRam } : {}),
        ...(diskOverride && safeDisk > minDisk ? { diskGb: safeDisk } : {}),
        ...(description ? { description } : {}),
      };

      const result = await createVM(dto);
      addToast('success', count === 1 ? 'VM creation started.' : `Bulk job started for ${count} VMs.`);
      router.push(`/dashboard/admin/jobs/${result.jobId}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create VM.';
      addToast('error', msg);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.vmid === selectedTemplateId);

  return (
    <div className="max-w-2xl">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create VM</h1>
        <p className="text-gray-500 text-sm mt-0.5">Provision a new virtual machine from a template</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as Step[]).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              step > s ? 'bg-blue-600 text-white' : step === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
            }`}>
              {step > s ? <Check className="w-3.5 h-3.5" /> : s}
            </div>
            <span className={`text-xs font-medium ${step === s ? 'text-gray-900' : 'text-gray-400'}`}>
              {['Select Template', 'Configure', 'Review'][idx]}
            </span>
            {idx < 2 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1 — Template selection (unchanged) */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Choose a template</h2>
          {templatesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : templatesError ? (
            <p className="text-red-500 text-sm">{templatesError}</p>
          ) : templates.length === 0 ? (
            <p className="text-gray-400 text-sm">No templates available. Ask your super admin to enable templates.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((tpl) => {
                const isSelected = selectedTemplateId === tpl.vmid;
                const isCustom = tpl.isCustom === true;
                return (
                  <button key={tpl.vmid} onClick={() => setSelectedTemplateId(tpl.vmid)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                      isSelected ? isCustom ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                        : 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                        : isCustom ? 'border-purple-200 bg-purple-50/40 hover:border-purple-300 hover:bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isSelected ? isCustom ? 'bg-purple-100' : 'bg-blue-100' : isCustom ? 'bg-purple-100' : 'bg-gray-100'
                        }`}>
                          <Server className={`w-4 h-4 ${isSelected ? isCustom ? 'text-purple-600' : 'text-blue-600' : isCustom ? 'text-purple-500' : 'text-gray-500'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                            {isCustom && <span className="text-xs font-medium text-purple-700 bg-purple-100 border border-purple-200 rounded-full px-2 py-0.5">Custom</span>}
                          </div>
                          <p className="text-xs text-gray-400">Node: {tpl.node} · ID: {tpl.vmid}</p>
                        </div>
                      </div>
                      {isSelected && <Check className={`w-4 h-4 ${isCustom ? 'text-purple-600' : 'text-blue-600'}`} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {selectedTemplateId && templateDetails && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Template specs</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2"><Cpu className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-600">{templateDetails.cpuCores} vCPU</span></div>
                <div className="flex items-center gap-2"><MemoryStick className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-600">{templateDetails.memoryGb} GB RAM</span></div>
                <div className="flex items-center gap-2"><HardDrive className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-600">{templateDetails.diskGb} GB disk</span></div>
              </div>
            </div>
          )}
          <div className="flex justify-end mt-6">
            <button onClick={() => setStep(2)} disabled={!canProceedStep1()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Configuration + live cost estimate */}
      {step === 2 && templateDetails && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-900">Configure VM</h2>

          {/* Name */}
          <div>
            <label className={labelClass}>VM Name {count > 1 && <span className="text-gray-400">(prefix: name-1, name-2…)</span>}</label>
            <input type="text" value={name}
              onChange={(e) => { setName(e.target.value); setNameError(validateName(e.target.value)); }}
              onBlur={() => setNameError(validateName(name))}
              placeholder="my-vm"
              className={`${inputClass} ${nameError ? 'border-red-300 focus:ring-red-500' : ''}`} />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
            <p className="text-xs text-gray-400 mt-1">Letters, numbers, hyphens only. Stored as lowercase.</p>
          </div>

          {/* Count */}
          <div>
            <label className={labelClass}>Count <span className="text-gray-400">(1–{MAX_VM_COUNT})</span></label>
            <input type="number" min={1} max={MAX_VM_COUNT} value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(MAX_VM_COUNT, parseInt(e.target.value) || 1)))}
              className={inputClass} />
            {count > 1 && <p className="text-xs text-blue-600 mt-1">Bulk creation — job will be created and processed in background.</p>}
          </div>

          {/* Clone type */}
          <div>
            <label className={labelClass}>Storage Type</label>
            <div className="grid grid-cols-2 gap-3">
              {(['dedicated_storage', 'dynamic_storage'] as const).map((type) => (
                <button key={type} onClick={() => setCloneType(type)}
                  className={`px-4 py-3 rounded-xl border text-left transition-all ${cloneType === type ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className={`w-3.5 h-3.5 ${cloneType === type ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className="text-xs font-semibold text-gray-900">{type === 'dedicated_storage' ? 'Dedicated' : 'Dynamic'}</span>
                  </div>
                  <p className="text-xs text-gray-400">{type === 'dedicated_storage' ? 'Full clone — independent disk copy' : 'Linked clone — shared base image'}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Resource overrides */}
          <div>
            <p className={labelClass}>Resource Overrides <span className="text-gray-400">(optional — must be ≥ template values)</span></p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">CPU cores (min {minCpu})</label>
                <input type="number" min={minCpu} max={128} value={cpuOverride}
                  onChange={(e) => setCpuOverride(e.target.value)} placeholder={String(minCpu)}
                  className={`${inputClass} ${cpuError ? 'border-red-300 focus:ring-red-500' : ''}`} />
                {cpuError && <p className="text-xs text-red-500 mt-1">{cpuError}</p>}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">RAM GB (min {minRam})</label>
                <input type="number" min={minRam} max={512} step={0.5} value={ramOverride}
                  onChange={(e) => setRamOverride(e.target.value)} placeholder={String(minRam)}
                  className={`${inputClass} ${ramError ? 'border-red-300 focus:ring-red-500' : ''}`} />
                {ramError && <p className="text-xs text-red-500 mt-1">{ramError}</p>}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Disk GB (min {minDisk})</label>
                <input type="number" min={minDisk} max={10000} value={diskOverride}
                  onChange={(e) => setDiskOverride(e.target.value)} placeholder={String(minDisk)}
                  disabled={cloneType === 'dynamic_storage'}
                  className={`${inputClass} ${cloneType === 'dynamic_storage' ? 'opacity-50' : ''} ${diskError ? 'border-red-300 focus:ring-red-500' : ''}`} />
                {diskError && <p className="text-xs text-red-500 mt-1">{diskError}</p>}
                {cloneType === 'dynamic_storage' && <p className="text-xs text-gray-400 mt-1">Not applicable for dynamic storage</p>}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description <span className="text-gray-400">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              maxLength={500} rows={2} placeholder="Optional notes…" className={`${inputClass} resize-none`} />
          </div>

          {/* Console Password */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Console Password</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {([
                { mode: 'fixed' as PasswordMode, icon: Lock, title: 'Set Password', desc: 'Use one password for all VMs' },
                { mode: 'dynamic' as PasswordMode, icon: Wand2, title: 'Auto Generate', desc: 'Unique password per VM' },
              ]).map(({ mode, icon: Icon, title, desc }) => (
                <button key={mode} type="button" onClick={() => setPasswordMode(mode)}
                  className={`px-4 py-3 rounded-xl border text-left transition-all ${passwordMode === mode ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-3.5 h-3.5 ${passwordMode === mode ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className="text-xs font-semibold text-gray-900">{title}</span>
                  </div>
                  <p className="text-xs text-gray-400">{desc}</p>
                </button>
              ))}
            </div>
            {passwordMode === 'fixed' && (
              <div>
                <label className={labelClass}>Console Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={consolePassword}
                    onChange={(e) => setConsolePassword(e.target.value)} placeholder="Enter password"
                    className={`${inputClass} pr-10`} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
            {passwordMode === 'dynamic' && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-700">A unique secure password will be generated for each VM. View credentials after creation on the VM details page.</p>
              </div>
            )}
          </div>

          {/* Live cost estimate */}
          {pricingConfigured && localEstimate !== null && (
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Estimated cost</h3>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-gray-700">
                  {count} VM{count > 1 ? 's' : ''} · monthly ·{' '}
                  <span className="font-semibold text-gray-900">{formatMoney(localEstimate)}</span>
                </div>
                {!walletLoading && wallet && (
                  <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    wallet.balance >= localEstimate
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    Wallet: {formatMoney(wallet.balance)}
                    {wallet.balance < localEstimate && ' (insufficient)'}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => { setStep(3); void fetchQuote(); }}
              disabled={!canProceedStep2()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">
              Review <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review + cost summary */}
      {step === 3 && templateDetails && selectedTemplate && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-5">Review &amp; Create</h2>

          <div className="mb-5">
            <ProjectSelect
              serviceKey="vm-management"
              value={projectId}
              onChange={setProjectId}
              disabled={submitting}
            />
          </div>

          {/* VM details */}
          <div className="space-y-3 mb-6">
            {[
              { label: 'Template', value: `${selectedTemplate.name} (ID: ${selectedTemplate.vmid})` },
              { label: 'VM Name', value: count > 1 ? `${name.toLowerCase()}-1 … ${name.toLowerCase()}-${count}` : name.toLowerCase() },
              { label: 'Count', value: count === 1 ? '1 VM (async job)' : `${count} VMs (bulk job)` },
              { label: 'Storage Type', value: cloneType === 'dedicated_storage' ? 'Dedicated (full clone)' : 'Dynamic (linked clone)' },
              { label: 'Node', value: selectedTemplate.node },
              { label: 'CPU', value: `${safeCpu} vCPU` },
              { label: 'RAM', value: `${safeRam} GB` },
              { label: 'Disk', value: cloneType === 'dedicated_storage' ? `${safeDisk} GB` : 'Shared (dynamic)' },
              { label: 'Console User', value: templateDetails.defaultUsername },
              { label: 'Password', value: passwordMode === 'dynamic' ? 'Auto-generated per VM' : 'Custom (set)' },
              ...(description ? [{ label: 'Description', value: description }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-500 font-medium w-32 shrink-0">{label}</span>
                <span className="text-xs text-gray-900 text-right">{value}</span>
              </div>
            ))}
          </div>

          {/* Cost summary */}
          {pricingConfigured && (
            <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-200 bg-white">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-900 uppercase tracking-wide">Cost Summary</p>
                </div>
              </div>
              {quoteLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : quote ? (
                <div className="px-4 py-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>CPU ({safeCpu} cores × ₹{pricing?.templatePricing?.[String(selectedTemplateId)]?.cpuRatePerCoreMonthly ?? 0}/core)</span>
                    <span>{formatMoney(quote.cpuCost * count)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>RAM ({safeRam} GB × ₹{pricing?.templatePricing?.[String(selectedTemplateId)]?.ramRatePerGbMonthly ?? 0}/GB)</span>
                    <span>{formatMoney(quote.ramCost * count)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Disk ({safeDisk} GB × ₹{pricing?.templatePricing?.[String(selectedTemplateId)]?.diskRatePerGbMonthly ?? 0}/GB)</span>
                    <span>{formatMoney(quote.diskCost * count)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5 mt-1">
                    <span>Total (monthly × {count} VM{count > 1 ? 's' : ''})</span>
                    <span>{formatMoney(quote.grandTotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 border-t border-gray-200 pt-1.5">
                    <span>Wallet balance</span>
                    <span>{walletLoading ? '…' : wallet ? formatMoney(wallet.balance) : '—'}</span>
                  </div>
                  {wallet && (
                    <div className={`flex justify-between font-semibold ${wallet.balance >= quote.grandTotal ? 'text-green-700' : 'text-red-600'}`}>
                      <span>Balance after</span>
                      <span>{formatMoney(Math.max(0, wallet.balance - quote.grandTotal))}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="px-4 py-3 text-xs text-gray-500">Cost estimate unavailable.</p>
              )}
            </div>
          )}

          {/* Insufficient balance warning with top-up button */}
          {pricingConfigured && wallet !== null && quote !== null && !hasSufficientBalance && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">Insufficient wallet balance</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    You need {formatMoney(quote.grandTotal)} but your wallet has {formatMoney(wallet.balance)}.
                    Top up {formatMoney(quote.grandTotal - wallet.balance)} or more to proceed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTopupOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Top up wallet
                </button>
              </div>
            </div>
          )}

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg mb-5">
            <p className="text-xs text-blue-700">
              {count === 1
                ? "VM creation runs in the background. You'll be redirected to track progress."
                : <><strong>Bulk creation:</strong> A job will be created and you&apos;ll be redirected to track progress.</>
              }
              {pricingConfigured && hasSufficientBalance && (
                <> The estimated cost will be deducted from your wallet on creation.</>
              )}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setStep(2)} disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || !projectId || (pricingConfigured && !hasSufficientBalance)}
              className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 shadow-sm">
              {submitting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {count > 1 ? `Create ${count} VMs` : 'Create VM'}
            </button>
          </div>
        </div>
      )}
      {/* Top-up modal */}
      {topupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">Top up your wallet</h3>
              </div>
              <button type="button" onClick={() => { setTopupOpen(false); clearPoll(); setTopupPending(null); }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleTopup(e)} className="px-5 py-4 space-y-4">
              {wallet && (
                <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                  Current balance: <span className="font-semibold text-gray-900">{formatMoney(wallet.balance)}</span>
                </div>
              )}
              {quote && !hasSufficientBalance && (
                <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                  You need at least <span className="font-semibold">{formatMoney(quote.grandTotal - (wallet?.balance ?? 0))}</span> more to create this VM.
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Amount (₹)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="e.g. 500"
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {topupPending && (
                <p className="text-xs text-blue-600">{topupPending}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setTopupOpen(false); clearPoll(); setTopupPending(null); }}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={topupLoading || !topupAmount || Number(topupAmount) <= 0}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {topupLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Pay with Razorpay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
