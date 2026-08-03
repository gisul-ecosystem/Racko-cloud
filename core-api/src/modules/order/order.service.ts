import type { Request } from 'express';
import mongoose from 'mongoose';
import { Order, type IOrder, type IOrderSpecs, type BillingPeriod } from '../../models/order.model';
import { TenantServiceConfig } from '../../models/tenantServiceConfig.model';
import { Tenant } from '../../models/tenant.model';
import { User } from '../../models/user.model';
import { Notification } from '../notification/notification.model';
import { VM } from '../vm/vm.model';
import { vmService } from '../vm/vm.service';
import { walletService } from '../wallet/wallet.service';
import { logger } from '../../utils/logger';
import {
  AppError,
  NotFoundError,
  TemplateNotFoundError,
} from '../../utils/errors';
import type { CreateVMDto } from '../vm/vm.types';

interface VmManagementPricing {
  cpuRatePerCoreMonthly: number;
  ramRatePerGbMonthly: number;
  diskRatePerGbMonthly: number;
  billingDiscounts?: {
    quarterly: number;
    yearly: number;
  };
  templatePricing?: Record<string, {
    cpuRatePerCoreMonthly: number;
    ramRatePerGbMonthly: number;
    diskRatePerGbMonthly: number;
    billingDiscounts?: {
      quarterly: number;
      yearly: number;
    };
  }>;
}

interface BillingDiscounts {
  quarterly: number;
  yearly: number;
}

interface VmManagementLimits {
  maxVms?: number;
  maxTotalVcpu?: number;
  maxTotalRamGb?: number;
  maxTotalDiskGb?: number;
  allowedTemplateIds?: number[];
}

interface TenantOrderUsage {
  vmCount: number;
  totalVcpu: number;
  totalRamGb: number;
  totalDiskGb: number;
}

export interface TenantOrderCatalog {
  templates: TenantTemplateCatalogItem[];
  pricing: VmManagementPricing & { fixedPlans?: unknown[] };
}

export interface TenantTemplateDetail {
  templateId: number;
  name: string;
  node: string;
  baselineSpecs: IOrderSpecs;
  pricePerVm: number;
  pricing: VmManagementPricing;
}

export interface TenantTemplateCatalogItem {
  templateId: number;
  name: string;
  node: string;
  baselineSpecs: IOrderSpecs;
  pricePerVm: number;
}

export interface OrderSpecInput {
  cpuCores?: number;
  memoryGb?: number;
  diskGb?: number;
}

export interface PlaceOrderInput {
  templateId: number;
  count: number;
  cpuCores?: number;
  memoryGb?: number;
  diskGb?: number;
  billingPeriod?: BillingPeriod;
  networkType?: 'public' | 'private';
}

function getBillingDiscounts(pricing: Record<string, unknown>, templateId?: number): BillingDiscounts {
  // Use per-template discounts if available
  if (templateId && pricing['templatePricing']) {
    const tplMap = pricing['templatePricing'] as Record<string, Record<string, unknown>>;
    const tpl = tplMap[String(templateId)];
    if (tpl) {
      const raw = tpl['billingDiscounts'] as Record<string, unknown> | undefined;
      return {
        quarterly: typeof raw?.['quarterly'] === 'number' ? raw['quarterly'] : 0,
        yearly: typeof raw?.['yearly'] === 'number' ? raw['yearly'] : 0,
      };
    }
  }
  // Fallback to flat discounts
  const raw = pricing['billingDiscounts'] as Record<string, unknown> | undefined;
  return {
    quarterly: typeof raw?.['quarterly'] === 'number' ? raw['quarterly'] : 0,
    yearly: typeof raw?.['yearly'] === 'number' ? raw['yearly'] : 0,
  };
}

function applyBillingPeriodMultiplier(
  monthlyAmount: number,
  billingPeriod: BillingPeriod,
  discounts: BillingDiscounts
): number {
  if (billingPeriod === 'monthly') return monthlyAmount;
  if (billingPeriod === 'quarterly') return monthlyAmount * 3 * (1 - discounts.quarterly);
  return monthlyAmount * 12 * (1 - discounts.yearly);
}

