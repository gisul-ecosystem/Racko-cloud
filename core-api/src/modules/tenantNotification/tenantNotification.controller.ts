import mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { TenantNotification } from '../../models/tenantNotification.model';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class TenantNotificationController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const page = Math.max(1, Number(req.query['page'] ?? 1));
      const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 20)));
      const skip = (page - 1) * limit;

      const filter = {
        tenantUserId: new mongoose.Types.ObjectId(authReq.tenantUser.id),
        tenantId: new mongoose.Types.ObjectId(authReq.tenantUser.tenantId),
      };

      const [rows, total] = await Promise.all([
        TenantNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        TenantNotification.countDocuments(filter),
      ]);

      success(res, 'Notifications retrieved.', {
        notifications: rows.map((n) => ({
          id: n._id.toString(),
          type: n.type,
          title: n.title,
          message: n.message,
          severity: n.severity,
          read: n.read,
          metadata: n.metadata,
          createdAt: n.createdAt,
        })),
        total,
        page,
        limit,
      });
    } catch (error) {
      next(error);
    }
  }

  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { notificationId } = req.params as { notificationId: string };

      const updated = await TenantNotification.findOneAndUpdate(
        {
          _id: notificationId,
          tenantUserId: new mongoose.Types.ObjectId(authReq.tenantUser.id),
        },
        { $set: { read: true, readAt: new Date() } },
        { new: true }
      ).lean();

      if (!updated) {
        res.status(404).json({ success: false, message: 'Notification not found.' });
        return;
      }

      success(res, 'Notification marked read.', { id: updated._id.toString() });
    } catch (error) {
      next(error);
    }
  }
}

export const tenantNotificationController = new TenantNotificationController();
