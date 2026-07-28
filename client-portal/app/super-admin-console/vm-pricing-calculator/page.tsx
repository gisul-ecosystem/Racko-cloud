'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calculator, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  calculateVmPricing,
  type CloudProvider,
  type ManagedDiskType,
  type PricingCategory,
  type PricingCalculatorMode,
  type PricingPeriod,
  type VmPricingSelectResult,
} from '@/lib/vmPricingCalculatorApi';

const ALL_PROVIDERS: CloudProvider[] = ['aws', 'azure', 'oci', 'gcp'];
const STORAGE_ONLY_PROVIDERS: CloudProvider[] = ['aws', 'azure', 'gcp'];
type ProviderFilter = 'all' | CloudProvider;
type CalculatorViewMode = 'vm' | 'storage_only' | 'oci_block_volume';

function formatUsd(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(digits)}`;
}

function formatUsdMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatInr(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function periodFromHourly(hr: number | null | undefined): PricingPeriod {
  if (hr == null || !Number.isFinite(hr)) {
    return { hr: null, monthly: null, quarterly: null, yearly: null };
  }
  const monthly = hr * 730;
  return {
    hr,
    monthly,
    quarterly: monthly * 3,
    yearly: monthly * 12,
  };
}

function scalePeriod(period: PricingPeriod, rate: number | undefined): PricingPeriod {
  if (rate == null || !Number.isFinite(rate)) {
    return { hr: null, monthly: null, quarterly: null, yearly: null };
  }
  return {
    hr: period.hr == null ? null : period.hr * rate,
    monthly: period.monthly == null ? null : period.monthly * rate,
    quarterly: period.quarterly == null ? null : period.quarterly * rate,
    yearly: period.yearly == null ? null : period.yearly * rate,
  };
}

function dualMoney(usd: number | null | undefined, inr: number | null | undefined): string {
  return `${formatUsd(usd)} · ${formatInr(inr)}`;
}

function managedDiskTypeLabel(value: ManagedDiskType): string {
  return value === 'standard_hdd' ? 'Standard HDD' : 'Standard SSD';
}

export default function VmPricingCalculatorPage() {
  const [calculatorMode, setCalculatorMode] = useState<CalculatorViewMode>('vm');
  const [category, setCategory] = useState<PricingCategory>('linux');
  const [cpu, setCpu] = useState('4');
  const [ram, setRam] = useState('8');
  const [disk, setDisk] = useState('100');
  const [storageDiskType, setStorageDiskType] = useState<ManagedDiskType>('standard_ssd');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [nestedVirtualization, setNestedVirtualization] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VmPricingSelectResult | null>(null);
  const [fxMeta, setFxMeta] = useState<{ rate?: number; source?: string }>({});

  const isVmCalculator = calculatorMode === 'vm';
  const isStorageOnly = calculatorMode === 'storage_only';
  const isOciBlockVolume = calculatorMode === 'oci_block_volume';
  const selectedProviders: CloudProvider[] = isOciBlockVolume
    ? ['oci']
    : providerFilter === 'all'
    ? isStorageOnly
      ? STORAGE_ONLY_PROVIDERS
      : ALL_PROVIDERS
    : [providerFilter];
  const apiMode: PricingCalculatorMode = isVmCalculator ? 'vm' : 'storage_only';

  function switchCalculatorMode(mode: CalculatorViewMode) {
    setCalculatorMode(mode);
    if (mode === 'oci_block_volume') {
      setProviderFilter('oci');
    } else if (providerFilter === 'oci') {
      setProviderFilter('all');
    }
    setResult(null);
    setError(null);
  }

  async function onCalculate() {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        mode: apiMode,
        category: isVmCalculator ? category : 'linux',
        durationDays: 1,
        specs: isVmCalculator
          ? { cpu, ram, disk }
          : isOciBlockVolume
          ? { disk }
          : { disk, diskType: storageDiskType },
        providers: selectedProviders,
        nestedVirtualization: isVmCalculator ? nestedVirtualization : false,
      };
      const selection = await calculateVmPricing(payload);
      if (selection.reason === 'no_cloud_pricing_for_spec') {
        setResult(null);
        setFxMeta({});
        const detailErrors = selection.dynamicPricing?.errors?.slice(0, 3) ?? [];
        const detail =
          detailErrors.length > 0 ? ` Details: ${detailErrors.join(' · ')}` : '';
        setError(
          isOciBlockVolume
            ? `No OCI block volume pricing found for that size.${detail}`
            : isStorageOnly
            ? `No cloud storage pricing found for that size and disk type.${detail}`
            : `No cloud pricing found for that spec.${detail}`
        );
        return;
      }
      setResult(selection);
      setFxMeta({ rate: selection.usdToInr, source: selection.fxSource });
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'Failed to calculate pricing.');
    } finally {
      setLoading(false);
    }
  }

  const publicHourly =
    result?.rawTotalWithPublicIpPerHr ?? result?.rawTotalPricePerHr ?? null;
  const privateHourly =
    result?.rawTotalWithPrivateIpPerHr ??
    (result?.rawComputePricePerHr != null && result?.rawStoragePricePerHr != null
      ? result.rawComputePricePerHr + result.rawStoragePricePerHr
      : null);

  // Prefer explicit public/private IP fields; do not show a combined raw IP total.
  const publicIp =
    result?.rawPublicIpPricePerHr ??
    (typeof result?.rawIpPricePerHr === 'number' ? result.rawIpPricePerHr : 0);
  const privateIp = result?.rawPrivateIpPricePerHr ?? 0;

  const fx = result?.usdToInr ?? fxMeta.rate;

  const publicUsd = useMemo(() => periodFromHourly(publicHourly), [publicHourly]);
  const privateUsd = useMemo(() => periodFromHourly(privateHourly), [privateHourly]);
  const publicInr = useMemo(() => scalePeriod(publicUsd, fx), [publicUsd, fx]);
  const privateInr = useMemo(() => scalePeriod(privateUsd, fx), [privateUsd, fx]);

  const publicIpInr =
    result?.rawPublicIpPricePerHrInr ??
    (publicIp != null && fx != null ? publicIp * fx : null);
  const privateIpInr =
    result?.rawPrivateIpPricePerHrInr ??
    (fx != null ? privateIp * fx : null);
  const computeInr =
    result?.rawComputePricePerHrInr ??
    (result?.rawComputePricePerHr != null && fx != null
      ? result.rawComputePricePerHr * fx
      : null);
  const storageInr =
    result?.rawStoragePricePerHrInr ??
    (result?.rawStoragePricePerHr != null && fx != null
      ? result.rawStoragePricePerHr * fx
      : null);
  const storageOnlyHourly =
    result?.rawStoragePricePerHr ?? result?.rawTotalPricePerHr ?? null;
  const storageOnlyInr =
    result?.rawStoragePricePerHrInr ??
    result?.rawTotalPricePerHrInr ??
    (storageOnlyHourly != null && fx != null ? storageOnlyHourly * fx : null);
  const storageOnlyUsd = useMemo(() => periodFromHourly(storageOnlyHourly), [storageOnlyHourly]);
  const storageOnlyPeriodInr = useMemo(
    () => scalePeriod(storageOnlyUsd, fx),
    [storageOnlyUsd, fx]
  );
  const resultMode = result?.mode ?? apiMode;

  const resolvedSkuEntries = result?.resolvedSkus
    ? (Object.entries(result.resolvedSkus) as [CloudProvider, string | null][])
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/super-admin-console"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to services
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">VM Pricing Calculator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Compare live AWS / Azure / OCI / GCP pricing for full VM quotes, managed-disk
          storage quotes, or OCI block volume pricing.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          <ModeButton
            active={calculatorMode === 'vm'}
            label="VM Calculator"
            onClick={() => switchCalculatorMode('vm')}
          />
          <ModeButton
            active={calculatorMode === 'storage_only'}
            label="Storage Only"
            onClick={() => switchCalculatorMode('storage_only')}
          />
          <ModeButton
            active={calculatorMode === 'oci_block_volume'}
            label="OCI Block Volume"
            onClick={() => switchCalculatorMode('oci_block_volume')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {isVmCalculator ? (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">OS / Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PricingCategory)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
              >
                <option value="linux">Linux</option>
                <option value="windows">Windows</option>
              </select>
            </label>
          ) : null}

          {isVmCalculator ? (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">Pricing mode</span>
              <select
                value={nestedVirtualization ? 'nested' : 'normal'}
                onChange={(e) => setNestedVirtualization(e.target.value === 'nested')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
              >
                <option value="normal">Normal</option>
                <option value="nested">Nested virtualization</option>
              </select>
            </label>
          ) : null}

          {isOciBlockVolume ? (
            <Stat label="Provider" value="OCI block volume only" />
          ) : (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">Provider</span>
              <select
                value={providerFilter === 'oci' ? 'all' : providerFilter}
                onChange={(e) => setProviderFilter(e.target.value as ProviderFilter)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
              >
                <option value="all">
                  {isStorageOnly ? 'ALL (AWS / Azure / GCP)' : 'ALL (compare all)'}
                </option>
                <option value="aws">AWS</option>
                <option value="azure">Azure</option>
                {!isStorageOnly ? <option value="oci">OCI</option> : null}
                <option value="gcp">GCP</option>
              </select>
            </label>
          )}

          {isVmCalculator ? (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">vCPU</span>
              <input
                type="number"
                min={1}
                value={cpu}
                onChange={(e) => setCpu(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
              />
            </label>
          ) : null}

          {isVmCalculator ? (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">RAM (GB)</span>
              <input
                type="number"
                min={1}
                value={ram}
                onChange={(e) => setRam(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
              />
            </label>
          ) : null}

          {isStorageOnly ? (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">Disk type</span>
              <select
                value={storageDiskType}
                onChange={(e) => setStorageDiskType(e.target.value as ManagedDiskType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
              >
                <option value="standard_hdd">Standard HDD</option>
                <option value="standard_ssd">Standard SSD</option>
              </select>
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">
              {isVmCalculator ? 'Disk (GB SSD)' : 'Storage size (GB)'}
            </span>
            <input
              type="number"
              min={1}
              value={disk}
              onChange={(e) => setDisk(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
            />
          </label>
        </div>

        {nestedVirtualization && isVmCalculator ? (
          <p className="mt-3 text-xs text-gray-500">
            Nested mode resolves SKUs that can run Docker/KVM guests (e.g. AWS m7i/c7i, Azure
            D/E_v3, GCP n2, OCI Standard3.Flex), then fetches live list prices for those types.
          </p>
        ) : null}
        {isStorageOnly ? (
          <p className="mt-3 text-xs text-gray-500">
            Storage Only compares AWS, Azure, and GCP using their managed-disk / persistent-disk
            storage models.
          </p>
        ) : null}
        {isOciBlockVolume ? (
          <p className="mt-3 text-xs text-gray-500">
            OCI Block Volume uses OCI&apos;s own live block volume pricing model and keeps OCI
            separate from managed HDD / SSD disk families.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onCalculate()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4" />
            )}
            {loading
              ? 'Calculating…'
              : isOciBlockVolume
              ? 'Calculate OCI block volume'
              : isStorageOnly
              ? 'Calculate storage'
              : 'Calculate'}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {fxMeta.rate != null ? (
            <p className="text-xs text-gray-500">
              FX: 1 USD = ₹{fxMeta.rate.toFixed(2)}
              {fxMeta.source ? ` (${fxMeta.source})` : ''}
            </p>
          ) : null}
        </div>
      </section>

      {result ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            {isOciBlockVolume
              ? 'OCI block volume quote'
              : resultMode === 'storage_only'
              ? 'Storage quote'
              : 'Cheapest match'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {resultMode === 'storage_only' ? 'Request' : 'Spec'}{' '}
            <span className="font-mono text-gray-700">{result.canonicalSpec}</span>
            {' · '}
            Compared: {(result.providersUsed ?? selectedProviders).join(', ')}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Provider" value={result.provider.toUpperCase()} />
            <Stat label="Region" value={result.region || '—'} />
            <Stat label="Instance" value={result.instanceType || '—'} />
            <Stat
              label="Mode"
              value={
                resultMode === 'storage_only'
                  ? 'Storage only'
                  : result.pricingMode === 'nested' || result.nestedVirtualization
                  ? 'Nested virt'
                  : 'Normal'
              }
            />
            <Stat label="Reason" value={result.reason || '—'} />
          </div>

          {resultMode === 'storage_only' ? (
            <>
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">
                  Storage-only breakdown
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat
                    label={isOciBlockVolume ? 'Requested block volume' : 'Requested storage'}
                    value={
                      isOciBlockVolume
                        ? `${disk} GB`
                        : `${disk} GB ${managedDiskTypeLabel(storageDiskType)}`
                    }
                  />
                  <Stat
                    label="Storage"
                    value={dualMoney(storageOnlyHourly, storageOnlyInr)}
                    accent
                  />
                  <Stat
                    label={isOciBlockVolume ? 'Storage model' : 'Category'}
                    value={isOciBlockVolume ? 'OCI Block Volume' : result.category.toUpperCase()}
                  />
                  <Stat label="Currency" value={result.currency || 'USD'} />
                </div>
              </div>

              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">Storage totals</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Hourly USD" value={formatUsd(storageOnlyUsd.hr)} accent />
                  <Stat label="Monthly USD" value={formatUsdMoney(storageOnlyUsd.monthly)} />
                  <Stat label="Hourly INR" value={formatInr(storageOnlyPeriodInr.hr)} accent />
                  <Stat label="Monthly INR" value={formatInr(storageOnlyPeriodInr.monthly)} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Quarterly USD" value={formatUsdMoney(storageOnlyUsd.quarterly)} />
                  <Stat label="Yearly USD" value={formatUsdMoney(storageOnlyUsd.yearly)} />
                  <Stat
                    label="Quarterly INR"
                    value={formatInr(storageOnlyPeriodInr.quarterly)}
                  />
                  <Stat label="Yearly INR" value={formatInr(storageOnlyPeriodInr.yearly)} />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {isOciBlockVolume
                    ? 'OCI block volume totals are derived from the storage component returned by the OCI pricing service path.'
                    : 'Storage-only totals are derived from the storage component returned by the pricing service for this request.'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">Hourly breakdown</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat
                    label="Compute"
                    value={dualMoney(result.rawComputePricePerHr, computeInr)}
                  />
                  <Stat
                    label="Storage"
                    value={dualMoney(result.rawStoragePricePerHr, storageInr)}
                  />
                  <Stat
                    label="Public IP"
                    value={dualMoney(publicIp, publicIpInr ?? (fx != null ? 0 : null))}
                    accent
                  />
                  <Stat
                    label="Private IP"
                    value={dualMoney(privateIp, privateIpInr ?? (fx != null ? 0 : null))}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Private IP is not billed separately ($0). Internet RDP/SSH needs a public IP (or
                  VPN/bastion).
                </p>
              </div>

              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">
                  Total with public IP
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Hourly USD" value={formatUsd(publicUsd.hr)} accent />
                  <Stat label="Monthly USD" value={formatUsdMoney(publicUsd.monthly)} />
                  <Stat label="Hourly INR" value={formatInr(publicInr.hr)} accent />
                  <Stat label="Monthly INR" value={formatInr(publicInr.monthly)} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Quarterly USD" value={formatUsdMoney(publicUsd.quarterly)} />
                  <Stat label="Yearly USD" value={formatUsdMoney(publicUsd.yearly)} />
                  <Stat label="Quarterly INR" value={formatInr(publicInr.quarterly)} />
                  <Stat label="Yearly INR" value={formatInr(publicInr.yearly)} />
                </div>
              </div>

              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">
                  Total with private IP only
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Hourly USD" value={formatUsd(privateUsd.hr)} accent />
                  <Stat label="Monthly USD" value={formatUsdMoney(privateUsd.monthly)} />
                  <Stat label="Hourly INR" value={formatInr(privateInr.hr)} accent />
                  <Stat label="Monthly INR" value={formatInr(privateInr.monthly)} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Quarterly USD" value={formatUsdMoney(privateUsd.quarterly)} />
                  <Stat label="Yearly USD" value={formatUsdMoney(privateUsd.yearly)} />
                  <Stat label="Quarterly INR" value={formatInr(privateInr.quarterly)} />
                  <Stat label="Yearly INR" value={formatInr(privateInr.yearly)} />
                </div>
              </div>
            </>
          )}

          {resolvedSkuEntries.length > 0 ? (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-gray-800">Resolved SKUs</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {resolvedSkuEntries.map(([provider, sku]) => (
                  <Stat
                    key={provider}
                    label={provider.toUpperCase()}
                    value={sku || '—'}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-[#B91C1C] text-white'
          : 'border border-gray-300 bg-white text-gray-700 hover:border-[#B91C1C] hover:text-[#B91C1C]'
      }`}
    >
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 break-all text-sm font-semibold ${
          accent ? 'text-[#B91C1C]' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
