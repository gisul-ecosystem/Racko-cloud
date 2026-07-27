import type { Request, Response, NextFunction } from 'express';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import type { PlaceOrderInput } from './order.service';
import { orderService } from './order.service';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class OrderController {
  async listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const catalog = await orderService.getOrderCatalogForTenant(authReq.tenantUser.tenantId);
      success(res, 'Templates retrieved.', catalog);
    } catch (error) {
      next(error);
    }
  }

  async getTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const templateId = Number((req.params as { templateId: string }).templateId);
      const template = await orderService.getTemplateDetailForTenant(
        authReq.tenantUser.tenantId,
        templateId
      );
      success(res, 'Template retrieved.', { template });
    } catch (error) {
      next(error);
    }
  }

  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const body = req.body as PlaceOrderInput;
      const order = await orderService.createOrder(
        authReq.tenantUser.tenantId,
        authReq.tenantUser.id,
        body
      );
      success(res, 'Order created.', order, 201);
    } catch (error) {
      next(error);
    }
  }

  async listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const orders = await orderService.listOrdersForTenant(authReq.tenantUser.tenantId);
      success(res, 'Orders retrieved.', { orders });
    } catch (error) {
      next(error);
    }
  }

  async quoteOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const body = req.body as PlaceOrderInput;
      const quote = await orderService.calculateOrderCost(
        authReq.tenantUser.tenantId,
        body.templateId,
        body.count,
        {
          cpuCores: body.cpuCores,
          memoryGb: body.memoryGb,
          diskGb: body.diskGb,
        },
        body.billingPeriod ?? 'monthly'
      );
      success(res, 'Order quote calculated.', {
        templateId: body.templateId,
        count: body.count,
        billingPeriod: body.billingPeriod ?? 'monthly',
        templateName: quote.templateName,
        baselineSpecs: quote.baselineSpecs,
        specs: quote.specs,
        amount: quote.amount,
        pricePerVm: quote.amount / body.count,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const orderController = new OrderController();