function buildSuperAdminRequest(userId: string): Request {
  return {
    user: {
      userId,
      role: 'super_admin',
      sessionId: 'tenant-order-approval',
    },
  } as unknown as Request;
}

function computePerVmCost(
  specs: IOrderSpecs,
  pricing: VmManagementPricing,
  templateId?: number
): number {
  // Use per-template pricing if available
  if (templateId && pricing.templatePricing && pricing.templatePricing[String(templateId)]) {
    const tplPricing = pricing.templatePricing[String(templateId)];
    return (
      specs.cpuCores * (tplPricing.cpuRatePerCoreMonthly ?? 0) +
      specs.memoryGb * (tplPricing.ramRatePerGbMonthly ?? 0) +
      specs.diskGb * (tplPricing.diskRatePerGbMonthly ?? 0)
    );
  }

  // Fallback to flat pricing for backward compatibility
  return (
    specs.cpuCores * (pricing.cpuRatePerCoreMonthly ?? 0) +
    specs.memoryGb * (pricing.ramRatePerGbMonthly ?? 0) +
    specs.diskGb * (pricing.diskRatePerGbMonthly ?? 0)
  );
}

function getAllowedTemplateIds(limits: Record<string, unknown>): number[] {
  const raw = (limits as VmManagementLimits).allowedTemplateIds;
  return Array.isArray(raw) ? raw.filter((id) => typeof id === 'number') : [];
}

async function getActiveVmManagementConfig(tenantId: string) {
  const config = await TenantServiceConfig.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    serviceKey: 'vm-management',
    status: 'active',
  }).lean();

  if (!config) {
    throw new AppError('SERVICE_NOT_ENABLED', 404, 'SERVICE_NOT_ENABLED');
  }

  return config;
}

const EXCLUDED_VM_STATUSES = ['deleted', 'deleting', 'delete_failed'] as const;

async function getTenantVmResourceUsage(
  tenantObjectId: mongoose.Types.ObjectId
): Promise<TenantOrderUsage> {
  const [result] = await VM.aggregate<{
    vmCount: number;
    totalVcpu: number;
    totalRamGb: number;
    totalDiskGb: number;
  }>([
    {
      $match: {
        tenantId: tenantObjectId,
        status: { $nin: EXCLUDED_VM_STATUSES },
      },
    },
    {
      $group: {
        _id: null,
        vmCount: { $sum: 1 },
        totalVcpu: { $sum: '$allocatedCpu' },
        totalRamGb: { $sum: '$allocatedMemoryGb' },
        totalDiskGb: { $sum: '$allocatedDiskGb' },
      },
    },
  ]);

  return {
    vmCount: result?.vmCount ?? 0,
    totalVcpu: result?.totalVcpu ?? 0,
    totalRamGb: result?.totalRamGb ?? 0,
    totalDiskGb: result?.totalDiskGb ?? 0,
  };
}

function addOrderReservationUsage(
  acc: TenantOrderUsage,
  order: { count: number; specs: IOrderSpecs }
): TenantOrderUsage {
  return {
    vmCount: acc.vmCount + order.count,
    totalVcpu: acc.totalVcpu + order.specs.cpuCores * order.count,
    totalRamGb: acc.totalRamGb + order.specs.memoryGb * order.count,
    totalDiskGb: acc.totalDiskGb + order.specs.diskGb * order.count,
  };
}

/**
 * Tenant quota usage for limit checks when placing new orders.
 * - Active provisioned VMs (by tenantId) — decreases when a VM is deleted
 * - Plus in-flight orders not yet fulfilled (pending approval/payment/provisioning)
 */
async function getTenantOrderUsage(tenantId: string): Promise<TenantOrderUsage> {
  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

  const [vmUsage, reservedOrders] = await Promise.all([
    getTenantVmResourceUsage(tenantObjectId),
    Order.find({
      tenantId: tenantObjectId,
      status: { $in: ['pending_approval', 'pending_payment', 'provisioning'] },
    })
      .select('count specs')
      .lean(),
  ]);

  return reservedOrders.reduce(
    (acc, order) => addOrderReservationUsage(acc, order),
    vmUsage
  );
}

