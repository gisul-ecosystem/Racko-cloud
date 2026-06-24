import mongoose from 'mongoose';
import type { BillingPeriod } from '../../models/order.model';
import { Order } from '../../models/order.model';
import { VM, type IVM } from '../vm/vm.model';
import { WalletTransaction } from '../../models/walletTransaction.model';
import { walletService } from '../wallet/wallet.service';
import { vmService } from '../vm/vm.service';
import { computePeriodEndDate } from '../order/orderPlanProvisioning.service';
import { calculateVmPlanPeriodAmount } from './planPricing';
import { AppError, NotFoundError } from '../../utils/errors';
import type { IOrderSpecs } from '../../models/order.model';

function vmSpecs(vm: IVM): IOrderSpecs {
  return {
    cpuCores: vm.allocatedCpu,
    memoryGb: vm.allocatedMemoryGb,
    diskGb: vm.allocatedDiskGb,
  };
}

async function resolveBillingPeriod(vm: IVM): Promise<BillingPeriod> {
  if (vm.billingPeriod) {
    return vm.billingPeriod;
  }
  if (vm.orderId) {
    const order = await Order.findById(vm.orderId).select('billingPeriod').lean();
    if (order?.billingPeriod) {
      return order.billingPeriod;
    }
  }
  return 'monthly';
}

async function loadTenantVm(
  tenantId: string,
  vmId: string
): Promise<IVM> {
  if (!mongoose.Types.ObjectId.isValid(vmId)) {
    throw new NotFoundError('VM not found.');
  }

  const vm = await VM.findOne({
    _id: new mongoose.Types.ObjectId(vmId),
    tenantId: new mongoose.Types.ObjectId(tenantId),
    planStatus: { $in: ['active', 'expired'] },
    status: { $nin: ['deleted', 'delete_failed', 'deleting'] },
  });

  if (!vm || !vm.planPeriodEnd) {
    throw new NotFoundError('VM not found or not on a tenant plan.');
  }

  return vm;
}

async function syncOrderPeriodEnd(orderId: mongoose.Types.ObjectId): Promise<void> {
  const vms = await VM.find({ orderId, planPeriodEnd: { $ne: null } })
    .select('planPeriodEnd')
    .lean();

  if (vms.length === 0) {
    return;
  }

  const maxEnd = new Date(
    Math.max(...vms.map((v) => (v.planPeriodEnd ? v.planPeriodEnd.getTime() : 0)))
  );

  await Order.updateOne({ _id: orderId }, { $set: { periodEndDate: maxEnd } });
}

function toPlanPublic(vm: IVM, renewalAmount: number, billingPeriod: BillingPeriod) {
  return {
    vmId: vm._id.toString(),
    vmid: vm.vmid,
    node: vm.node,
    name: vm.name,
    status: vm.status,
    planStatus: vm.planStatus,
    planPeriodEnd: vm.planPeriodEnd,
    billingPeriod,
    specs: vmSpecs(vm),
    orderId: vm.orderId?.toString() ?? null,
    renewalAmount,
    canExtend: vm.planStatus === 'active',
    canRenew: vm.planStatus === 'expired',
  };
}

