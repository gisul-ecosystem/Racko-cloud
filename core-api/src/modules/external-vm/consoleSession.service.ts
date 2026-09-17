import mongoose from 'mongoose';
import { ConsoleSessionModel } from './consoleSession.model';
import { ExternalVMModel } from './external-vm.model';
import { User } from '../../models/user.model';
import { TenantUser } from '../../models/tenantUser.model';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export class ConsoleSessionService {

  /** Called when the Guacamole iframe loads — console is live. */
  async startSession(
    serverId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId
  ): Promise<{ sessionId: string; endToken: string }> {
    const server = await ExternalVMModel.findById(serverId).lean();
    if (!server) throw new NotFoundError('Server not found.');

    // Resolve user email from the correct collection.
    // Platform admin servers: userId is a platform User._id → use User model.
    // Tenant servers: userId is a TenantUser._id → use TenantUser model.
    let userEmail: string;
    if (server.tenantId) {
      const tenantUser = await TenantUser.findById(userId).select('email').lean();
      if (!tenantUser) throw new NotFoundError('Tenant user not found.');
      userEmail = tenantUser.email;
    } else {
      const user = await User.findById(userId).select('email').lean();
      if (!user) throw new NotFoundError('User not found.');
      userEmail = user.email;
    }

    const session = await ConsoleSessionModel.create({
      ...(server.adminId ? { adminId: server.adminId } : {}),
      ...(server.tenantId ? { tenantId: server.tenantId } : {}),
      userId,
      userEmail,
      serverId,
      serverName: server.name,
      loginAt: new Date(),
      lastHeartbeatAt: new Date(),
    });

    // Issue a short-lived single-use end token so the frontend can close
    // the session via sendBeacon without needing an auth header.
    const { issueEndToken } = await import('./consoleSession.endToken');
    const endToken = issueEndToken(session._id.toString());

    logger.info('[ConsoleSession] Session started', {
      sessionId: session._id.toString(),
      userId: userId.toString(),
      serverId: serverId.toString(),
    });

    return { sessionId: session._id.toString(), endToken };
  }

  /**
   * Called via sendBeacon on disconnect — no auth header available.
   * The endToken was issued at session start and is single-use + short-lived.
   */
  async endSessionByToken(endToken: string): Promise<void> {
    const { consumeEndToken } = await import('./consoleSession.endToken');
    const sessionId = consumeEndToken(endToken);
    if (!sessionId) {
      // Token expired or already used — silently ignore (stale sweeper handles it)
      logger.warn('[ConsoleSession] endSessionByToken: token invalid or expired');
      return;
    }

    const session = await ConsoleSessionModel.findOne({
      _id: new mongoose.Types.ObjectId(sessionId),
      logoutAt: null,
    });

    if (!session) return; // already closed — idempotent

    const logoutAt = new Date();
    const durationSeconds = Math.round((logoutAt.getTime() - session.loginAt.getTime()) / 1000);

    await ConsoleSessionModel.updateOne(
      { _id: session._id },
      { $set: { logoutAt, durationSeconds } }
    );

    logger.info('[ConsoleSession] Session ended via endToken', {
      sessionId,
      durationSeconds,
    });
  }

  /** Called every 60s while console is open. */
  async heartbeat(
    sessionId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId
  ): Promise<void> {
    const result = await ConsoleSessionModel.updateOne(
      { _id: sessionId, userId, logoutAt: null },
      { $set: { lastHeartbeatAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      // Session already closed or not found — silently ignore (non-fatal)
      return;
    }
  }

  /** Called on Disconnect click or pagehide. */
  async endSession(
    sessionId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId
  ): Promise<void> {
    const session = await ConsoleSessionModel.findOne({
      _id: sessionId,
      userId,
      logoutAt: null,
    });

    if (!session) return; // already closed — idempotent

    const logoutAt = new Date();
    const durationSeconds = Math.round((logoutAt.getTime() - session.loginAt.getTime()) / 1000);

    await ConsoleSessionModel.updateOne(
      { _id: sessionId },
      { $set: { logoutAt, durationSeconds } }
    );

    logger.info('[ConsoleSession] Session ended', {
      sessionId: sessionId.toString(),
      userId: userId.toString(),
      durationSeconds,
    });
  }

  /** Analytics list scoped to a specific adminId (platform admin). */
  async listSessions(
    adminId: mongoose.Types.ObjectId,
    filters: {
      userId?: string;
      serverId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    }
  ) {
    return this._listSessions({ adminId }, filters);
  }

  /** Bulk delete completed sessions scoped to an adminId (platform admin). */
  async bulkDeleteSessions(
    adminId: mongoose.Types.ObjectId,
    ids: string[]
  ): Promise<{ deleted: number }> {
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const result = await ConsoleSessionModel.deleteMany({
      _id: { $in: objectIds },
      adminId,
      logoutAt: { $ne: null }, // never delete active sessions
    });
    return { deleted: result.deletedCount };
  }

  /** Bulk delete completed sessions scoped to a tenantId (tenant admin). */
  async bulkDeleteSessionsByTenant(
    tenantId: mongoose.Types.ObjectId,
    ids: string[]
  ): Promise<{ deleted: number }> {
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const result = await ConsoleSessionModel.deleteMany({
      _id: { $in: objectIds },
      tenantId,
      logoutAt: { $ne: null }, // never delete active sessions
    });
    return { deleted: result.deletedCount };
  }

  /** Analytics list scoped to a specific tenantId (tenant admin). */
  async listSessionsByTenant(
    tenantId: mongoose.Types.ObjectId,
    filters: {
      userId?: string;
      serverId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    }
  ) {
    return this._listSessions({ tenantId }, filters);
  }

  private async _listSessions(
    scope: { adminId?: mongoose.Types.ObjectId; tenantId?: mongoose.Types.ObjectId },
    filters: {
      userId?: string;
      serverId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const query: Record<string, unknown> = { ...scope };

    if (filters.userId && mongoose.Types.ObjectId.isValid(filters.userId)) {
      query['userId'] = new mongoose.Types.ObjectId(filters.userId);
    }
    if (filters.serverId && mongoose.Types.ObjectId.isValid(filters.serverId)) {
      query['serverId'] = new mongoose.Types.ObjectId(filters.serverId);
    }
    if (filters.from || filters.to) {
      const dateFilter: Record<string, Date> = {};
      if (filters.from) dateFilter['$gte'] = new Date(filters.from);
      if (filters.to) dateFilter['$lte'] = new Date(filters.to);
      query['loginAt'] = dateFilter;
    }

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      ConsoleSessionModel.find(query).sort({ loginAt: -1 }).skip(skip).limit(limit).lean(),
      ConsoleSessionModel.countDocuments(query),
    ]);

    // Summary stats
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [todayStats, activeCount] = await Promise.all([
      ConsoleSessionModel.aggregate([
        { $match: { ...scope, loginAt: { $gte: startOfDay } } },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' },
            totalDuration: { $sum: { $ifNull: ['$durationSeconds', 0] } },
            completedCount: { $sum: { $cond: [{ $ne: ['$logoutAt', null] }, 1, 0] } },
          },
        },
      ]),
      ConsoleSessionModel.countDocuments({ ...scope, logoutAt: null }),
    ]);

    const stats = todayStats[0] ?? {
      totalSessions: 0,
      uniqueUsers: [],
      totalDuration: 0,
      completedCount: 0,
    };

    const avgDuration =
      stats.completedCount > 0
        ? Math.round(stats.totalDuration / stats.completedCount)
        : 0;

    return {
      sessions: sessions.map((s) => ({
        _id: s._id.toString(),
        userId: s.userId.toString(),
        userEmail: s.userEmail,
        serverId: s.serverId.toString(),
        serverName: s.serverName,
        loginAt: s.loginAt.toISOString(),
        logoutAt: s.logoutAt ? s.logoutAt.toISOString() : null,
        lastHeartbeatAt: s.lastHeartbeatAt.toISOString(),
        durationSeconds: s.durationSeconds ?? null,
        isActive: s.logoutAt == null,
      })),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      summary: {
        sessionsToday: stats.totalSessions,
        uniqueUsersToday: (stats.uniqueUsers as unknown[]).length,
        avgDurationSeconds: avgDuration,
        activeSessions: activeCount,
      },
    };
  }
}

export const consoleSessionService = new ConsoleSessionService();