function assertOrderWithinTenantLimits(
  limits: Record<string, unknown>,
  usage: TenantOrderUsage,
  count: number,
  specs: IOrderSpecs
): void {
  const l = limits as VmManagementLimits;
  const newVms = usage.vmCount + count;
  const newVcpu = usage.totalVcpu + specs.cpuCores * count;
  const newRamGb = usage.totalRamGb + specs.memoryGb * count;
  const newDiskGb = usage.totalDiskGb + specs.diskGb * count;

  if (typeof l.maxVms === 'number' && newVms > l.maxVms) {
    throw new AppError('TENANT_VM_LIMIT_EXCEEDED', 403, 'TENANT_VM_LIMIT_EXCEEDED');
  }
  if (typeof l.maxTotalVcpu === 'number' && newVcpu > l.maxTotalVcpu) {
    throw new AppError('TENANT_VCPU_LIMIT_EXCEEDED', 403, 'TENANT_VCPU_LIMIT_EXCEEDED');
  }
  if (typeof l.maxTotalRamGb === 'number' && newRamGb > l.maxTotalRamGb) {
    throw new AppError('TENANT_RAM_LIMIT_EXCEEDED', 403, 'TENANT_RAM_LIMIT_EXCEEDED');
  }
  if (typeof l.maxTotalDiskGb === 'number' && newDiskGb > l.maxTotalDiskGb) {
    throw new AppError('TENANT_DISK_LIMIT_EXCEEDED', 403, 'TENANT_DISK_LIMIT_EXCEEDED');
  }
}

