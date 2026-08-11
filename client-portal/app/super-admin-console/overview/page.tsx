'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Building2,
  Clock,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  Server,
  TrendingUp,
  Vault,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import { fetchSuperAdminOverview } from '../../../lib/tenantApi';
import type { SuperAdminOverview } from '../../../lib/tenantTypes';
import { ApiError } from '../../../lib/apiClient';

const SERVICE_LABELS: Record<string, string> = {
  'vm-management': 'VPS Hosting',
  'create-vm': 'VM Catalog',
  'dedicated-server': 'Dedicated Servers',
  'elastic-servers': 'Elastic Servers',
  azure: 'Azure',
  aws: 'AWS',
  gcp: 'GCP',
  'cloud-labs': 'Cloud Labs',
  'machine-manager': 'Machine Manager',
  docs: 'Documentation',
  unknown: 'Other',
};

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompactMoney(amount: number, currency: string): string {
  if (amount >= 10000000) return `${currency} ${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `${currency} ${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000) return `${currency} ${(amount / 1000).toFixed(1)}K`;
  return formatMoney(amount, currency);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TrendBadge({ changePct }: { changePct: number }) {
  const isPositive = changePct >= 0;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(changePct).toFixed(1)}%
    </span>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: LucideIcon;
  iconClassName: string;
  className?: string;
}