export class TenantPlanService {
  async listPlans(tenantId: string) {
    const vms = await VM.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      planStatus: { $in: ['active', 'expired'] },
      status: { $nin: ['deleted', 'delete_failed', 'deleting'] },
      planPeriodEnd: { $ne: null },
    }).sort({ planPeriodEnd: 1 });

    const plans = [];
    for (const vm of vms) {
      const billingPeriod = await resolveBillingPeriod(vm);
      const renewalAmount = await calculateVmPlanPeriodAmount(
        tenantId,
        vmSpecs(vm),
        billingPeriod
      );
      plans.push(toPlanPublic(vm, renewalAmount, billingPeriod));
    }
    return plans;
  }

  async getPlan(tenantId: string, vmId: string) {
    const vm = await loadTenantVm(tenantId, vmId);
    const billingPeriod = await resolveBillingPeriod(vm);
    const renewalAmount = await calculateVmPlanPeriodAmount(
      tenantId,
      vmSpecs(vm),
      billingPeriod
    );
    return toPlanPublic(vm, renewalAmount, billingPeriod);
  }

  async quotePlan(tenantId: string, vmId: string) {
    const vm = await loadTenantVm(tenantId, vmId);
    const billingPeriod = await resolveBillingPeriod(vm);
    const amount = await calculateVmPlanPeriodAmount(tenantId, vmSpecs(vm), billingPeriod);

    const now = new Date();
    const baseEnd = vm.planPeriodEnd && vm.planStatus === 'active' ? vm.planPeriodEnd : now;
    const projectedEnd = computePeriodEndDate(baseEnd, billingPeriod);

    return {
      amount,
      billingPeriod,
      currentPlanPeriodEnd: vm.planPeriodEnd,
      projectedPlanPeriodEnd: projectedEnd,
      action: vm.planStatus === 'active' ? 'extend' : 'renew',
    };
  }

  async extendPlan(tenantId: string, vmId: string) {
    const vm = await loadTenantVm(tenantId, vmId);

    if (vm.planStatus !== 'active') {
      throw new AppError('Use renew for expired plans.', 400, 'VALIDATION_ERROR');
    }

    if (!vm.planPeriodEnd || vm.planPeriodEnd <= new Date()) {
      throw new AppError('Plan has expired — use renew instead.', 400, 'VALIDATION_ERROR');
    }

    const billingPeriod = await resolveBillingPeriod(vm);
    const amount = await calculateVmPlanPeriodAmount(tenantId, vmSpecs(vm), billingPeriod);

    await walletService.debitWallet(
      tenantId,
      amount,
      'plan_extend',
      vm.orderId?.toString() ?? null,
      vm._id.toString()
    );

    const newEnd = computePeriodEndDate(vm.planPeriodEnd, billingPeriod);
    vm.planPeriodEnd = newEnd;
    vm.planExpiryWarningFor = null;
    await vm.save();

    if (vm.orderId) {
      await syncOrderPeriodEnd(vm.orderId);
    }

    return {
      vmId: vm._id.toString(),
      planStatus: vm.planStatus,
      planPeriodEnd: newEnd,
      amountCharged: amount,
      billingPeriod,
    };
  }

  async renewPlan(tenantId: string, vmId: string) {
    const vm = await loadTenantVm(tenantId, vmId);

    if (vm.planStatus !== 'expired') {
      throw new AppError('Use extend while the plan is still active.', 400, 'VALIDATION_ERROR');
    }

    const billingPeriod = await resolveBillingPeriod(vm);
    const amount = await calculateVmPlanPeriodAmount(tenantId, vmSpecs(vm), billingPeriod);

    await walletService.debitWallet(
      tenantId,
      amount,
      'plan_renew',
      vm.orderId?.toString() ?? null,
      vm._id.toString()
    );

    const periodStart = new Date();
    const newEnd = computePeriodEndDate(periodStart, billingPeriod);

    vm.planStatus = 'active';
    vm.planPeriodEnd = newEnd;
    vm.planExpiryWarningFor = null;
    await vm.save();

    if (vm.orderId) {
      await syncOrderPeriodEnd(vm.orderId);
    }

    const adminId = vm.adminId ?? new mongoose.Types.ObjectId();
    if (vm.status !== 'running') {
      await vmService.startVmSystem(vm, adminId, {
        ipAddress: 'tenant-plan-renew',
        userAgent: 'tenant-plan-renew',
      });
    }

    return {
      vmId: vm._id.toString(),
      planStatus: vm.planStatus,
      planPeriodEnd: newEnd,
      amountCharged: amount,
      billingPeriod,
      vmStatus: vm.status,
    };
  }

  async listRenewalHistory(tenantId: string, vmId: string) {
    await loadTenantVm(tenantId, vmId);

    const rows = await WalletTransaction.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      relatedVmId: new mongoose.Types.ObjectId(vmId),
      reason: { $in: ['plan_extend', 'plan_renew'] },
    })
      .sort({ createdAt: -1 })
      .lean();

    return rows.map((row) => ({
      id: row._id.toString(),
      type: row.type,
      amount: row.amount,
      reason: row.reason,
      balanceAfter: row.balanceAfter,
      createdAt: row.createdAt,
    }));
  }
}

export const tenantPlanService = new TenantPlanService();
