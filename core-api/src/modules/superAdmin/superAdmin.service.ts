import mongoose from 'mongoose';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { WalletTransaction } from '../../models/walletTransaction.model';
import { Wallet } from '../../models/wallet.model';
import { Order } from '../../models/order.model';
import { VM } from '../vm/vm.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { DedicatedServerRequestModel } from '../../models/dedicatedServerRequest.model';
import { ExternalVMModel } from '../external-vm/external-vm.model';
import { User } from '../../models/user.model';
import { isValidObjectId } from '../tenant/tenant.service';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { TenantStatus } from '../../models/tenant.model';

export interface RevenueByService {
  serviceKey: string;
  amount: number;
  percentage: number;
}

export interface TenantSignup {
  month: string;
  count: number;
}

export interface TopTenantByRevenue {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  revenue: number;
  vmCount: number;
}

export interface TopTenantByResources {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  vmCount: number;
  totalVCpu: number;
  totalMemoryGb: number;
  totalDiskGb: number;
}

export interface PendingRequest {
  id: string;
  type: 'webyne_vm' | 'dedicated_server' | 'vm_order';
  tenantName: string;
  status: string;
  amount?: number;
  createdAt: Date;
}

export interface VmExpiringItem {
  vmId: string;
  vmName: string;
  tenantName: string;
  provider: string;
  expiryDate: Date;
  daysUntilExpiry: number;
}

export interface SuperAdminOverview {
  // Existing metrics
  totalTenants: number;
  tenantsByStatus: Record<TenantStatus, number>;
  totalTenantAdmins: number;

  // Revenue metrics
  totalPlatformRevenue: number;
  revenueThisMonth: number;
  revenuePreviousMonth: number;
  revenueChangePct: number;
  revenueByService: RevenueByService[];

  // B2B vs B2C split
  b2bRevenue: number;
  b2cRevenue: number;
  b2bPercentage: number;
  b2cPercentage: number;

  // Outstanding/Pending payments
  pendingPaymentOrders: number;
  pendingPaymentAmount: number;

  // Tenant metrics
  newTenantSignups: TenantSignup[];
  activeTenantsLast30Days: number;

  // Infrastructure metrics
  totalActiveVms: number;
  totalCatalogVmRequests: number;
  totalExternalVms: number;
  totalVmsExpiringSoon: number;

  // Platform users
  managedUsers: number;

  // Pending requests
  pendingDedicatedServers: number;
  pendingRequests: PendingRequest[];

  // Top tenants
  topTenantsByRevenue: TopTenantByRevenue[];
  topTenantsByResources: TopTenantByResources[];

  // VMs expiring soon
  vmsExpiringSoon: VmExpiringItem[];

  // Metadata
  generatedAt: string;
  currency: string;
}

