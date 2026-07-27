import mongoose from 'mongoose';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';
import { Notification } from './notification.model';
import { VMJob } from '../vm/vmJob.model';
import {
  buildJobFinishedNotification,
  buildJobStartedNotification,
  jobActionUrl,
} from './jobNotification.helper';
import type { INotification } from './notification.model';

export class NotificationService {
  async list(
    userId: string,
    options: { limit?: number; unreadOnly?: boolean } = {}
  ): Promise<INotification[]> {
    const limit = Math.min(options.limit ?? 20, 50);
    const query: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
    };
    if (options.unreadOnly) query['read'] = false;

    return Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean() as unknown as INotification[];
  }

  async unreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      read: false,
    });
  }

  async markRead(notificationId: string, userId: string): Promise<INotification> {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(notificationId),
        userId: new mongoose.Types.ObjectId(userId),
      },
      { read: true, readAt: new Date() },
      { new: true }
    ).lean();

    if (!notification) throw new NotFoundError('Notification not found.');
    return notification as unknown as INotification;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await Notification.updateMany(
      {
        userId: new mongoose.Types.ObjectId(userId),
        read: false,
      },
      { read: true, readAt: new Date() }
    );
    return result.modifiedCount;
  }

  async notifyJobStarted(jobId: mongoose.Types.ObjectId): Promise<void> {
    try {
      const job = await VMJob.findById(jobId).lean();
      if (!job) return;

      const content = buildJobStartedNotification(job);
      await Notification.create({
        userId: job.adminId,
        type: 'vm_job',
        title: content.title,
        message: content.message,
        severity: content.severity,
        read: false,
        metadata: {
          jobId: jobId.toString(),
          event: 'started',
          jobType: job.type,
          status: job.status,
        },
        actionUrl: jobActionUrl(jobId.toString()),
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('duplicate key')) return;
      logger.warn('Failed to create job started notification', {
        jobId: jobId.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async notifyJobFinished(jobId: mongoose.Types.ObjectId): Promise<void> {
    try {
      const job = await VMJob.findById(jobId).lean();
      if (!job) return;
      if (job.status === 'pending' || job.status === 'processing') return;

      const content = buildJobFinishedNotification(job);
      await Notification.create({
        userId: job.adminId,
        type: 'vm_job',
        title: content.title,
        message: content.message,
        severity: content.severity,
        read: false,
        metadata: {
          jobId: jobId.toString(),
          event: 'finished',
          jobType: job.type,
          status: job.status,
          completed: job.completed,
          failed: job.failed,
          total: job.total,
        },
        actionUrl: jobActionUrl(jobId.toString()),
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('duplicate key')) return;
      logger.warn('Failed to create job finished notification', {
        jobId: jobId.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export const notificationService = new NotificationService();
