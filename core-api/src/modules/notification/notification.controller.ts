import type { Request, Response, NextFunction } from 'express';
import { notificationService } from './notification.service';
import type { AuthenticatedRequest } from '../../types';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class NotificationController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 20;
      const unreadOnly = req.query['unreadOnly'] === 'true';

      const notifications = await notificationService.list(authReq.user.userId, {
        limit,
        unreadOnly,
      });
      success(res, 'Notifications retrieved.', { notifications });
    } catch (error) {
      next(error);
    }
  }

  async unreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const count = await notificationService.unreadCount(authReq.user.userId);
      success(res, 'Unread count retrieved.', { count });
    } catch (error) {
      next(error);
    }
  }

  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const notification = await notificationService.markRead(
        req.params['notificationId'] as string,
        authReq.user.userId
      );
      success(res, 'Notification marked as read.', { notification });
    } catch (error) {
      next(error);
    }
  }

  async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const updated = await notificationService.markAllRead(authReq.user.userId);
      success(res, 'All notifications marked as read.', { updated });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