export interface SuperAdminTenantAdminPublic {
  id: string;
  email: string;
  role: 'tenant_admin';
  tenantId: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toTenantAdminPublic(user: {
  _id: mongoose.Types.ObjectId;
  email: string;
  role: 'tenant_admin' | 'tenant_user';
  tenantId: mongoose.Types.ObjectId;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SuperAdminTenantAdminPublic {
  return {
    id: user._id.toString(),
    email: user.email,
    role: 'tenant_admin',
    tenantId: user.tenantId.toString(),
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const EMPTY_STATUS_COUNTS: Record<TenantStatus, number> = {
  pending: 0,
  active: 0,
  suspended: 0,
  cancelled: 0,
};

export class SuperAdminService {
  async getOverview(): Promise<SuperAdminOverview> {
    const now = new Date();
    const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfPreviousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    try {
      // Run all queries in parallel for better performance
      const [
        // Basic tenant metrics
        totalTenants,
        statusGroups,
        totalTenantAdmins,

        // Revenue metrics
        totalRevenue,
        revenueThisMonth,
        revenuePreviousMonth,
        revenueByServiceRaw,

        // B2B vs B2C revenue
        b2bRevenueData,
        b2cRevenueData,

        // Pending payments
        pendingOrders,

        // New tenant signups (last 6 months)
        tenantSignupsRaw,

        // Active tenants (had transactions in last 30 days)
        activeTenantsRaw,

        // Infrastructure
        totalActiveVms,
        totalCatalogVmRequests,
        totalExternalVms,
        vmsExpiringSoonCount,

        // Platform users
        managedUsers,

        // Pending requests
        pendingDedicatedServers,
        pendingWebyneCatalogVms,
        pendingVmOrders,

        // Top tenants by revenue
        topRevenueRaw,

        // Top tenants by resources
        topResourcesRaw,

        // VMs expiring soon with details
        vmsExpiringSoonRaw,
      ] = await Promise.all([
        // Basic tenant metrics
        Tenant.countDocuments(),
        Tenant.aggregate<{ _id: TenantStatus; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        TenantUser.countDocuments({ role: 'tenant_admin' }),

        // Revenue: total platform revenue (all time)
        WalletTransaction.aggregate<{ total: number }>([
          { $match: { type: 'debit' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),

        // Revenue: this month
        WalletTransaction.aggregate<{ total: number }>([
          { $match: { type: 'debit', createdAt: { $gte: startOfThisMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),

        // Revenue: previous month
        WalletTransaction.aggregate<{ total: number }>([
          {
            $match: {
              type: 'debit',
              createdAt: { $gte: startOfPreviousMonth, $lt: startOfThisMonth },
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),

        // Revenue by service
        WalletTransaction.aggregate<{ _id: string | null; total: number }>([
          { $match: { type: 'debit' } },
          { $group: { _id: '$serviceKey', total: { $sum: '$amount' } } },
          { $sort: { total: -1 } },
          { $limit: 10 },
        ]),

        // B2B revenue
        WalletTransaction.aggregate<{ total: number }>([
          { $match: { type: 'debit' } },
          {
            $lookup: {
              from: 'tenants',
              localField: 'tenantId',
              foreignField: '_id',
              as: 'tenant',
            },
          },
          { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'users',
              localField: 'tenant.createdBy',
              foreignField: '_id',
              as: 'creator',
            },
          },
          { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
          { $match: { 'creator.accountType': 'b2b' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),

        // B2C revenue
        WalletTransaction.aggregate<{ total: number }>([
          { $match: { type: 'debit' } },
          {
            $lookup: {
              from: 'tenants',
              localField: 'tenantId',
              foreignField: '_id',
              as: 'tenant',
            },
          },
          { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'users',
              localField: 'tenant.createdBy',
              foreignField: '_id',
              as: 'creator',
            },
          },
          { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
          { $match: { 'creator.accountType': { $in: ['b2c', 'legacy', null] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),

        // Pending payment orders
        Order.aggregate<{ count: number; totalAmount: number }>([
          { $match: { status: 'pending_payment' } },
          { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$calculatedAmount' } } },
        ]),

        // New tenant signups (last 6 months)
        Tenant.aggregate<{ _id: { year: number; month: number }; count: number }>([
          {
            $match: {
              createdAt: {
                $gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)),
              },
            },
          },
          {
            $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]),

        // Active tenants (had wallet activity in last 30 days)
        WalletTransaction.aggregate<{ _id: mongoose.Types.ObjectId }>([
          { $match: { createdAt: { $gte: thirtyDaysAgo } } },
          { $group: { _id: '$tenantId' } },
        ]),

        // Infrastructure: active VMs
        VM.countDocuments({ status: { $nin: ['deleted', 'deleting', 'delete_failed'] } }),

        // Catalog VM requests (pending approval or provisioning)
        CatalogVmModel.countDocuments({
          status: { $in: ['pending_approval', 'approved', 'provisioning', 'fulfilling', 'ready_to_attach'] },
        }),

        // External VMs
        ExternalVMModel.countDocuments(),

        // VMs expiring soon (next 14 days)
        VM.countDocuments({
          status: { $nin: ['deleted', 'deleting', 'delete_failed'] },
          planStatus: 'active',
          planPeriodEnd: { $gte: now, $lte: fourteenDaysFromNow },
        }),

        // Managed users (role: user)
        User.countDocuments({ role: 'user' }),

        // Pending dedicated servers
        DedicatedServerRequestModel.countDocuments({ status: 'provisioning' }),

        // Pending Webyne catalog VMs
        CatalogVmModel.find({
          status: { $in: ['pending_approval', 'approved', 'provisioning'] },
          provider: 'webyne',
        })
          .populate('tenantId', 'name')
          .limit(20)
          .lean(),

        // Pending VM orders
        Order.find({ status: 'pending_payment' })
          .populate('tenantId', 'name')
          .limit(20)
          .lean(),

        // Top 10 tenants by revenue
        WalletTransaction.aggregate<{
          _id: mongoose.Types.ObjectId;
          revenue: number;
          vmCount: number;
        }>([
          { $match: { type: 'debit' } },
          {
            $group: {
              _id: '$tenantId',
              revenue: { $sum: '$amount' },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'vms',
              let: { tenantId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$tenantId', '$$tenantId'] },
                    status: { $nin: ['deleted', 'deleting', 'delete_failed'] },
                  },
                },
                { $count: 'count' },
              ],
              as: 'vmData',
            },
          },
          {
            $addFields: {
              vmCount: { $ifNull: [{ $arrayElemAt: ['$vmData.count', 0] }, 0] },
            },
          },
        ]),

        // Top 10 tenants by resources
        VM.aggregate<{
          _id: mongoose.Types.ObjectId;
          vmCount: number;
          totalVCpu: number;
          totalMemoryGb: number;
          totalDiskGb: number;
        }>([
          { $match: { status: { $nin: ['deleted', 'deleting', 'delete_failed'] } } },
          {
            $group: {
              _id: '$tenantId',
              vmCount: { $sum: 1 },
              totalVCpu: { $sum: '$allocatedCpu' },
              totalMemoryGb: { $sum: '$allocatedMemoryGb' },
              totalDiskGb: { $sum: '$allocatedDiskGb' },
            },
          },
          { $sort: { vmCount: -1 } },
          { $limit: 10 },
        ]),

        // VMs expiring soon with details
        VM.find({
          status: { $nin: ['deleted', 'deleting', 'delete_failed'] },
          planStatus: 'active',
          planPeriodEnd: { $gte: now, $lte: fourteenDaysFromNow },
        })
          .populate('tenantId', 'name')
          .select('_id name tenantId planPeriodEnd')
          .limit(20)
          .lean(),
      ]);

      // Process results with safe defaults
      const tenantsByStatus = { ...EMPTY_STATUS_COUNTS };
      for (const group of statusGroups || []) {
        if (group._id in tenantsByStatus) {
          tenantsByStatus[group._id] = group.count;
        }
      }

      const totalPlatformRevenue = totalRevenue?.[0]?.total ?? 0;
      const revenueThisMonthValue = revenueThisMonth?.[0]?.total ?? 0;
      const revenuePreviousMonthValue = revenuePreviousMonth?.[0]?.total ?? 0;
      const revenueChangePct =
        revenuePreviousMonthValue > 0
          ? Number((((revenueThisMonthValue - revenuePreviousMonthValue) / revenuePreviousMonthValue) * 100).toFixed(1))
          : 0;

      // Revenue by service with percentages
      const revenueByService: RevenueByService[] = (revenueByServiceRaw || []).map((item) => ({
        serviceKey: item?._id || 'unknown',
        amount: item?.total ?? 0,
        percentage: totalPlatformRevenue > 0 ? Number(((item?.total ?? 0) / totalPlatformRevenue * 100).toFixed(1)) : 0,
      }));

      // B2B vs B2C split
      const b2bRevenue = b2bRevenueData?.[0]?.total ?? 0;
      const b2cRevenue = b2cRevenueData?.[0]?.total ?? 0;
      const totalSplitRevenue = b2bRevenue + b2cRevenue || 1;
      const b2bPercentage = Number(((b2bRevenue / totalSplitRevenue) * 100).toFixed(1));
      const b2cPercentage = Number(((b2cRevenue / totalSplitRevenue) * 100).toFixed(1));

      // Pending payments
      const pendingPaymentOrders = pendingOrders?.[0]?.count ?? 0;
      const pendingPaymentAmount = pendingOrders?.[0]?.totalAmount ?? 0;

      // New tenant signups (fill missing months)
      const signupsMap = new Map<string, number>(
        (tenantSignupsRaw || [])
          .map((item) => [`${item?._id?.year}-${item?._id?.month}`, item?.count ?? 0] as [string, number])
          .filter(([key]) => key && key !== 'undefined-undefined')
      );
      const newTenantSignups: TenantSignup[] = [];
      for (let i = 5; i >= 0; i -= 1) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
        const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        newTenantSignups.push({
          month,
          count: signupsMap.get(key) ?? 0,
        });
      }

      // Active tenants
      const activeTenantsLast30Days = activeTenantsRaw?.length ?? 0;

      // Pending requests list
      const pendingRequests: PendingRequest[] = [];

      // Add Webyne VM requests
      if (Array.isArray(pendingWebyneCatalogVms)) {
        for (const vm of pendingWebyneCatalogVms) {
          if (vm && vm._id) {
            pendingRequests.push({
              id: vm._id.toString(),
              type: 'webyne_vm',
              tenantName: (vm.tenantId as any)?.name ?? 'Unknown',
              status: vm.status ?? 'unknown',
              amount: vm.pricingSnapshot?.total,
              createdAt: vm.createdAt,
            });
          }
        }
      }

      // Add VM orders
      if (Array.isArray(pendingVmOrders)) {
        for (const order of pendingVmOrders) {
          if (order && order._id) {
            pendingRequests.push({
              id: order._id.toString(),
              type: 'vm_order',
              tenantName: (order.tenantId as any)?.name ?? 'Unknown',
              status: order.status ?? 'unknown',
              amount: order.calculatedAmount,
              createdAt: order.createdAt,
            });
          }
        }
      }

      // Sort by creation date
      pendingRequests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Top tenants by revenue
      const tenantIds = (topRevenueRaw || [])
        .map((item) => item?._id)
        .filter(Boolean);
      
      const tenants = tenantIds.length > 0 
        ? await Tenant.find({ _id: { $in: tenantIds } }).select('_id name slug').lean()
        : [];
      const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));

      const topTenantsByRevenue: TopTenantByRevenue[] = (topRevenueRaw || [])
        .map((item) => {
          if (!item?._id) return null;
          const tenant = tenantMap.get(item._id.toString());
          if (!tenant) return null;
          return {
            tenantId: item._id.toString(),
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            revenue: item.revenue ?? 0,
            vmCount: item.vmCount ?? 0,
          };
        })
        .filter((item): item is TopTenantByRevenue => item !== null);

      // Top tenants by resources
      const resourceTenantIds = (topResourcesRaw || [])
        .map((item) => item?._id)
        .filter(Boolean);
      
      const resourceTenants = resourceTenantIds.length > 0
        ? await Tenant.find({ _id: { $in: resourceTenantIds } }).select('_id name slug').lean()
        : [];
      const resourceTenantMap = new Map(resourceTenants.map((t) => [t._id.toString(), t]));

      const topTenantsByResources: TopTenantByResources[] = (topResourcesRaw || [])
        .map((item) => {
          if (!item?._id) return null;
          const tenant = resourceTenantMap.get(item._id.toString());
          if (!tenant) return null;
          return {
            tenantId: item._id.toString(),
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            vmCount: item.vmCount ?? 0,
            totalVCpu: item.totalVCpu ?? 0,
            totalMemoryGb: item.totalMemoryGb ?? 0,
            totalDiskGb: item.totalDiskGb ?? 0,
          };
        })
        .filter((item): item is TopTenantByResources => item !== null);

      // VMs expiring soon
      const vmsExpiringSoon: VmExpiringItem[] = (vmsExpiringSoonRaw || [])
        .map((vm) => {
          if (!vm?._id) return null;
          const daysUntilExpiry = vm.planPeriodEnd
            ? Math.ceil((vm.planPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            : 0;
          return {
            vmId: vm._id.toString(),
            vmName: vm.name ?? 'Unknown VM',
            tenantName: (vm.tenantId as any)?.name ?? 'Unknown',
            provider: 'platform', // VMs are from platform (Proxmox)
            expiryDate: vm.planPeriodEnd!,
            daysUntilExpiry,
          };
        })
        .filter((item): item is VmExpiringItem => item !== null);

      // Get first wallet to determine currency
      const sampleWallet = await Wallet.findOne().select('currency').lean();
      const currency = sampleWallet?.currency ?? 'INR';

      console.log('[SuperAdmin Overview] Full metrics loaded', {
        totalTenants,
        totalPlatformRevenue,
        revenueThisMonth: revenueThisMonthValue,
        revenuePreviousMonth: revenuePreviousMonthValue,
        revenueChangePct,
        totalTenantAdmins,
        activeTenantsLast30Days,
        totalActiveVms: totalActiveVms ?? 0,
        totalCatalogVmRequests: totalCatalogVmRequests ?? 0,
        totalExternalVms: totalExternalVms ?? 0,
        managedUsers: managedUsers ?? 0,
        pendingDedicatedServers: pendingDedicatedServers ?? 0,
        pendingRequestsCount: pendingRequests.length,
        topTenantsByRevenueCount: topTenantsByRevenue.length,
        topTenantsByResourcesCount: topTenantsByResources.length,
        vmsExpiringSoonCount: vmsExpiringSoon.length,
        revenueByServiceCount: revenueByService.length,
        newTenantSignupsSum: newTenantSignups.reduce((sum, item) => sum + item.count, 0),
        b2bRevenue,
        b2cRevenue,
        currency,
      });

      return {
        totalTenants: totalTenants ?? 0,
        tenantsByStatus,
        totalTenantAdmins: totalTenantAdmins ?? 0,
        totalPlatformRevenue,
        revenueThisMonth: revenueThisMonthValue,
        revenuePreviousMonth: revenuePreviousMonthValue,
        revenueChangePct,
        revenueByService,
        b2bRevenue,
        b2cRevenue,
        b2bPercentage,
        b2cPercentage,
        pendingPaymentOrders,
        pendingPaymentAmount,
        newTenantSignups,
        activeTenantsLast30Days,
        totalActiveVms: totalActiveVms ?? 0,
        totalCatalogVmRequests: totalCatalogVmRequests ?? 0,
        totalExternalVms: totalExternalVms ?? 0,
        totalVmsExpiringSoon: vmsExpiringSoonCount ?? 0,
        managedUsers: managedUsers ?? 0,
        pendingDedicatedServers: pendingDedicatedServers ?? 0,
        pendingRequests,
        topTenantsByRevenue,
        topTenantsByResources,
        vmsExpiringSoon,
        generatedAt: now.toISOString(),
        currency,
      };

    } catch (error) {
      console.error('[SuperAdmin Overview] Error loading metrics:', error);
      
      // Return safe defaults on error
      const sampleWallet = await Wallet.findOne().select('currency').lean();
      const currency = sampleWallet?.currency ?? 'INR';
      
      return {
        totalTenants: 0,
        tenantsByStatus: { ...EMPTY_STATUS_COUNTS },
        totalTenantAdmins: 0,
        totalPlatformRevenue: 0,
        revenueThisMonth: 0,
        revenuePreviousMonth: 0,
        revenueChangePct: 0,
        revenueByService: [],
        b2bRevenue: 0,
        b2cRevenue: 0,
        b2bPercentage: 0,
        b2cPercentage: 0,
        pendingPaymentOrders: 0,
        pendingPaymentAmount: 0,
        newTenantSignups: [],
        activeTenantsLast30Days: 0,
        totalActiveVms: 0,
        totalCatalogVmRequests: 0,
        totalExternalVms: 0,
        totalVmsExpiringSoon: 0,
        managedUsers: 0,
        pendingDedicatedServers: 0,
        pendingRequests: [],
        topTenantsByRevenue: [],
        topTenantsByResources: [],
        vmsExpiringSoon: [],
        generatedAt: now.toISOString(),
        currency,
      };
    }
  }

  async listTenantAdmins(tenantId: string): Promise<SuperAdminTenantAdminPublic[]> {
    if (!isValidObjectId(tenantId)) {
      throw new NotFoundError('Tenant not found.');
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    const admins = await TenantUser.find({
      tenantId: tenant._id,
      role: 'tenant_admin',
    }).sort({ createdAt: -1 });

    return admins.map(toTenantAdminPublic);
  }

  async setTenantAdminActive(
    tenantId: string,
    tenantUserId: string,
    isActive: boolean
  ): Promise<SuperAdminTenantAdminPublic> {
    if (!isValidObjectId(tenantId) || !isValidObjectId(tenantUserId)) {
      throw new NotFoundError('TENANT_ADMIN_NOT_FOUND');
    }

    const tenantUser = await TenantUser.findOne({
      _id: new mongoose.Types.ObjectId(tenantUserId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      role: 'tenant_admin',
    });

    if (!tenantUser) {
      throw new NotFoundError('TENANT_ADMIN_NOT_FOUND');
    }

    tenantUser.isActive = isActive;
    await tenantUser.save();

    return toTenantAdminPublic(tenantUser);
  }

  async deleteTenantAdmin(tenantId: string, tenantUserId: string): Promise<void> {
    if (!isValidObjectId(tenantId) || !isValidObjectId(tenantUserId)) {
      throw new NotFoundError('TENANT_ADMIN_NOT_FOUND');
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const tenant = await Tenant.findById(tenantObjectId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    const admin = await TenantUser.findOne({
      _id: new mongoose.Types.ObjectId(tenantUserId),
      tenantId: tenantObjectId,
      role: 'tenant_admin',
    });

    if (!admin) {
      throw new NotFoundError('TENANT_ADMIN_NOT_FOUND');
    }

    const adminCount = await TenantUser.countDocuments({
      tenantId: tenantObjectId,
      role: 'tenant_admin',
    });
    if (adminCount <= 1) {
      throw new ForbiddenError('Cannot delete the last tenant admin. Create another admin first.');
    }

    await admin.deleteOne();

    logger.info('[SuperAdmin] Tenant admin deleted', {
      tenantId,
      tenantUserId,
      email: admin.email,
    });
  }
}

export const superAdminService = new SuperAdminService();