function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  iconClassName,
  className = '',
}: MetricCardProps) {
  return (
    <div
      className={`group h-full rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_1px_0_rgba(255,255,255,0.75),0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_50px_rgba(15,23,42,0.12)] sm:p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {title}
          </p>
          <p className="mt-2 text-[1.65rem] font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
          {trend !== undefined ? <div className="mt-3"><TrendBadge changePct={trend} /></div> : null}
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-105 ${iconClassName}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Surface({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[28px] border border-white/70 bg-white/85 shadow-[0_10px_40px_rgba(15,23,42,0.06)] backdrop-blur transition-transform duration-300 hover:-translate-y-0.5 ${className}`}
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-100/80 px-5 py-4 sm:px-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-8 w-1.5 rounded-full bg-gradient-to-b from-[#991B1B] to-[#F87171]" />
            <div>
              {eyebrow ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {eyebrow}
                </p>
              ) : null}
              <h2 className="mt-1 text-sm font-semibold text-slate-900">{title}</h2>
            </div>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function NewTenantSignupsChart({ data }: { data: Array<{ month: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <EmptyState
        icon={Building2}
        title="No new tenants in the last 6 months"
        description="This usually means the tenant pipeline is quiet or the data window is still catching up."
      />
    );
  }

  return (
    <div className="px-5 pb-5 pt-4 sm:px-6">
      <div className="flex h-48 items-end gap-3 rounded-3xl bg-slate-50/80 px-4 py-4 ring-1 ring-slate-100">
        {data.map((d) => {
          const height = Math.max(10, (d.count / max) * 100);
          return (
            <div key={d.month} className="group flex flex-1 flex-col items-center gap-2">
              <div className="relative flex h-32 w-full items-end justify-center">
                <div
                  className="w-full max-w-[34px] rounded-t-2xl bg-gradient-to-t from-[#991B1B] via-[#EF4444] to-[#FCA5A5] shadow-[0_8px_20px_rgba(185,28,28,0.18)] transition-all duration-300 group-hover:translate-y-[-2px]"
                  style={{ height: `${height}%` }}
                  title={`${d.count} tenants`}
                />
              </div>
              <div className="text-center">
                <p className="text-[11px] font-medium text-slate-400">{d.month}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-700">{d.count}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RevenueSparkBars({
  data,
  currency,
}: {
  data: Array<{ serviceKey: string; amount: number; percentage: number }>;
  currency: string;
}) {
  const topItems = data.slice(0, 6);
  const max = Math.max(...topItems.map((item) => item.amount), 1);
  const palette = ['#B91C1C', '#F97316', '#0F766E', '#7C3AED', '#0369A1', '#B45309'];

  if (topItems.length === 0) {
    return (
      <EmptyState
        icon={Vault}
        title="No service revenue"
        description="Revenue by service will appear here once billing activity is available."
      />
    );
  }

  return (
    <div className="space-y-4 p-5 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {topItems.slice(0, 2).map((item, idx) => (
          <div
            key={item.serviceKey}
            className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4 transition-transform duration-300 hover:-translate-y-0.5"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              {SERVICE_LABELS[item.serviceKey] || item.serviceKey}
            </p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              {formatCompactMoney(item.amount, currency)}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(12, item.percentage)}%`,
                  background:
                    idx === 0
                      ? 'linear-gradient(90deg, #991B1B, #F87171)'
                      : 'linear-gradient(90deg, #0F766E, #2DD4BF)',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {topItems.map((item, idx) => {
          const width = (item.amount / max) * 100;
          return (
            <div key={item.serviceKey} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-slate-700">
                  {SERVICE_LABELS[item.serviceKey] || item.serviceKey}
                </span>
                <span className="font-semibold text-slate-900">{item.percentage.toFixed(1)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${width}%`,
                    background: palette[idx % palette.length],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignupsAreaChart({ data }: { data: Array<{ month: string; count: number }> }) {
  if (!data.some((d) => d.count > 0)) {
    return (
      <EmptyState
        icon={Building2}
        title="No signup activity"
        description="New tenant trends will render here once the last six months includes activity."
      />
    );
  }

  const w = 640;
  const h = 240;
  const padX = 28;
  const padY = 22;
  const max = Math.max(...data.map((d) => d.count), 1);
  const step = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = padX + i * step;
    const y = h - padY - (d.count / max) * (h - padY * 2);
    return { x, y, month: d.month, count: d.count };
  });

  const line = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${points.map((p) => `${p.x},${p.y}`).join(' ')} ${w - padX},${h - padY} ${padX},${h - padY}`;

  return (
    <div className="p-5 sm:p-6">
      <div className="rounded-[24px] border border-slate-100 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))] p-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-60 w-full" role="img" aria-label="New tenant signups over time">
          <defs>
            <linearGradient id="signupArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#991B1B" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#991B1B" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <g stroke="#E2E8F0" strokeWidth="1">
            {[1, 2, 3].map((i) => (
              <line key={i} x1={padX} x2={w - padX} y1={(h - padY * 2) / 4 * i + padY} y2={(h - padY * 2) / 4 * i + padY} />
            ))}
          </g>
          <polygon points={area} fill="url(#signupArea)" />
          <polyline points={line} fill="none" stroke="#991B1B" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p) => (
            <g key={p.month}>
              <circle cx={p.x} cy={p.y} r="4.5" fill="#fff" stroke="#991B1B" strokeWidth="2" />
              <circle cx={p.x} cy={p.y} r="8" fill="#991B1B" opacity="0.08" />
            </g>
          ))}
        </svg>
        <div className="mt-3 grid grid-cols-6 gap-2">
          {data.map((d) => (
            <div key={d.month} className="text-center">
              <p className="text-[10px] font-medium text-slate-400">{d.month}</p>
              <p className="mt-1 text-xs font-semibold text-slate-800">{d.count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function B2BSplitBars({
  b2b,
  b2c,
  b2bPct,
  b2cPct,
  currency,
}: {
  b2b: number;
  b2c: number;
  b2bPct: number;
  b2cPct: number;
  currency: string;
}) {
  const max = Math.max(b2b, b2c, 1);
  const bars = [
    { label: 'B2B', value: b2b, pct: b2bPct, fill: 'from-[#991B1B] to-[#F87171]' },
    { label: 'B2C', value: b2c, pct: b2cPct, fill: 'from-[#0F766E] to-[#2DD4BF]' },
  ];

  return (
    <div className="grid gap-3 p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-3">
        {bars.map((bar) => (
          <div key={bar.label} className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-slate-100">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{bar.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              {formatCompactMoney(bar.value, currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{bar.pct.toFixed(1)}% of platform revenue</p>
            <div className="mt-4 flex h-28 items-end justify-center gap-2">
              <div className="flex h-full w-full items-end justify-center rounded-2xl bg-white/80 p-2 ring-1 ring-slate-100">
                <div
                  className={`w-full rounded-t-2xl bg-gradient-to-t ${bar.fill} transition-all duration-500`}
                  style={{ height: `${Math.max(18, (bar.value / max) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-slate-100 bg-white/90 p-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Revenue mix</span>
          <span>{b2bPct.toFixed(1)}% / {b2cPct.toFixed(1)}%</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-gradient-to-r from-[#991B1B] to-[#F87171]" style={{ width: `${b2bPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function InFlowList({
  items,
  currency,
}: {
  items: Array<{ serviceKey: string; amount: number; percentage: number }>;
  currency: string;
}) {
  return (
    <div className="space-y-3 p-5 sm:p-6">
      {items.slice(0, 6).map((item, idx) => (
        <div key={item.serviceKey} className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{SERVICE_LABELS[item.serviceKey] || item.serviceKey}</p>
              <p className="text-xs text-slate-500">{formatMoney(item.amount, currency)}</p>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
              #{idx + 1}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(10, item.percentage)}%`,
                background:
                  idx === 0
                    ? 'linear-gradient(90deg, #991B1B, #F87171)'
                    : idx === 1
                      ? 'linear-gradient(90deg, #0F766E, #2DD4BF)'
                      : idx === 2
                        ? 'linear-gradient(90deg, #7C3AED, #C4B5FD)'
                        : 'linear-gradient(90deg, #0369A1, #7DD3FC)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RevenueByServiceDonut({
  data,
  totalRevenue,
  currency,
}: {
  data: Array<{ serviceKey: string; amount: number; percentage: number }>;
  totalRevenue: number;
  currency: string;
}) {
  if (totalRevenue === 0 || data.length === 0) {
    return (
      <EmptyState
        icon={Vault}
        title="No revenue data yet"
        description="Once transactions land, this chart will show the biggest revenue contributors by service."
      />
    );
  }

  const size = 160;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#6366F1', '#0EA5E9', '#A855F7'];

  return (
    <div className="space-y-4 px-5 pb-5 pt-4 sm:px-6">
      <div className="relative mx-auto h-[160px] w-[160px]">
        <svg width={size} height={size} className="-rotate-90">
          {data.slice(0, 7).map((item, idx) => {
            const len = (item.percentage / 100) * c;
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={item.serviceKey}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="transparent"
                stroke={colors[idx % colors.length]}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                className="transition-opacity duration-300 hover:opacity-80"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-base font-semibold tracking-tight text-slate-900">
            {formatCompactMoney(totalRevenue, currency)}
          </p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Total revenue</p>
        </div>
      </div>
      <ul className="space-y-2">
        {data.slice(0, 7).map((item, idx) => (
          <li key={item.serviceKey} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: colors[idx % colors.length] }}
              />
              <span className="truncate">{SERVICE_LABELS[item.serviceKey] || item.serviceKey}</span>
            </span>
            <span className="font-semibold text-slate-800">{item.percentage.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestTypeBadge({ type }: { type: 'webyne_vm' | 'dedicated_server' | 'vm_order' }) {
  const styles =
    type === 'webyne_vm'
      ? 'bg-sky-50 text-sky-700 ring-sky-100'
      : type === 'dedicated_server'
        ? 'bg-violet-50 text-violet-700 ring-violet-100'
        : 'bg-slate-50 text-slate-700 ring-slate-100';

  const label =
    type === 'webyne_vm' ? 'Webyne VM' : type === 'dedicated_server' ? 'Dedicated' : 'VM Order';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${styles}`}>
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
      : status === 'pending'
        ? 'bg-amber-50 text-amber-700 ring-amber-100'
        : status === 'suspended'
          ? 'bg-rose-50 text-rose-700 ring-rose-100'
          : 'bg-slate-50 text-slate-700 ring-slate-100';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${tone}`}>
      {status}
    </span>
  );
}

function SectionLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#B91C1C]/30 hover:bg-rose-50 hover:text-[#991B1B]"
    >
      <Icon className="h-4 w-4 text-slate-400 transition-transform duration-300 group-hover:scale-110 group-hover:text-[#B91C1C]" />
      <span>{label}</span>
      <ExternalLink className="h-3.5 w-3.5 text-slate-300 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-[#B91C1C]" />
    </Link>
  );
}

function loadingView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-9 w-9 animate-spin text-[#B91C1C]" />
        <p className="text-sm text-slate-500">Loading platform overview</p>
      </div>
    </div>
  );
}

export default function SuperAdminOverviewPage() {
  const [data, setData] = useState<SuperAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await fetchSuperAdminOverview();
      setData(overview);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return loadingView();
  }

  if (error && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-[28px] border border-rose-100 bg-white/90 p-8 text-center shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Failed to load overview</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#B91C1C] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#991B1B]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const lastUpdated = formatDateTime(data.generatedAt);
  const statusItems = [
    { key: 'active', label: 'Active', value: data.tenantsByStatus.active },
    { key: 'pending', label: 'Pending', value: data.tenantsByStatus.pending },
    { key: 'suspended', label: 'Suspended', value: data.tenantsByStatus.suspended },
    { key: 'cancelled', label: 'Cancelled', value: data.tenantsByStatus.cancelled },
  ] as const;
  const totalTenantsFromStatus = statusItems.reduce((sum, item) => sum + item.value, 0) || data.totalTenants;
  const pendingRequestCount = data.pendingRequests.length;
  const expiringSoonCount = data.vmsExpiringSoon.length;
  const urgentExpiringCount = data.vmsExpiringSoon.filter((vm) => vm.daysUntilExpiry <= 7).length;
  const requestTypeBreakdown = [
    { key: 'webyne_vm' as const, label: 'Webyne VM', count: data.pendingRequests.filter((req) => req.type === 'webyne_vm').length },
    {
      key: 'dedicated_server' as const,
      label: 'Dedicated',
      count: data.pendingRequests.filter((req) => req.type === 'dedicated_server').length,
    },
    { key: 'vm_order' as const, label: 'VM Order', count: data.pendingRequests.filter((req) => req.type === 'vm_order').length },
  ];
  const recentRequests = data.pendingRequests.slice(0, 5);
  const topRevenueTenants = data.topTenantsByRevenue.slice(0, 6);
  const topResourceTenants = data.topTenantsByResources.slice(0, 6);
  const expiringBuckets = [
    { label: '0-3 days', count: data.vmsExpiringSoon.filter((vm) => vm.daysUntilExpiry <= 3).length, tone: 'from-rose-500 to-rose-300' },
    {
      label: '4-7 days',
      count: data.vmsExpiringSoon.filter((vm) => vm.daysUntilExpiry >= 4 && vm.daysUntilExpiry <= 7).length,
      tone: 'from-amber-500 to-amber-300',
    },
    {
      label: '8-14 days',
      count: data.vmsExpiringSoon.filter((vm) => vm.daysUntilExpiry >= 8).length,
      tone: 'from-slate-700 to-slate-400',
    },
  ];
  const topRevenueService = data.revenueByService[0];
  const topRevenueLabel = topRevenueService
    ? SERVICE_LABELS[topRevenueService.serviceKey] || topRevenueService.serviceKey
    : 'No data';

  return (
    <div className="relative isolate space-y-6 pb-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden">
        <div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-slate-900/10 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-slate-900/5 blur-3xl" />
      </div>

      <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#111827_52%,#0b1324_100%)] text-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-6 sm:p-8 lg:p-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-rose-200">
              Platform Overview
            </p>
            <h1 className="mt-5 max-w-xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Super-admin overview
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Revenue, tenant health, request queues, and expiry risk in one concise command surface.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh snapshot
              </button>
              <Link
                href="/super-admin-console/white-labelling/tenants"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10"
              >
                <Building2 className="h-4 w-4 text-rose-200" />
                Tenants
              </Link>
              <Link
                href="/super-admin-console/webyne-vm-requests"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10"
              >
                <Database className="h-4 w-4 text-cyan-200" />
                Requests
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Revenue this month
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {formatMoney(data.revenueThisMonth, data.currency)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {data.revenueChangePct >= 0 ? 'Up' : 'Down'} {Math.abs(data.revenueChangePct).toFixed(1)}% vs last month
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Pending queue
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {pendingRequestCount.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {data.pendingPaymentOrders.toLocaleString()} payment orders waiting
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Expiry pressure
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {expiringSoonCount.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {urgentExpiringCount} within 7 days
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/5 p-6 sm:p-8 lg:border-l">
            <div className="rounded-[30px] bg-white text-slate-900 shadow-[0_20px_70px_rgba(2,6,23,0.22)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
                    Revenue composition
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-slate-900">Service mix</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  Top 7
                </span>
              </div>
              <RevenueByServiceDonut
                data={data.revenueByService}
                totalRevenue={data.totalPlatformRevenue}
                currency={data.currency}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface title="Revenue architecture" eyebrow="Finance">
          <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[28px] border border-rose-100 bg-[linear-gradient(180deg,rgba(255,247,247,0.95),rgba(255,255,255,1))]">
              <B2BSplitBars
                b2b={data.b2bRevenue}
                b2c={data.b2cRevenue}
                b2bPct={data.b2bPercentage}
                b2cPct={data.b2cPercentage}
                currency={data.currency}
              />
            </div>
            <div className="rounded-[28px] border border-rose-100 bg-[linear-gradient(180deg,rgba(255,247,247,0.95),rgba(255,255,255,1))]">
              <RevenueSparkBars data={data.revenueByService} currency={data.currency} />
            </div>
          </div>
        </Surface>

        <Surface title="Growth pulse" eyebrow="Acquisition">
          <SignupsAreaChart data={data.newTenantSignups} />
        </Surface>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Surface title="Request heat" eyebrow="Operations">
          <div className="space-y-4 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {requestTypeBreakdown.map((item, idx) => {
                const palette =
                  idx === 0
                    ? 'from-sky-500 to-cyan-300'
                    : idx === 1
                      ? 'from-violet-500 to-fuchsia-300'
                      : 'from-amber-500 to-orange-300';
                return (
                  <div key={item.key} className="rounded-[24px] bg-slate-50/80 p-4 ring-1 ring-slate-100">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {item.count.toLocaleString()}
                    </p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${palette}`}
                        style={{ width: `${pendingRequestCount > 0 ? Math.max(8, (item.count / Math.max(pendingRequestCount, 1)) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-[28px] bg-[linear-gradient(135deg,#7F1D1D_0%,#B91C1C_100%)] p-4 text-white shadow-[0_18px_50px_rgba(185,28,28,0.24)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Recent requests
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-white">Queue sample</h3>
                </div>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-rose-100">
                  {recentRequests.length} shown
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {recentRequests.length > 0 ? (
                  recentRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <RequestTypeBadge type={req.type} />
                          <p className="truncate text-sm font-medium text-white">{req.tenantName}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{formatDateTime(req.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">
                          {req.amount ? formatMoney(req.amount, data.currency) : '-'}
                        </p>
                        <p className="text-xs text-slate-400">{req.status}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl bg-white/10 px-4 py-4 text-sm text-rose-100">
                    There are no pending requests in the queue.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Surface>

        <Surface title="Tenant distribution" eyebrow="Portfolio">
          <div className="space-y-4 p-5 sm:p-6">
            {statusItems.map((item, idx) => {
              const percentage = totalTenantsFromStatus > 0 ? (item.value / totalTenantsFromStatus) * 100 : 0;
              const palette =
                idx === 0
                  ? 'from-emerald-500 to-emerald-300'
                  : idx === 1
                    ? 'from-amber-500 to-amber-300'
                    : idx === 2
                      ? 'from-violet-500 to-violet-300'
                      : 'from-rose-500 to-rose-300';
              return (
                <div key={item.key} className="rounded-[26px] bg-slate-50/80 p-4 ring-1 ring-slate-100">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <StatusPill status={item.key} />
                      <span className="text-sm font-medium text-slate-700">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-950">{item.value.toLocaleString()}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${palette} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] bg-[linear-gradient(135deg,#7F1D1D_0%,#B91C1C_100%)] p-4 text-white shadow-[0_18px_50px_rgba(185,28,28,0.24)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Active share
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{data.tenantsByStatus.active.toLocaleString()}</p>
                <p className="mt-1 text-xs text-slate-400">{data.activeTenantsLast30Days.toLocaleString()} active in 30 days</p>
              </div>
              <div className="rounded-[24px] bg-rose-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-500">
                  Expiry urgency
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-rose-700">
                  {urgentExpiringCount.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-rose-600">VMs expire within 7 days</p>
              </div>
            </div>
          </div>
        </Surface>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Surface title="Top tenants by revenue" eyebrow="Ranked">
          <div className="space-y-3 p-5 sm:p-6">
            {topRevenueTenants.length > 0 ? (
              topRevenueTenants.map((tenant, idx) => {
                const maxRevenue = Math.max(...topRevenueTenants.map((t) => t.revenue), 1);
                const width = (tenant.revenue / maxRevenue) * 100;
                return (
                  <div key={tenant.tenantId} className="rounded-[26px] bg-slate-50/80 p-4 ring-1 ring-slate-100">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{tenant.tenantName}</p>
                        <p className="text-xs text-slate-500">{tenant.tenantSlug}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#991B1B] via-[#F87171] to-[#FDBA74]"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{tenant.vmCount} VMs</span>
                      <span className="font-semibold text-slate-900">{formatMoney(tenant.revenue, data.currency)}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={Building2}
                title="No revenue data"
                description="There are no tenants with recorded revenue yet."
              />
            )}
          </div>
        </Surface>

        <Surface title="Capacity leaders" eyebrow="Infrastructure">
          <div className="space-y-3 p-5 sm:p-6">
            {topResourceTenants.length > 0 ? (
              topResourceTenants.map((tenant, idx) => {
                const maxVmCount = Math.max(...topResourceTenants.map((t) => t.vmCount), 1);
                const width = (tenant.vmCount / maxVmCount) * 100;
                return (
                  <div key={tenant.tenantId} className="rounded-[26px] bg-slate-50/80 p-4 ring-1 ring-slate-100">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{tenant.tenantName}</p>
                        <p className="text-xs text-slate-500">{tenant.tenantSlug}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#7F1D1D] via-[#B91C1C] to-[#F87171]"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                      <span>{tenant.vmCount} VMs</span>
                      <span>{tenant.totalVCpu} vCPU</span>
                      <span>{tenant.totalMemoryGb.toFixed(0)} GB RAM</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={Server}
                title="No resource data"
                description="There are no tenant VMs or capacity figures available yet."
              />
            )}
          </div>
        </Surface>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Surface
          title="VMs expiring soon"
          eyebrow="Risk"
          action={<span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">{urgentExpiringCount} within 7 days</span>}
        >
          {data.vmsExpiringSoon.length > 0 ? (
            <div className="space-y-4 p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {expiringBuckets.map((bucket) => (
                  <div key={bucket.label} className="rounded-[24px] bg-slate-50/80 p-4 ring-1 ring-slate-100">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {bucket.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{bucket.count}</p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${bucket.tone}`}
                        style={{
                          width: `${Math.max(12, (bucket.count / Math.max(expiringSoonCount, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {data.vmsExpiringSoon.slice(0, 10).map((vm) => (
                  <div
                    key={vm.vmId}
                    className="flex items-center justify-between gap-3 rounded-[24px] bg-slate-50/80 p-4 ring-1 ring-slate-100 transition-all duration-300 hover:-translate-y-[1px] hover:bg-amber-50/50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-slate-900">{vm.vmName}</p>
                        <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 ring-1 ring-sky-100">
                          {vm.provider}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{vm.tenantName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-950">{vm.daysUntilExpiry} days</p>
                      <p className="text-xs text-slate-500">{formatDateTime(vm.expiryDate)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Clock}
              title="No VMs expiring soon"
              description="Nothing is scheduled to expire in the next 14 days."
            />
          )}
        </Surface>

        <Surface title="Fast lanes" eyebrow="Navigation">
          <div className="grid gap-3 p-5 sm:p-6">
            <SectionLink
              href="/super-admin-console/white-labelling/tenants"
              label="Review tenants"
              icon={Building2}
            />
            <SectionLink
              href="/super-admin-console/webyne-vm-requests"
              label="Triage requests"
              icon={Database}
            />
            <SectionLink
              href="/super-admin-console/vm-host-leases"
              label="Inspect expirations"
              icon={CalendarClock}
            />
          </div>
        </Surface>
      </section>

      <section className="grid gap-3 rounded-[28px] border border-rose-100 bg-white/85 p-5 shadow-[0_10px_40px_rgba(185,28,28,0.06)] sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-rose-50/80 p-4 ring-1 ring-rose-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Revenue trend</p>
          <p className="mt-2 text-sm font-medium text-rose-800">
            {data.revenueChangePct >= 0 ? 'Up' : 'Down'} {Math.abs(data.revenueChangePct).toFixed(1)}% this month
            versus the previous month.
          </p>
        </div>
        <div className="rounded-2xl bg-rose-50/80 p-4 ring-1 ring-rose-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-400">Tenant activity</p>
          <p className="mt-2 text-sm font-medium text-rose-800">
            {data.activeTenantsLast30Days.toLocaleString()} tenants were active in the last 30 days.
          </p>
        </div>
        <div className="rounded-2xl bg-rose-50/80 p-4 ring-1 ring-rose-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-400">Pending work</p>
          <p className="mt-2 text-sm font-medium text-rose-800">
            {data.pendingDedicatedServers.toLocaleString()} dedicated servers and {data.pendingPaymentOrders.toLocaleString()} orders are still waiting.
          </p>
        </div>
        <div className="rounded-2xl bg-rose-50/80 p-4 ring-1 ring-rose-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-400">Top service</p>
          <p className="mt-2 text-sm font-medium text-rose-800">{topRevenueLabel}</p>
          <p className="mt-1 text-xs text-rose-500">
            {formatMoney(data.totalPlatformRevenue, data.currency)} total platform revenue
          </p>
        </div>
      </section>
    </div>
  );
}
