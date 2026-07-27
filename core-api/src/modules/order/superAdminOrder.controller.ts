import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { orderService } from './order.service';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class SuperAdminOrderController {
  async listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
      const orders = await orderService.listOrdersForSuperAdmin(status);
      success(res, 'Orders retrieved.', { orders });
    } catch (error) {
      next(error);
    }
  }

  async approveOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const orderId = req.params['orderId'] as string;
      const order = await orderService.approveOrder(orderId, authReq.user.userId);
      success(res, 'Order approved and provisioning started.', order);
    } catch (error) {
      next(error);
    }
  }

  async rejectOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const orderId = req.params['orderId'] as string;
      const { reason } = req.body as { reason: string };
      const order = await orderService.rejectOrder(orderId, authReq.user.userId, reason);
      success(res, 'Order rejected and wallet refunded.', order);
    } catch (error) {
      next(error);
    }
  }
}

export const superAdminOrderController = new SuperAdminOrderController();
