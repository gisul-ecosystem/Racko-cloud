'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calculator, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  calculateVmPricing,
  listVmPricing,
  type CloudProvider,
  type PricingCategory,
  type VmPricingRow,
  type VmPricingSelectResult,
} from '@/lib/vmPricingCalculatorApi';

const ALL_PROVIDERS: CloudProvider[] = ['aws', 'azure', 'oci', 'gcp'];
type ProviderFilter = 'all' | CloudProvider;

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

export default function VmPricingCalculatorPage() {
  const [category, setCategory] = useState<PricingCategory>('linux');
  const [cpu, setCpu] = useState('4');
  const [ram, setRam] = useState('8');
  const [disk, setDisk] = useState('100');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VmPricingSelectResult | null>(null);
  const [rows, setRows] = useState<VmPricingRow[]>([]);
  const [fxMeta, setFxMeta] = useState<{ rate?: number; source?: string }>({});

  const selectedProviders: CloudProvider[] =
    providerFilter === 'all' ? ALL_PROVIDERS : [providerFilter];

  async function onCalculate() {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        category,
        durationDays: 1,
        specs: { cpu, ram, disk },
        providers: selectedProviders,
      };
      const selection = await calculateVmPricing(payload);
      setResult(selection);
      setFxMeta({ rate: selection.usdToInr, source: selection.fxSource });

      if (selection.canonicalSpec) {
        const listed = await listVmPricing({
          canonicalSpec: selection.canonicalSpec,
          category,
          providers: selectedProviders.join(','),
          limit: 100,
        });
        setRows(listed.rows);
        if (listed.usdToInr != null) {
          setFxMeta({ rate: listed.usdToInr, source: listed.fxSource });
        }
      } else {
        setRows([]);
      }
    } catch (err) {
      setResult(null);
      setRows([]);
      setError(err instanceof ApiError ? err.message : 'Failed to calculate pricing.');
    } finally {
      setLoading(false);
    }
  }

  const usd = result?.pricingUsd;
  const inr = result?.pricingInr;

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
          Compare live AWS / Azure / OCI / GCP list prices (USD + INR).
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">OS / Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PricingCategory)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
            >
              <option value="linux">Linux</option>
              <option value="windows">Windows</option>
              <option value="gpu">GPU</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Provider</span>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value as ProviderFilter)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
            >
              <option value="all">ALL (compare all)</option>
              <option value="aws">AWS</option>
              <option value="azure">Azure</option>
              <option value="oci">OCI</option>
              <option value="gcp">GCP</option>
            </select>
          </label>

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

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Disk (GB SSD)</span>
            <input
              type="number"
              min={1}
              value={disk}
              onChange={(e) => setDisk(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
            />
          </label>
        </div>

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
            {loading ? 'Calculating…' : 'Calculate'}
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
          <h2 className="text-lg font-semibold text-gray-900">Cheapest match</h2>
          <p className="mt-1 text-sm text-gray-500">
            Spec <span className="font-mono text-gray-700">{result.canonicalSpec}</span>
            {' · '}
            Compared: {(result.providersUsed ?? selectedProviders).join(', ')}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Provider" value={result.provider.toUpperCase()} />
            <Stat label="Region" value={result.region || '—'} />
            <Stat label="Instance" value={result.instanceType || '—'} />
            <Stat label="Reason" value={result.reason || '—'} />
          </div>

          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">USD</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Hourly" value={formatUsd(usd?.hr)} accent />
              <Stat label="Monthly (×730)" value={formatUsdMoney(usd?.monthly)} />
              <Stat label="Quarterly" value={formatUsdMoney(usd?.quarterly)} />
              <Stat label="Yearly" value={formatUsdMoney(usd?.yearly)} />
            </div>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">INR</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Hourly" value={formatInr(inr?.hr)} accent />
              <Stat label="Monthly (×730)" value={formatInr(inr?.monthly)} />
              <Stat label="Quarterly" value={formatInr(inr?.quarterly)} />
              <Stat label="Yearly" value={formatInr(inr?.yearly)} />
            </div>
          </div>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-lg font-semibold text-gray-900">All matching prices</h2>
            <p className="text-xs text-gray-500">Sorted by hourly cost (lowest first) · USD + INR</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-4 py-3 font-semibold">Region</th>
                  <th className="px-4 py-3 font-semibold">Instance</th>
                  <th className="px-4 py-3 font-semibold">Hr USD</th>
                  <th className="px-4 py-3 font-semibold">Hr INR</th>
                  <th className="px-4 py-3 font-semibold">Mon USD</th>
                  <th className="px-4 py-3 font-semibold">Mon INR</th>
                  <th className="px-4 py-3 font-semibold">Year USD</th>
                  <th className="px-4 py-3 font-semibold">Year INR</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.provider}-${row.region}-${row.category}`}
                    className="border-t border-gray-100"
                  >
                    <td className="px-4 py-2.5 font-medium uppercase text-gray-900">
                      {row.provider}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{row.region}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                      {row.instanceType || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {formatUsd(row.pricingUsd?.hr)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {formatInr(row.pricingInr?.hr)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {formatUsdMoney(row.pricingUsd?.monthly)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {formatInr(row.pricingInr?.monthly)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {formatUsdMoney(row.pricingUsd?.yearly)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {formatInr(row.pricingInr?.yearly)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
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