function toOrderPublic(order: IOrder) {
  return {
    id: order._id.toString(),
    tenantId: order.tenantId.toString(),
    templateId: order.templateId,
    templateName: order.templateName,
    count: order.count,
    specs: order.specs,
    calculatedAmount: order.calculatedAmount,
    status: order.status,
    createdBy: order.createdBy.toString(),
    approvedBy: order.approvedBy ? order.approvedBy.toString() : null,
    rejectedBy: order.rejectedBy ? order.rejectedBy.toString() : null,
    rejectionReason: order.rejectionReason,
    provisionJobId: order.provisionJobId ?? null,
    billingPeriod: order.billingPeriod,
    networkType: order.networkType ?? 'public',
    periodStartDate: order.periodStartDate,
    periodEndDate: order.periodEndDate,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

async function notifySuperAdminsOfNewOrder(order: IOrder): Promise<void> {
  const [tenant, superAdmins] = await Promise.all([
    Tenant.findById(order.tenantId).select('name slug').lean(),
    User.find({ role: 'super_admin', isActive: true }).select('_id').lean(),
  ]);

  const tenantLabel = tenant?.name ?? tenant?.slug ?? order.tenantId.toString();
  const title = 'New tenant VM order pending approval';
  const message = `${tenantLabel} placed an order for ${order.count}× ${order.templateName} (₹${order.calculatedAmount}).`;

  await Promise.all(
    superAdmins.map((admin) =>
      Notification.create({
        userId: admin._id,
        type: 'tenant_order',
        title,
        message,
        severity: 'info',
        read: false,
        metadata: {
          orderId: order._id.toString(),
          tenantId: order.tenantId.toString(),
          event: 'pending_approval',
          templateId: order.templateId,
          count: order.count,
          amount: order.calculatedAmount,
        },
      }).catch((err: unknown) => {
        logger.warn('Failed to create tenant order notification', {
          orderId: order._id.toString(),
          userId: admin._id.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      })
    )
  );
}

async function resolveOrderSpecs(
  templateId: number,
  req: Request,
  requested?: OrderSpecInput
): Promise<{ specs: IOrderSpecs; templateName: string; baselineSpecs: IOrderSpecs }> {
  let details;
  try {
    details = await vmService.getTemplateDetails(templateId, req);
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      throw new AppError('TEMPLATE_NOT_FOUND', 404, 'TEMPLATE_NOT_FOUND');
    }
    throw error;
  }

  const baselineSpecs: IOrderSpecs = {
    cpuCores: details.cpuCores,
    memoryGb: details.memoryGb,
    diskGb: details.diskGb,
  };

  const specs: IOrderSpecs = {
    cpuCores: requested?.cpuCores ?? baselineSpecs.cpuCores,
    memoryGb: requested?.memoryGb ?? baselineSpecs.memoryGb,
    diskGb: requested?.diskGb ?? baselineSpecs.diskGb,
  };

  if (specs.cpuCores < baselineSpecs.cpuCores) {
    throw new AppError(
      `cpuCores (${specs.cpuCores}) cannot be less than template minimum (${baselineSpecs.cpuCores})`,
      400,
      'VALIDATION_ERROR'
    );
  }
  if (specs.memoryGb < baselineSpecs.memoryGb) {
    throw new AppError(
      `memoryGb (${specs.memoryGb}) cannot be less than template minimum (${baselineSpecs.memoryGb})`,
      400,
      'VALIDATION_ERROR'
    );
  }
  if (specs.diskGb < baselineSpecs.diskGb) {
    throw new AppError(
      `diskGb (${specs.diskGb}) cannot be less than template minimum (${baselineSpecs.diskGb})`,
      400,
      'VALIDATION_ERROR'
    );
  }

  return { specs, templateName: details.name, baselineSpecs };
}

export class OrderService {
  async getOrderCatalogForTenant(tenantId: string): Promise<TenantOrderCatalog> {
    const serviceConfig = await getActiveVmManagementConfig(tenantId);
    const templates = await this.getAvailableTemplatesForTenant(tenantId);
    const pricing = serviceConfig.pricing as Record<string, unknown>;

    return {
      templates,
      pricing: {
        cpuRatePerCoreMonthly: Number(pricing['cpuRatePerCoreMonthly'] ?? 0),
        ramRatePerGbMonthly: Number(pricing['ramRatePerGbMonthly'] ?? 0),
        diskRatePerGbMonthly: Number(pricing['diskRatePerGbMonthly'] ?? 0),
        billingDiscounts: getBillingDiscounts(pricing),
        fixedPlans: Array.isArray(pricing['fixedPlans'])
          ? (pricing['fixedPlans'] as unknown[])
          : undefined,
        templatePricing:
          pricing['templatePricing'] && typeof pricing['templatePricing'] === 'object'
            ? (pricing['templatePricing'] as Record<string, {
                cpuRatePerCoreMonthly: number;
                ramRatePerGbMonthly: number;
                diskRatePerGbMonthly: number;
                billingDiscounts?: { quarterly: number; yearly: number };
              }>)
            : undefined,
      },
    };
  }

  async getTemplateDetailForTenant(
    tenantId: string,
    templateId: number
  ): Promise<TenantTemplateDetail> {
    const serviceConfig = await getActiveVmManagementConfig(tenantId);
    const pricing = serviceConfig.pricing as unknown as VmManagementPricing;
    const allowedTemplateIds = getAllowedTemplateIds(serviceConfig.limits as Record<string, unknown>);

    if (allowedTemplateIds.length > 0 && !allowedTemplateIds.includes(templateId)) {
      throw new AppError('TEMPLATE_NOT_ALLOWED_FOR_TENANT', 403, 'TEMPLATE_NOT_ALLOWED_FOR_TENANT');
    }

    const superAdmin = await User.findOne({ role: 'super_admin', isActive: true })
      .select('_id')
      .lean();
    const req = buildSuperAdminRequest(superAdmin?._id.toString() ?? new mongoose.Types.ObjectId().toString());

    const { specs, templateName, baselineSpecs } = await resolveOrderSpecs(templateId, req);

    const catalog = await vmService.getTemplateCatalog();
    const template = catalog.templates.find((t) => t.vmid === templateId);
    if (!template || !catalog.enabledVmids.includes(templateId)) {
      throw new AppError('TEMPLATE_NOT_FOUND', 404, 'TEMPLATE_NOT_FOUND');
    }

    return {
      templateId,
      name: templateName,
      node: template.node,
      baselineSpecs,
      pricePerVm: computePerVmCost(specs, pricing, templateId),
      pricing: {
        cpuRatePerCoreMonthly: pricing.templatePricing?.[String(templateId)]?.cpuRatePerCoreMonthly
          ?? pricing.cpuRatePerCoreMonthly,
        ramRatePerGbMonthly: pricing.templatePricing?.[String(templateId)]?.ramRatePerGbMonthly
          ?? pricing.ramRatePerGbMonthly,
        diskRatePerGbMonthly: pricing.templatePricing?.[String(templateId)]?.diskRatePerGbMonthly
          ?? pricing.diskRatePerGbMonthly,
        billingDiscounts: pricing.templatePricing?.[String(templateId)]?.billingDiscounts
          ?? pricing.billingDiscounts,
      },
    };
  }

  async getAvailableTemplatesForTenant(tenantId: string): Promise<TenantTemplateCatalogItem[]> {
    const serviceConfig = await getActiveVmManagementConfig(tenantId);
    const pricing = serviceConfig.pricing as unknown as VmManagementPricing;
    const allowedTemplateIds = getAllowedTemplateIds(serviceConfig.limits as Record<string, unknown>);

    const catalog = await vmService.getTemplateCatalog();
    const enabledSet = new Set(catalog.enabledVmids);

    let templates = catalog.templates.filter((template) => enabledSet.has(template.vmid));
    if (allowedTemplateIds.length > 0) {
      const allowedSet = new Set(allowedTemplateIds);
      templates = templates.filter((template) => allowedSet.has(template.vmid));
    }

    const superAdmin = await User.findOne({ role: 'super_admin', isActive: true })
      .select('_id')
      .lean();
    const req = buildSuperAdminRequest(superAdmin?._id.toString() ?? new mongoose.Types.ObjectId().toString());

    const results: TenantTemplateCatalogItem[] = [];

    for (const template of templates) {
      try {
        const details = await vmService.getTemplateDetails(template.vmid, req);
        const baselineSpecs: IOrderSpecs = {
          cpuCores: details.cpuCores,
          memoryGb: details.memoryGb,
          diskGb: details.diskGb,
        };
        results.push({
          templateId: template.vmid,
          name: template.name,
          node: template.node,
          baselineSpecs,
          pricePerVm: computePerVmCost(baselineSpecs, pricing, template.vmid),
        });
      } catch (error) {
        logger.warn('Skipping template in tenant catalog', {
          tenantId,
          templateId: template.vmid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  async calculateOrderCost(
    tenantId: string,
    templateId: number,
    count: number,
    requestedSpecs?: OrderSpecInput,
    billingPeriod: BillingPeriod = 'monthly'
  ): Promise<{ amount: number; specs: IOrderSpecs; templateName: string; baselineSpecs: IOrderSpecs }> {
    if (!Number.isInteger(count) || count < 1) {
      throw new AppError('count must be a positive integer', 400, 'VALIDATION_ERROR');
    }

    const serviceConfig = await getActiveVmManagementConfig(tenantId);
    const pricing = serviceConfig.pricing as unknown as VmManagementPricing;
    const allowedTemplateIds = getAllowedTemplateIds(serviceConfig.limits as Record<string, unknown>);

    if (allowedTemplateIds.length > 0 && !allowedTemplateIds.includes(templateId)) {
      throw new AppError('TEMPLATE_NOT_ALLOWED_FOR_TENANT', 403, 'TEMPLATE_NOT_ALLOWED_FOR_TENANT');
    }

    const superAdmin = await User.findOne({ role: 'super_admin', isActive: true })
      .select('_id')
      .lean();
    const req = buildSuperAdminRequest(superAdmin?._id.toString() ?? new mongoose.Types.ObjectId().toString());

    const { specs, templateName, baselineSpecs } = await resolveOrderSpecs(
      templateId,
      req,
      requestedSpecs
    );

    const perVmCost = computePerVmCost(specs, pricing, templateId);
    const monthlyTotal = perVmCost * count;
    const discounts = getBillingDiscounts(serviceConfig.pricing as Record<string, unknown>, templateId);
    const amount = applyBillingPeriodMultiplier(monthlyTotal, billingPeriod, discounts);
    return {
      amount,
      specs,
      templateName,
      baselineSpecs,
    };
  }

  async createOrder(
    tenantId: string,
    tenantUserId: string,
    input: PlaceOrderInput
  ): Promise<ReturnType<typeof toOrderPublic>> {
    const { templateId, count, cpuCores, memoryGb, diskGb, billingPeriod = 'monthly', networkType = 'public' } = input;
    const { amount, specs, templateName } = await this.calculateOrderCost(
      tenantId,
      templateId,
      count,
      { cpuCores, memoryGb, diskGb },
      billingPeriod
    );

    const serviceConfig = await getActiveVmManagementConfig(tenantId);
    const usage = await getTenantOrderUsage(tenantId);
    assertOrderWithinTenantLimits(serviceConfig.limits as Record<string, unknown>, usage, count, specs);

    const balance = await walletService.getBalance(tenantId);

    if (balance >= amount) {
      const order = await Order.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        templateId,
        templateName,
        count,
        specs,
        calculatedAmount: amount,
        status: 'pending_approval',
        billingPeriod,
        networkType,
        createdBy: new mongoose.Types.ObjectId(tenantUserId),
      });

      await walletService.debitWallet(tenantId, amount, 'order_payment', order._id.toString());
      await notifySuperAdminsOfNewOrder(order);

      return toOrderPublic(order);
    }

    const order = await Order.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      templateId,
      templateName,
      count,
      specs,
      calculatedAmount: amount,
      status: 'pending_payment',
      billingPeriod,
      networkType,
      createdBy: new mongoose.Types.ObjectId(tenantUserId),
    });

    return toOrderPublic(order);
  }

  async listOrdersForTenant(tenantId: string): Promise<ReturnType<typeof toOrderPublic>[]> {
    const orders = await Order.find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();

    return orders.map((order) => toOrderPublic(order as unknown as IOrder));
  }

  async listOrdersForSuperAdmin(status?: string): Promise<ReturnType<typeof toOrderPublic>[]> {
    const query: Record<string, unknown> = {};
    if (status) {
      query['status'] = status;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).lean();
    return orders.map((order) => toOrderPublic(order as unknown as IOrder));
  }

  async approveOrder(orderId: string, approvedByUserId: string): Promise<ReturnType<typeof toOrderPublic>> {
    const order = await Order.findById(orderId);
    if (!order || order.status !== 'pending_approval') {
      throw new NotFoundError('Order not found or not pending approval.');
    }

    const req = buildSuperAdminRequest(approvedByUserId);
    const dto: CreateVMDto = {
      templateId: order.templateId,
      name: `${order.templateName}-order-${order._id.toString().slice(-6)}`,
      count: order.count,
      cloneType: 'dynamic_storage',
      passwordMode: 'dynamic',
      cpuCores: order.specs.cpuCores,
      memoryGb: order.specs.memoryGb,
      diskGb: order.specs.diskGb,
      networkType: order.networkType ?? 'public',
    };

    try {
      const { jobId } = await vmService.createVM(dto, new mongoose.Types.ObjectId(approvedByUserId), req);
      order.status = 'provisioning';
      order.approvedBy = new mongoose.Types.ObjectId(approvedByUserId);
      order.provisionJobId = jobId;
      await order.save();
    } catch (error) {
      logger.error('Order approval VM provisioning failed', {
        orderId,
        tenantId: order.tenantId.toString(),
        templateId: order.templateId,
        count: order.count,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return toOrderPublic(order);
  }

  async rejectOrder(
    orderId: string,
    rejectedByUserId: string,
    reason: string
  ): Promise<ReturnType<typeof toOrderPublic>> {
    const order = await Order.findById(orderId);
    if (!order || order.status !== 'pending_approval') {
      throw new NotFoundError('Order not found or not pending approval.');
    }

    await walletService.creditWallet(
      order.tenantId.toString(),
      order.calculatedAmount,
      'order_refund',
      { relatedOrderId: order._id.toString(), source: 'system' }
    );

    order.status = 'rejected';
    order.rejectedBy = new mongoose.Types.ObjectId(rejectedByUserId);
    order.rejectionReason = reason.trim();
    await order.save();

    return toOrderPublic(order);
  }
}

export const orderService = new OrderService();
