import type { Request } from 'express';
import mongoose from 'mongoose';
import { Order, type IOrder, type IOrderSpecs } from '../../models/order.model';
import { TenantServiceConfig } from '../../models/tenantServiceConfig.model';
import { Tenant } from '../../models/tenant.model';
import { User } from '../../models/user.model';
import { Notification } from '../notification/notification.model';
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
}

interface VmManagementLimits {
  allowedTemplateIds?: number[];
}

export interface TenantTemplateCatalogItem {
  templateId: number;
  name: string;
  node: string;
  baselineSpecs: IOrderSpecs;
  pricePerVm: number;
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

function computePerVmCost(specs: IOrderSpecs, pricing: VmManagementPricing): number {
  return (
    specs.cpuCores * pricing.cpuRatePerCoreMonthly +
    specs.memoryGb * pricing.ramRatePerGbMonthly +
    specs.diskGb * pricing.diskRatePerGbMonthly
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

export class OrderService {
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
          pricePerVm: computePerVmCost(baselineSpecs, pricing),
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
    count: number
  ): Promise<{ amount: number; specs: IOrderSpecs; templateName: string }> {
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

    let details;
    try {
      details = await vmService.getTemplateDetails(templateId, req);
    } catch (error) {
      if (error instanceof TemplateNotFoundError) {
        throw new AppError('TEMPLATE_NOT_FOUND', 404, 'TEMPLATE_NOT_FOUND');
      }
      throw error;
    }

    const specs: IOrderSpecs = {
      cpuCores: details.cpuCores,
      memoryGb: details.memoryGb,
      diskGb: details.diskGb,
    };

    const perVmCost = computePerVmCost(specs, pricing);
    return {
      amount: perVmCost * count,
      specs,
      templateName: details.name,
    };
  }

  async createOrder(
    tenantId: string,
    tenantUserId: string,
    templateId: number,
    count: number
  ): Promise<ReturnType<typeof toOrderPublic>> {
    const { amount, specs, templateName } = await this.calculateOrderCost(tenantId, templateId, count);
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
    };

    try {
      await vmService.createVM(dto, new mongoose.Types.ObjectId(approvedByUserId), req);
      order.status = 'fulfilled';
      order.approvedBy = new mongoose.Types.ObjectId(approvedByUserId);
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
      order._id.toString()
    );

    order.status = 'rejected';
    order.rejectedBy = new mongoose.Types.ObjectId(rejectedByUserId);
    order.rejectionReason = reason.trim();
    await order.save();

    return toOrderPublic(order);
  }
}

export const orderService = new OrderService();
