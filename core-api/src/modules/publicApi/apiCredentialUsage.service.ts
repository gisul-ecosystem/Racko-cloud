import mongoose from 'mongoose';
import { ApiCredentialModel } from '../../models/apiCredential.model';
import { ApiCredentialAccessLog } from '../../models/apiCredentialAccessLog.model';
import type { ApiAccessContext } from './requireApiAccessToken.middleware';

const LAST_USED_THROTTLE_MS = 60 * 1000;
const lastUsedWriteAt = new Map<string, number>();

export interface RecordPublicApiCallInput {
  apiAccess: ApiAccessContext;
  method: string;
  route: string;
  statusCode: number;
}

export class ApiCredentialUsageService {
  recordPublicApiCall(input: RecordPublicApiCallInput): void {
    const { apiAccess, method, route, statusCode } = input;
    const credentialId = new mongoose.Types.ObjectId(apiAccess.credentialId);

    void ApiCredentialAccessLog.create({
      credentialId,
      clientId: apiAccess.clientId,
      ownerType: apiAccess.ownerType,
      method,
      route,
      statusCode,
    }).catch(() => {
      /* fire-and-forget */
    });

    this.touchLastUsedAtThrottled(apiAccess.credentialId);
  }

  private touchLastUsedAtThrottled(credentialId: string): void {
    const now = Date.now();
    const last = lastUsedWriteAt.get(credentialId) ?? 0;
    if (now - last < LAST_USED_THROTTLE_MS) {
      return;
    }
    lastUsedWriteAt.set(credentialId, now);

    void ApiCredentialModel.updateOne(
      { _id: new mongoose.Types.ObjectId(credentialId) },
      { $set: { lastUsedAt: new Date() } }
    ).catch(() => {
      /* fire-and-forget */
    });
  }

  async getUsageSummary(
    credentialId: mongoose.Types.ObjectId,
    options?: { recentLimit?: number; windowHours?: number }
  ) {
    const recentLimit = Math.min(options?.recentLimit ?? 25, 100);
    const windowHours = options?.windowHours ?? 24;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const credential = await ApiCredentialModel.findById(credentialId)
      .select('lastUsedAt clientId status scopes rateLimitPerMin createdAt')
      .lean();

    if (!credential) {
      return null;
    }

    const [recentCalls, statusAgg, totalInWindow] = await Promise.all([
      ApiCredentialAccessLog.find({ credentialId })
        .sort({ createdAt: -1 })
        .limit(recentLimit)
        .select('method route statusCode createdAt clientId ownerType -_id')
        .lean(),
      ApiCredentialAccessLog.aggregate<{ _id: number; count: number }>([
        { $match: { credentialId, createdAt: { $gte: since } } },
        { $group: { _id: '$statusCode', count: { $sum: 1 } } },
      ]),
      ApiCredentialAccessLog.countDocuments({ credentialId, createdAt: { $gte: since } }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of statusAgg) {
      statusCounts[String(row._id)] = row.count;
    }

    return {
      clientId: credential.clientId,
      status: credential.status,
      scopes: credential.scopes,
      rateLimitPerMin: credential.rateLimitPerMin ?? null,
      lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
      createdAt: credential.createdAt.toISOString(),
      windowHours,
      requestCountInWindow: totalInWindow,
      statusCountsInWindow: statusCounts,
      recentCalls: recentCalls.map((row) => ({
        method: row.method,
        route: row.route,
        statusCode: row.statusCode,
        at: row.createdAt.toISOString(),
      })),
    };
  }
}

export const apiCredentialUsageService = new ApiCredentialUsageService();
