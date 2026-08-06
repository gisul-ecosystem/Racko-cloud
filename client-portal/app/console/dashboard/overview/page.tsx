'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Clock3,
  Link2,
  Loader2,
  Server,
  Ticket,
  Users,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { fetchTenantOverview, type TenantOverviewPayload } from '@/lib/tenantOverviewApi';
import { TENANT_CONSOLE, tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { hexToRgba } from '@/lib/tenantAccentStyles';

function formatMoney(n: number, currency: string): string {
  try {
    return n.toLocaleString('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${currency || 'INR'} ${n.toFixed(2)}`;
  }
}

function formatCompactMoney(n: number, currency: string): string {
  if (n >= 1000) return `${currency === 'INR' ? '₹' : '$'}${(n / 1000).toFixed(2)}K`;
  return formatMoney(n, currency);
}

function TrendBadge({
  changePct,
  periodLabel,
}: {
  changePct: number;
  periodLabel: string;
}) {
  const up = changePct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
      }`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(changePct).toFixed(1)}% {periodLabel}
    </span>
  );
}

function KpiCard({
  title,
  value,
  changePct,
  periodLabel,
  icon: Icon,
  iconWrap,
}: {
  title: string;
  value: string;
  changePct: number;
  periodLabel: string;
  icon: typeof Banknote;
  iconWrap: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
          <div className="mt-3">
            <TrendBadge changePct={changePct} periodLabel={periodLabel} />
          </div>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconWrap}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function NewUsersChart({
  data,
  accentColor,
}: {
  data: TenantOverviewPayload['newUsers'];
  accentColor: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-44 items-end gap-3 px-1 pt-4">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full max-w-[36px] rounded-t-md"
            style={{
              height: `${Math.max(12, (d.value / max) * 100)}%`,
              background: `linear-gradient(to top, ${accentColor}, ${hexToRgba(accentColor, 0.45)})`,
            }}
            title={`${d.value}`}
          />
          <span className="text-[11px] text-gray-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function SpendLineChart({
  series,
  accentColor,
}: {
  series: TenantOverviewPayload['spendSeries'];
  accentColor: string;
}) {
  const w = 560;
  const h = 180;
  const pad = 12;
  const all = [...series.thisPeriod, ...series.previousPeriod];
  const min = Math.min(...all, 0) * 0.9;
  const max = Math.max(...all, 1) * 1.05;

  const toPoints = (values: number[]) =>
    values
      .map((v, i) => {
        const x = pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full" role="img" aria-label="Spend overview">
      <polyline
        fill="none"
        stroke="#D1D5DB"
        strokeWidth="2"
        strokeDasharray="5 5"
        points={toPoints(series.previousPeriod)}
      />
      <polyline
        fill="none"
        stroke={accentColor}
        strokeWidth="2.5"
        points={toPoints(series.thisPeriod)}
      />
    </svg>
  );
}

function DonutChart({
  streams,
  centerLabel,
  centerSub,
}: {
  streams: TenantOverviewPayload['streams'];
  centerLabel: string;
  centerSub: string;
}) {
  const size = 180;
  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const safe = streams.length > 0 ? streams : [{ name: 'None', pct: 100, amount: 0, color: '#E5E7EB' }];

  return (
    <div className="relative mx-auto h-[180px] w-[180px]">
      <svg width={size} height={size} className="-rotate-90">
        {safe.map((s) => {
          const len = (s.pct / 100) * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={s.name}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="transparent"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-lg font-semibold text-gray-900">{centerLabel}</p>
        <p className="text-[11px] text-gray-400">{centerSub}</p>
      </div>
    </div>
  );
}

export default function TenantOverviewPage() {
  const router = useRouter();
  const { accentColor } = useTenantBranding();
  const { loading: rbacLoading, isTenantAdmin, hasPermission, isConsoleStaff } = useTenantRbac();
  const [data, setData] = useState<TenantOverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canView = isTenantAdmin || hasPermission('overview.read');

  useEffect(() => {
    if (rbacLoading) return;
    if (!isConsoleStaff) {
      router.replace(tenantVps.vms);
      return;
    }
    if (!canView) {
      router.replace(TENANT_CONSOLE);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchTenantOverview()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load overview.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rbacLoading, canView, isConsoleStaff, router]);

  if (rbacLoading || loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error ?? 'Overview unavailable.'}
      </div>
    );
  }

  const currency = data.currency;
  const goalWidth = `${data.goal.pct}%`;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated on {data.lastUpdatedLabel}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Spend (30 days)"
          value={formatMoney(data.spend.value, currency)}
          changePct={data.spend.changePct}
          periodLabel={data.periodLabel}
          icon={Banknote}
          iconWrap="bg-blue-50 text-blue-600"
        />
        <KpiCard
          title="Active Services"
          value={data.activeServices.value.toLocaleString()}
          changePct={data.activeServices.changePct}
          periodLabel={data.periodLabel}
          icon={Server}
          iconWrap="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="Active Users"
          value={data.totalUsers.value.toLocaleString()}
          changePct={data.totalUsers.changePct}
          periodLabel={data.periodLabel}
          icon={Users}
          iconWrap="bg-violet-50 text-violet-600"
        />
        <KpiCard
          title="Open Requests"
          value={String(data.openRequests.value)}
          changePct={data.openRequests.changePct}
          periodLabel={data.periodLabel}
          icon={Ticket}
          iconWrap="bg-red-50 text-red-600"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">New Users (Monthly)</h2>
            <span className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-500">
              Last 6 Months
            </span>
          </div>
          <NewUsersChart data={data.newUsers} accentColor={accentColor} />
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Assigned vs Unassigned VMs</h2>
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500">Assigned</p>
                <p className="text-sm font-semibold text-gray-900">
                  {data.assignmentSplit.assigned.count}
                </p>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                {data.assignmentSplit.assigned.pct}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500">Unassigned</p>
                <p className="text-sm font-semibold text-gray-900">
                  {data.assignmentSplit.unassigned.count}
                </p>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                {data.assignmentSplit.unassigned.pct}%
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
              <div
                style={{
                  width: `${data.assignmentSplit.assigned.pct}%`,
                  backgroundColor: accentColor,
                }}
              />
              <div
                style={{
                  width: `${data.assignmentSplit.unassigned.pct}%`,
                  backgroundColor: hexToRgba(accentColor, 0.35),
                }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Top Users by Resources</h2>
            <Link
              href={tenantVps.users}
              className="text-xs font-medium"
              style={{ color: accentColor }}
            >
              View all
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto">
            {data.topUsers.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No assigned resources yet.</p>
            ) : (
              <table className="w-full min-w-[280px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Resources</th>
                    <th className="pb-2 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.topUsers.map((u) => (
                    <tr key={u.email}>
                      <td className="py-2.5 font-medium text-gray-800">
                        <div>{u.name}</div>
                        <div className="text-[11px] font-normal text-gray-400">{u.email}</div>
                      </td>
                      <td className="py-2.5 text-gray-600">{u.resources}</td>
                      <td className="py-2.5">
                        {u.up ? (
                          <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Spend Overview</h2>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4" style={{ backgroundColor: accentColor }} /> This Period
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t border-dashed border-gray-400" /> Previous Period
              </span>
            </div>
          </div>
          <SpendLineChart series={data.spendSeries} accentColor={accentColor} />
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">This Period</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-gray-900">
                  {formatMoney(data.spend.value, currency)}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    data.spend.changePct >= 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-600'
                  }`}
                >
                  {data.spend.changePct >= 0 ? '+' : ''}
                  {data.spend.changePct}%
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">Previous Period</p>
              <p className="mt-1 text-base font-semibold text-gray-900">
                {formatMoney(data.spend.previous, currency)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900">Activity By Service</h2>
          <div className="mt-4">
            <DonutChart
              streams={data.streams}
              centerLabel={formatCompactMoney(data.spend.value, currency)}
              centerSub="Period spend"
            />
          </div>
          <ul className="mt-4 space-y-2">
            {data.streams.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-2 text-gray-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="font-medium text-gray-800">{s.pct}%</span>
              </li>
            ))}
          </ul>
          <Link
            href={TENANT_CONSOLE}
            className="mt-4 block text-center text-xs font-medium"
            style={{ color: accentColor }}
          >
            View all services
          </Link>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Needs Your Attention</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.alerts.map((a) => (
            <div
              key={a.title}
              className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm"
            >
              <p className="text-sm font-semibold text-gray-900">{a.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{a.body}</p>
              {a.href ? (
                <Link
                  href={a.href}
                  className="mt-3 inline-block text-xs font-medium"
                  style={{ color: accentColor }}
                >
                  View Details
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Spend Pace</h2>
            <p className="mt-1 text-xs text-gray-500">
              Soft 30-day target · {formatMoney(data.goal.target, currency)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Clock3 className="h-3.5 w-3.5" />
            {data.goal.daysLeft} days left in month
          </span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: goalWidth }} />
        </div>
        <p className="mt-2 text-sm text-gray-700">
          {formatMoney(data.goal.current, currency)}{' '}
          <span className="text-gray-400">({data.goal.pct}%)</span>
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Wallet balance: {formatMoney(data.walletBalance, currency)}
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-xs text-gray-600 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        <p>
          <span className="font-semibold text-gray-800">Spend trend: </span>
          {data.insights.spendTrend}
        </p>
        <p>
          <span className="font-semibold text-gray-800">User growth: </span>
          {data.insights.userGrowth}
        </p>
        <p>
          <span className="font-semibold text-gray-800">Top contributor: </span>
          {data.insights.topStream}
        </p>
        <p className="inline-flex items-start gap-1.5">
          <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>
            <span className="font-semibold text-gray-800">Requests: </span>
            {data.insights.openRequests}
          </span>
        </p>
      </div>

      <div className="flex justify-end">
        <Link
          href={tenantConsole.hub}
          className="text-sm font-medium"
          style={{ color: accentColor }}
        >
          Go to all services →
        </Link>
      </div>
    </div>
  );
}
