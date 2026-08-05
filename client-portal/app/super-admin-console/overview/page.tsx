'use client';

import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Clock3,
  Link2,
  Server,
  Ticket,
  Users,
} from 'lucide-react';

/** Placeholder metrics until live aggregation APIs exist. */
const MOCK = {
  lastUpdated: '23rd May',
  periodLabel: 'vs Apr 12 - May 11, 2025',
  revenue: { value: 128430.5, changePct: 12.6, previous: 114050.3 },
  activeServices: { value: 1248, changePct: 18.7 },
  totalClients: { value: 2340, changePct: 8.3 },
  openTickets: { value: 32, changePct: -5.6 },
  newCustomers: [
    { label: 'Dec', value: 42 },
    { label: 'Jan', value: 58 },
    { label: 'Feb', value: 51 },
    { label: 'Mar', value: 73 },
    { label: 'Apr', value: 66 },
    { label: 'May', value: 88 },
  ],
  b2b: { amount: 103450.8, pct: 80.6 },
  b2c: { amount: 24979.7, pct: 19.4 },
  topClients: [
    { name: 'NexaCloud Inc.', revenue: 28450, services: 42, up: true },
    { name: 'Orbit Systems', revenue: 22100, services: 31, up: true },
    { name: 'Pulse Digital', revenue: 18750, services: 28, up: false },
    { name: 'Vertex Labs', revenue: 15420, services: 19, up: true },
    { name: 'Horizon Media', revenue: 12890, services: 15, up: false },
  ],
  revenueSeries: {
    thisPeriod: [72, 78, 74, 86, 91, 88, 95, 102, 98, 110, 118, 128],
    previousPeriod: [68, 70, 73, 75, 80, 82, 84, 88, 90, 94, 100, 108],
    labels: ['1', '3', '5', '7', '9', '11', '13', '15', '17', '19', '21', '23'],
  },
  streams: [
    { name: 'VPS Hosting', pct: 32, color: '#EF4444' },
    { name: 'Dedicated Servers', pct: 21, color: '#F97316' },
    { name: 'Cloud Services', pct: 16, color: '#EAB308' },
    { name: 'Elastic Servers', pct: 12, color: '#22C55E' },
    { name: 'Others', pct: 19, color: '#6366F1' },
  ],
  alerts: [
    {
      title: 'Contract Renewal',
      body: 'TechNova Solutions contract expires in 12 days.',
    },
    {
      title: 'High Ticket Volume',
      body: '3 high priority tickets require attention.',
    },
    {
      title: 'Revenue Share',
      body: 'Top 2 clients contribute 37% of total revenue.',
    },
    {
      title: 'Revenue Target',
      body: "You are 84% towards this month's target.",
    },
  ],
  goal: { target: 152000, current: 128430, pct: 84, daysLeft: 23 },
};

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}K`;
  return formatMoney(n);
}

function TrendBadge({ changePct, periodLabel }: { changePct: number; periodLabel: string }) {
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

function NewCustomersChart() {
  const max = Math.max(...MOCK.newCustomers.map((d) => d.value));
  return (
    <div className="flex h-44 items-end gap-3 px-1 pt-4">
      {MOCK.newCustomers.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full max-w-[36px] rounded-t-md bg-gradient-to-t from-[#B91C1C] to-[#F87171]"
            style={{ height: `${Math.max(12, (d.value / max) * 100)}%` }}
            title={`${d.value}`}
          />
          <span className="text-[11px] text-gray-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function RevenueLineChart() {
  const w = 560;
  const h = 180;
  const pad = 12;
  const series = MOCK.revenueSeries;
  const all = [...series.thisPeriod, ...series.previousPeriod];
  const min = Math.min(...all) * 0.9;
  const max = Math.max(...all) * 1.05;

  const toPoints = (values: number[]) =>
    values
      .map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full" role="img" aria-label="Revenue overview">
      <polyline
        fill="none"
        stroke="#D1D5DB"
        strokeWidth="2"
        strokeDasharray="5 5"
        points={toPoints(series.previousPeriod)}
      />
      <polyline
        fill="none"
        stroke="#B91C1C"
        strokeWidth="2.5"
        points={toPoints(series.thisPeriod)}
      />
    </svg>
  );
}

function DonutChart() {
  const size = 180;
  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative mx-auto h-[180px] w-[180px]">
      <svg width={size} height={size} className="-rotate-90">
        {MOCK.streams.map((s) => {
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
        <p className="text-lg font-semibold text-gray-900">{formatCompactMoney(MOCK.revenue.value)}</p>
        <p className="text-[11px] text-gray-400">Total Revenue</p>
      </div>
    </div>
  );
}

export default function SuperAdminOverviewPage() {
  const goalWidth = `${MOCK.goal.pct}%`;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated on {MOCK.lastUpdated}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Revenue"
          value={formatMoney(MOCK.revenue.value)}
          changePct={MOCK.revenue.changePct}
          periodLabel={MOCK.periodLabel}
          icon={Banknote}
          iconWrap="bg-blue-50 text-blue-600"
        />
        <KpiCard
          title="Active Services"
          value={MOCK.activeServices.value.toLocaleString()}
          changePct={MOCK.activeServices.changePct}
          periodLabel={MOCK.periodLabel}
          icon={Server}
          iconWrap="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="Total Clients"
          value={MOCK.totalClients.value.toLocaleString()}
          changePct={MOCK.totalClients.changePct}
          periodLabel={MOCK.periodLabel}
          icon={Users}
          iconWrap="bg-violet-50 text-violet-600"
        />
        <KpiCard
          title="Open Tickets"
          value={String(MOCK.openTickets.value)}
          changePct={MOCK.openTickets.changePct}
          periodLabel={MOCK.periodLabel}
          icon={Ticket}
          iconWrap="bg-red-50 text-red-600"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">New Customers (Monthly)</h2>
            <span className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-500">
              Last 6 Months
            </span>
          </div>
          <NewCustomersChart />
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">B2B vs B2C Revenue</h2>
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500">B2B</p>
                <p className="text-sm font-semibold text-gray-900">{formatMoney(MOCK.b2b.amount)}</p>
              </div>
              <span className="text-sm font-semibold text-gray-700">{MOCK.b2b.pct}%</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500">B2C</p>
                <p className="text-sm font-semibold text-gray-900">{formatMoney(MOCK.b2c.amount)}</p>
              </div>
              <span className="text-sm font-semibold text-gray-700">{MOCK.b2c.pct}%</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
              <div className="bg-[#B91C1C]" style={{ width: `${MOCK.b2b.pct}%` }} />
              <div className="bg-[#FCA5A5]" style={{ width: `${MOCK.b2c.pct}%` }} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Top 5 Clients by Revenue</h2>
            <span className="text-xs font-medium text-[#B91C1C]">View all</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="pb-2 font-medium">Client</th>
                  <th className="pb-2 font-medium">Revenue</th>
                  <th className="pb-2 font-medium">Services</th>
                  <th className="pb-2 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {MOCK.topClients.map((c) => (
                  <tr key={c.name}>
                    <td className="py-2.5 font-medium text-gray-800">{c.name}</td>
                    <td className="py-2.5 text-gray-600">{formatMoney(c.revenue)}</td>
                    <td className="py-2.5 text-gray-600">{c.services}</td>
                    <td className="py-2.5">
                      {c.up ? (
                        <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Revenue Overview</h2>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 bg-[#B91C1C]" /> This Period
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t border-dashed border-gray-400" /> Previous Period
              </span>
              <span className="rounded-md border border-gray-200 px-2 py-1">Daily</span>
            </div>
          </div>
          <RevenueLineChart />
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">This Period</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-gray-900">
                  {formatMoney(MOCK.revenue.value)}
                </p>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  +{MOCK.revenue.changePct}%
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">Previous Period</p>
              <p className="mt-1 text-base font-semibold text-gray-900">
                {formatMoney(MOCK.revenue.previous)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900">Revenue Stream By Service</h2>
          <div className="mt-4">
            <DonutChart />
          </div>
          <ul className="mt-4 space-y-2">
            {MOCK.streams.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-2 text-gray-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="font-medium text-gray-800">{s.pct}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-xs font-medium text-[#B91C1C]">View all services</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Needs Your Attention</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MOCK.alerts.map((a) => (
            <div
              key={a.title}
              className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm"
            >
              <p className="text-sm font-semibold text-gray-900">{a.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{a.body}</p>
              <button type="button" className="mt-3 text-xs font-medium text-[#B91C1C]">
                View Details
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Goal Progress</h2>
            <p className="mt-1 text-xs text-gray-500">
              Monthly Revenue Target · {formatMoney(MOCK.goal.target)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Clock3 className="h-3.5 w-3.5" />
            {MOCK.goal.daysLeft} days left
          </span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: goalWidth }} />
        </div>
        <p className="mt-2 text-sm text-gray-700">
          {formatMoney(MOCK.goal.current)}{' '}
          <span className="text-gray-400">({MOCK.goal.pct}%)</span>
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-xs text-gray-600 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        <p>
          <span className="font-semibold text-gray-800">Revenue trend: </span>
          Revenue is up {MOCK.revenue.changePct}% versus the previous period.
        </p>
        <p>
          <span className="font-semibold text-gray-800">Client growth: </span>
          Total clients increased by {MOCK.totalClients.changePct}% in the same window.
        </p>
        <p>
          <span className="font-semibold text-gray-800">Top contributor: </span>
          VPS Hosting contributes {MOCK.streams[0].pct}% of service revenue.
        </p>
        <p className="inline-flex items-start gap-1.5">
          <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>
            <span className="font-semibold text-gray-800">Ticket status: </span>
            {MOCK.openTickets.value} tickets are currently open.
          </span>
        </p>
      </div>
    </div>
  );
}
