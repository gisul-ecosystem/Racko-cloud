import type { Request, Response, NextFunction } from 'express';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { orderService } from './order.service';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class OrderController {
  async listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const templates = await orderService.getAvailableTemplatesForTenant(authReq.tenantUser.tenantId);
      success(res, 'Templates retrieved.', { templates });
    } catch (error) {
      next(error);
    }
  }

  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { templateId, count } = req.body as { templateId: number; count: number };
      const order = await orderService.createOrder(
        authReq.tenantUser.tenantId,
        authReq.tenantUser.id,
        templateId,
        count
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
}

export const orderController = new OrderController();
