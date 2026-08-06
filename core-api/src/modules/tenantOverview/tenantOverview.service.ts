import mongoose from 'mongoose';
import { TenantUser } from '../../models/tenantUser.model';
import { TenantServiceConfig } from '../../models/tenantServiceConfig.model';
import { Wallet } from '../../models/wallet.model';
import { WalletTransaction } from '../../models/walletTransaction.model';
import { Order } from '../../models/order.model';
import { DedicatedServerRequestModel } from '../../models/dedicatedServerRequest.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { VM } from '../vm/vm.model';
import { ExternalVMModel } from '../external-vm/external-vm.model';

const LIVE_VM_STATUSES = { $nin: ['deleted', 'deleting', 'delete_failed'] };
const PENDING_ORDER_STATUSES = ['pending_payment', 'pending_approval', 'provisioning'];
const PENDING_CATALOG_STATUSES = [
  'pending_approval',
  'approved',
  'provisioning',
  'fulfilling',
  'ready_to_attach',
];
const STREAM_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#6366F1', '#0EA5E9', '#A855F7'];

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

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
}

function formatOrdinalDate(d: Date): string {
  const day = d.getUTCDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${day}${suffix} ${month}`;
}

async function sumWalletByType(
  tenantOid: mongoose.Types.ObjectId,
  type: 'credit' | 'debit',
  from: Date,
  to: Date
): Promise<number> {
  const rows = await WalletTransaction.aggregate<{ total: number }>([
    {
      $match: {
        tenantId: tenantOid,
        type,
        createdAt: { $gte: from, $lt: to },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return rows[0]?.total ?? 0;
}

export interface TenantOverviewPayload {
  generatedAt: string;
  lastUpdatedLabel: string;
  periodLabel: string;
  currency: string;
  walletBalance: number;
  spend: {
    value: number;
    previous: number;
    changePct: number;
  };
  activeServices: {
    value: number;
    previous: number;
    changePct: number;
  };
  totalUsers: {
    value: number;
    previous: number;
    changePct: number;
  };
  openRequests: {
    value: number;
    previous: number;
    changePct: number;
  };
  newUsers: Array<{ label: string; value: number }>;
  assignmentSplit: {
    assigned: { count: number; pct: number };
    unassigned: { count: number; pct: number };
  };
  topUsers: Array<{
    name: string;
    email: string;
    resources: number;
    up: boolean;
  }>;
  spendSeries: {
    thisPeriod: number[];
    previousPeriod: number[];
    labels: string[];
  };
  streams: Array<{ name: string; pct: number; amount: number; color: string }>;
  alerts: Array<{ title: string; body: string; href?: string }>;
  goal: {
    target: number;
    current: number;
    pct: number;
    daysLeft: number;
  };
  insights: {
    spendTrend: string;
    userGrowth: string;
    topStream: string;
    openRequests: string;
  };
}

class TenantOverviewService {
  async getOverview(tenantId: string): Promise<TenantOverviewPayload> {
    const tenantOid = new mongoose.Types.ObjectId(String(tenantId));
    const now = new Date();
    const periodMs = 30 * 24 * 60 * 60 * 1000;
    const thisStart = new Date(now.getTime() - periodMs);
    const prevStart = new Date(now.getTime() - periodMs * 2);

    const [
      wallet,
      spendThis,
      spendPrev,
      activeServices,
      usersNow,
      usersPrev,
      usersMonthBuckets,
      liveVmCount,
      assignedVmCount,
      pendingOrders,
      pendingDedicated,
      pendingCatalog,
      expiringPlans,
      suspendedServices,
      topAssignees,
      spendByDayThis,
      spendByDayPrev,
      spendByService,
    ] = await Promise.all([
      Wallet.findOne({ tenantId: tenantOid }).select('balance currency').lean(),
      sumWalletByType(tenantOid, 'debit', thisStart, now),
      sumWalletByType(tenantOid, 'debit', prevStart, thisStart),
      TenantServiceConfig.countDocuments({ tenantId: tenantOid, status: 'active' }),
      TenantUser.countDocuments({ tenantId: tenantOid, isActive: true }),
      TenantUser.countDocuments({
        tenantId: tenantOid,
        isActive: true,
        createdAt: { $lt: thisStart },
      }),
      TenantUser.aggregate<{ _id: { y: number; m: number }; count: number }>([
        {
          $match: {
            tenantId: tenantOid,
            createdAt: { $gte: addMonths(startOfMonth(now), -5) },
          },
        },
        {
          $group: {
            _id: {
              y: { $year: '$createdAt' },
              m: { $month: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      VM.countDocuments({ tenantId: tenantOid, status: LIVE_VM_STATUSES }),
      VM.countDocuments({
        tenantId: tenantOid,
        status: LIVE_VM_STATUSES,
        assignedTenantUserId: { $ne: null },
      }),
      Order.countDocuments({
        tenantId: tenantOid,
        status: { $in: PENDING_ORDER_STATUSES },
      }),
      DedicatedServerRequestModel.countDocuments({
        tenantId: tenantOid,
        status: 'provisioning',
      }),
      CatalogVmModel.countDocuments({
        tenantId: tenantOid,
        status: { $in: PENDING_CATALOG_STATUSES },
      }),
      VM.countDocuments({
        tenantId: tenantOid,
        status: LIVE_VM_STATUSES,
        planStatus: 'active',
        planPeriodEnd: {
          $gte: now,
          $lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        },
      }),
      TenantServiceConfig.countDocuments({ tenantId: tenantOid, status: 'suspended' }),
      VM.aggregate<{ _id: mongoose.Types.ObjectId; resources: number }>([
        {
          $match: {
            tenantId: tenantOid,
            status: LIVE_VM_STATUSES,
            assignedTenantUserId: { $ne: null },
          },
        },
        { $group: { _id: '$assignedTenantUserId', resources: { $sum: 1 } } },
        { $sort: { resources: -1 } },
        { $limit: 5 },
      ]),
      WalletTransaction.aggregate<{ _id: string; total: number }>([
        {
          $match: {
            tenantId: tenantOid,
            type: 'debit',
            createdAt: { $gte: thisStart, $lt: now },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      WalletTransaction.aggregate<{ _id: string; total: number }>([
        {
          $match: {
            tenantId: tenantOid,
            type: 'debit',
            createdAt: { $gte: prevStart, $lt: thisStart },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      WalletTransaction.aggregate<{ _id: string | null; total: number }>([
        {
          $match: {
            tenantId: tenantOid,
            type: 'debit',
            createdAt: { $gte: thisStart, $lt: now },
          },
        },
        { $group: { _id: '$serviceKey', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    // Fill empty months for new-users chart
    const monthMap = new Map<string, number>(
      usersMonthBuckets.map((b) => [`${b._id.y}-${b._id.m}`, b.count])
    );
    const newUsers: Array<{ label: string; value: number }> = [];
    for (let i = 5; i >= 0; i -= 1) {
      const m = addMonths(startOfMonth(now), -i);
      const key = `${m.getUTCFullYear()}-${m.getUTCMonth() + 1}`;
      newUsers.push({ label: monthLabel(m), value: monthMap.get(key) ?? 0 });
    }

    const unassignedVmCount = Math.max(0, liveVmCount - assignedVmCount);
    const assignmentTotal = liveVmCount || 1;
    const assignedPct = Number(((assignedVmCount / assignmentTotal) * 100).toFixed(1));
    const unassignedPct = Number((100 - assignedPct).toFixed(1));

    // Top users by assigned VM count
    const assigneeIds = topAssignees.map((a) => a._id).filter(Boolean);
    const assigneeUsers = assigneeIds.length
      ? await TenantUser.find({ _id: { $in: assigneeIds }, tenantId: tenantOid })
          .select('email')
          .lean()
      : [];
    const emailById = new Map(assigneeUsers.map((u) => [u._id.toString(), u.email]));
    const topUsers = topAssignees.map((a) => {
      const email = emailById.get(a._id.toString()) ?? 'Unknown user';
      return {
        name: email.split('@')[0] || email,
        email,
        resources: a.resources,
        up: true,
      };
    });

    // Daily spend series (12 buckets across the 30-day window)
    const bucketCount = 12;
    const bucketMs = periodMs / bucketCount;
    const toBuckets = (
      rows: Array<{ _id: string; total: number }>,
      windowStart: Date
    ): number[] => {
      const byDay = new Map(rows.map((r) => [r._id, r.total]));
      const out: number[] = Array.from({ length: bucketCount }, () => 0);
      for (let i = 0; i < bucketCount; i += 1) {
        const bucketStart = new Date(windowStart.getTime() + i * bucketMs);
        const bucketEnd = new Date(windowStart.getTime() + (i + 1) * bucketMs);
        let sum = 0;
        for (const [day, total] of byDay) {
          const t = Date.parse(`${day}T00:00:00.000Z`);
          if (t >= bucketStart.getTime() && t < bucketEnd.getTime()) sum += total;
        }
        out[i] = Number(sum.toFixed(2));
      }
      return out;
    };

    const thisPeriodSeries = toBuckets(spendByDayThis, thisStart);
    const previousPeriodSeries = toBuckets(spendByDayPrev, prevStart);
    const labels = Array.from({ length: bucketCount }, (_, i) => String(i * 2 + 1));

    // Spend streams by serviceKey
    const streamTotal = spendByService.reduce((s, r) => s + r.total, 0) || 0;
    let streams = spendByService
      .filter((r) => r.total > 0)
      .slice(0, 5)
      .map((r, i) => {
        const key = r._id || 'unknown';
        return {
          name: SERVICE_LABELS[key] ?? key,
          amount: Number(r.total.toFixed(2)),
          pct: streamTotal
            ? Number(((r.total / streamTotal) * 100).toFixed(1))
            : 0,
          color: STREAM_COLORS[i % STREAM_COLORS.length],
        };
      });

    // If no wallet spend yet, fall back to live resource mix so the donut isn't empty.
    if (streams.length === 0) {
      const [elasticCount, catalogActive, dedicatedActive] = await Promise.all([
        ExternalVMModel.countDocuments({ tenantId: tenantOid }),
        CatalogVmModel.countDocuments({ tenantId: tenantOid, status: 'active' }),
        DedicatedServerRequestModel.countDocuments({ tenantId: tenantOid, status: 'active' }),
      ]);
      const mix = [
        { name: 'VPS Hosting', count: liveVmCount },
        { name: 'VM Catalog', count: catalogActive },
        { name: 'Dedicated Servers', count: dedicatedActive },
        { name: 'Elastic Servers', count: elasticCount },
      ].filter((x) => x.count > 0);
      const mixTotal = mix.reduce((s, x) => s + x.count, 0) || 1;
      streams = mix.map((x, i) => ({
        name: x.name,
        amount: x.count,
        pct: Number(((x.count / mixTotal) * 100).toFixed(1)),
        color: STREAM_COLORS[i % STREAM_COLORS.length],
      }));
    }

    const openRequests = pendingOrders + pendingDedicated + pendingCatalog;
    const alerts: TenantOverviewPayload['alerts'] = [];
    if (expiringPlans > 0) {
      alerts.push({
        title: 'Plan renewals',
        body: `${expiringPlans} VM plan${expiringPlans === 1 ? '' : 's'} expire within 14 days.`,
        href: '/console/dashboard/admin/billing',
      });
    }
    if (openRequests > 0) {
      alerts.push({
        title: 'Pending requests',
        body: `${openRequests} order or provisioning request${openRequests === 1 ? '' : 's'} need attention.`,
        href: '/console/dashboard',
      });
    }
    const balance = wallet?.balance ?? 0;
    if (balance > 0 && balance < 1000) {
      alerts.push({
        title: 'Low wallet balance',
        body: `Wallet balance is ${balance.toFixed(2)} ${wallet?.currency ?? 'INR'}. Consider topping up.`,
        href: '/console/dashboard/admin/billing',
      });
    }
    if (suspendedServices > 0) {
      alerts.push({
        title: 'Suspended services',
        body: `${suspendedServices} service${suspendedServices === 1 ? '' : 's'} are suspended for this tenant.`,
      });
    }
    if (alerts.length === 0) {
      alerts.push({
        title: 'All clear',
        body: 'No urgent items right now. Resource usage looks healthy.',
      });
    }

    // Soft monthly spend goal: max(spend*1.2, previous*1.1, 1000)
    const goalTarget = Math.max(spendThis * 1.2, spendPrev * 1.1, 1000);
    const goalPct = Math.min(100, Math.round((spendThis / goalTarget) * 100));
    const daysLeft = Math.max(
      1,
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate() -
        now.getUTCDate()
    );

    const spendChange = pctChange(spendThis, spendPrev);
    const userChange = pctChange(usersNow, usersPrev);
    const topStream = streams[0];

    return {
      generatedAt: now.toISOString(),
      lastUpdatedLabel: formatOrdinalDate(now),
      periodLabel: 'vs previous 30 days',
      currency: wallet?.currency ?? 'INR',
      walletBalance: balance,
      spend: {
        value: Number(spendThis.toFixed(2)),
        previous: Number(spendPrev.toFixed(2)),
        changePct: spendChange,
      },
      activeServices: {
        value: activeServices,
        previous: activeServices,
        changePct: 0,
      },
      totalUsers: {
        value: usersNow,
        previous: usersPrev,
        changePct: userChange,
      },
      openRequests: {
        value: openRequests,
        previous: openRequests,
        changePct: 0,
      },
      newUsers,
      assignmentSplit: {
        assigned: { count: assignedVmCount, pct: liveVmCount ? assignedPct : 0 },
        unassigned: { count: unassignedVmCount, pct: liveVmCount ? unassignedPct : 0 },
      },
      topUsers,
      spendSeries: {
        thisPeriod: thisPeriodSeries,
        previousPeriod: previousPeriodSeries,
        labels,
      },
      streams,
      alerts: alerts.slice(0, 4),
      goal: {
        target: Number(goalTarget.toFixed(2)),
        current: Number(spendThis.toFixed(2)),
        pct: goalPct,
        daysLeft,
      },
      insights: {
        spendTrend: `Spend is ${spendChange >= 0 ? 'up' : 'down'} ${Math.abs(spendChange)}% versus the previous 30 days.`,
        userGrowth: `Active users changed by ${userChange}% in the same window.`,
        topStream: topStream
          ? `${topStream.name} contributes ${topStream.pct}% of service activity.`
          : 'No service activity recorded yet.',
        openRequests: `${openRequests} request${openRequests === 1 ? '' : 's'} currently open.`,
      },
    };
  }
}

export const tenantOverviewService = new TenantOverviewService();
