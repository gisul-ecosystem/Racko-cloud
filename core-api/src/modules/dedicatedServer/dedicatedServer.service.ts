import mongoose from 'mongoose';
import {
  DedicatedServerPlanModel,
  type IDedicatedServerPlan,
} from '../../models/dedicatedServerPlan.model';
import {
  DedicatedServerRequestModel,
  type DedicatedServerStatus,
  type IDedicatedServerRequest,
} from '../../models/dedicatedServerRequest.model';
import { User } from '../../models/user.model';
import { Notification } from '../notification/notification.model';
import { adminBillingService } from '../adminBilling/adminBilling.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { encrypt, decrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { guacamoleClient } from '../../utils/guacamoleClient';
import type {
  AttachDedicatedRequestInput,
  CreateDedicatedPlanInput,
  CreateDedicatedRequestInput,
  UpdateDedicatedPlanInput,
} from './dedicatedServer.validation';
import type {
  DedicatedConsoleSession,
  DedicatedPlanResponse,
  DedicatedRequesterGroup,
  DedicatedServerResponse,
} from './dedicatedServer.types';

const OPEN_STATUSES: DedicatedServerStatus[] = ['provisioning'];

class DedicatedServerService {
  private toPlan(doc: IDedicatedServerPlan): DedicatedPlanResponse {
    return {
      _id: doc._id.toString(),
      name: doc.name,
      ...(doc.description ? { description: doc.description } : {}),
      cpu: doc.cpu,
      ram: doc.ram,
      disk: doc.disk,
      ...(doc.location ? { location: doc.location } : {}),
      monthlyPrice: doc.monthlyPrice,
      currency: doc.currency || 'INR',
      isActive: doc.isActive,
      sortOrder: doc.sortOrder ?? 0,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private toRequest(
    doc: IDedicatedServerRequest,
    opts?: { adminEmail?: string; includeSecrets?: boolean; forAdmin?: boolean }
  ): DedicatedServerResponse {
    const includeSecrets = Boolean(opts?.includeSecrets);
    const forAdmin = Boolean(opts?.forAdmin);
    const showConnection = includeSecrets || doc.status === 'active';

    return {
      _id: doc._id.toString(),
      adminId: doc.adminId.toString(),
      ...(opts?.adminEmail ? { adminEmail: opts.adminEmail } : {}),
      planId: doc.planId.toString(),
      planName: doc.planName,
      specs: doc.specs,
      monthlyPrice: doc.monthlyPrice,
      currency: doc.currency || 'INR',
      ...(doc.notes ? { notes: doc.notes } : {}),
      status: doc.status,
      ...(doc.chargedAmount != null ? { chargedAmount: doc.chargedAmount } : {}),
      walletDebited: Boolean(doc.walletDebited),
      ...(showConnection && doc.hostname ? { hostname: doc.hostname } : {}),
      ...(showConnection && doc.ipAddress ? { ipAddress: doc.ipAddress } : {}),
      ...(showConnection && doc.username ? { username: doc.username } : {}),
      ...(showConnection && doc.password && (includeSecrets || doc.status === 'active')
        ? (() => {
            try {
              return { password: decrypt(doc.password) };
            } catch {
              return {};
            }
          })()
        : {}),
      ...(showConnection && doc.protocol ? { protocol: doc.protocol } : {}),
      ...(!forAdmin && doc.rejectionReason ? { rejectionReason: doc.rejectionReason } : {}),
      ...(doc.reviewedBy ? { reviewedBy: doc.reviewedBy.toString() } : {}),
      ...(doc.reviewedAt ? { reviewedAt: doc.reviewedAt.toISOString() } : {}),
      ...(doc.attachedAt ? { attachedAt: doc.attachedAt.toISOString() } : {}),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private async findOwnedByAdmin(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<IDedicatedServerRequest> {
    const doc = await DedicatedServerRequestModel.findById(id);
    if (!doc) throw new NotFoundError('Dedicated server request not found.');
    if (doc.adminId.toString() !== adminId.toString()) {
      throw new ForbiddenError('You do not have permission to access this dedicated server.');
    }
    return doc;
  }

  private async notifySuperAdmins(doc: IDedicatedServerRequest, adminEmail: string): Promise<void> {
    const superAdmins = await User.find({ role: 'super_admin', isActive: true })
      .select('_id')
      .lean();
    if (superAdmins.length === 0) return;

    const requestId = doc._id.toString();
    for (const sa of superAdmins) {
      await Notification.create({
        userId: sa._id,
        type: 'dedicated_server_request',
        title: 'Dedicated server request',
        message: `${adminEmail} requested ${doc.planName} (₹${doc.monthlyPrice}/mo).`,
        severity: 'info',
        read: false,
        actionUrl: `/super-admin-console/dedicated-server-requests/${doc.adminId.toString()}`,
        metadata: {
          jobId: requestId,
          requestId,
          adminId: doc.adminId.toString(),
          event: 'dedicated_submitted',
          planName: doc.planName,
          total: doc.monthlyPrice,
        },
      }).catch((err: unknown) => {
        logger.warn('[DedicatedServer] Notification failed', {
          requestId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  private async notifyRequester(
    adminId: mongoose.Types.ObjectId,
    title: string,
    message: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      await Notification.create({
        userId: adminId,
        type: 'dedicated_server_request',
        title,
        message,
        severity: 'info',
        read: false,
        actionUrl: '/console/dedicated-server/my-servers',
        metadata: {
          jobId: String(metadata.requestId || adminId.toString()),
          ...metadata,
          event: `dedicated_${String(metadata.event || 'update')}`,
        },
      });
    } catch (err: unknown) {
      logger.error('[DedicatedServer] Failed to notify requester', {
        adminId: adminId.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── Plans ───────────────────────────────────────────────────────────────

  async listPlans(opts?: { activeOnly?: boolean }): Promise<DedicatedPlanResponse[]> {
    const filter = opts?.activeOnly ? { isActive: true } : {};
    const docs = await DedicatedServerPlanModel.find(filter).sort({
      sortOrder: 1,
      createdAt: -1,
    });
    return docs.map((d) => this.toPlan(d));
  }

  async createPlan(
    input: CreateDedicatedPlanInput,
    createdBy: mongoose.Types.ObjectId
  ): Promise<DedicatedPlanResponse> {
    const doc = await DedicatedServerPlanModel.create({
      ...input,
      currency: input.currency || 'INR',
      createdBy,
    });
    return this.toPlan(doc);
  }

  async updatePlan(
    id: mongoose.Types.ObjectId,
    input: UpdateDedicatedPlanInput
  ): Promise<DedicatedPlanResponse> {
    const doc = await DedicatedServerPlanModel.findById(id);
    if (!doc) throw new NotFoundError('Dedicated server plan not found.');

    if (input.name !== undefined) doc.name = input.name;
    if (input.description !== undefined) {
      doc.description = input.description === null ? undefined : input.description;
    }
    if (input.cpu !== undefined) doc.cpu = input.cpu;
    if (input.ram !== undefined) doc.ram = input.ram;
    if (input.disk !== undefined) doc.disk = input.disk;
    if (input.location !== undefined) {
      doc.location = input.location === null ? undefined : input.location;
    }
    if (input.monthlyPrice !== undefined) doc.monthlyPrice = input.monthlyPrice;
    if (input.currency !== undefined) doc.currency = input.currency;
    if (input.isActive !== undefined) doc.isActive = input.isActive;
    if (input.sortOrder !== undefined) doc.sortOrder = input.sortOrder;
    await doc.save();
    return this.toPlan(doc);
  }

  async deletePlan(id: mongoose.Types.ObjectId): Promise<void> {
    const doc = await DedicatedServerPlanModel.findByIdAndDelete(id);
    if (!doc) throw new NotFoundError('Dedicated server plan not found.');
  }

  // ─── Admin requests ──────────────────────────────────────────────────────

  async createRequest(
    input: CreateDedicatedRequestInput,
    adminId: mongoose.Types.ObjectId
  ): Promise<DedicatedServerResponse> {
    const admin = await User.findById(adminId).select('email role isActive').lean();
    if (!admin || admin.role !== 'admin' || !admin.isActive) {
      throw new ForbiddenError('Only active admins can request dedicated servers.');
    }

    const plan = await DedicatedServerPlanModel.findById(input.planId);
    if (!plan || !plan.isActive) {
      throw new NotFoundError('Dedicated server plan not found or inactive.');
    }

    const total = Number(plan.monthlyPrice);
    if (!Number.isFinite(total) || total < 0) {
      throw new ValidationError('Invalid plan price.');
    }

    if (total > 0) {
      await adminBillingService.debitWallet(
        adminId.toString(),
        total,
        null,
        'dedicated_server_purchase'
      );
    }

    let doc: IDedicatedServerRequest;
    try {
      doc = await DedicatedServerRequestModel.create({
        adminId,
        planId: plan._id,
        planName: plan.name,
        specs: {
          cpu: plan.cpu,
          ram: plan.ram,
          disk: plan.disk,
          location: plan.location,
        },
        monthlyPrice: total,
        currency: plan.currency || 'INR',
        notes: input.notes,
        status: 'provisioning',
        chargedAmount: total,
        walletDebited: total > 0,
      });
    } catch (err) {
      if (total > 0) {
        await adminBillingService
          .refundCloudRequestCharge(adminId.toString(), total, null)
          .catch((refundErr: unknown) => {
            logger.error('[DedicatedServer] Wallet debit rollback failed', {
              adminId: adminId.toString(),
              error: refundErr instanceof Error ? refundErr.message : String(refundErr),
            });
          });
      }
      throw err;
    }

    if (total > 0) {
      await adminBillingService.patchLatestTransactionJobId(
        adminId.toString(),
        doc._id.toString()
      );
    }

    await this.notifySuperAdmins(doc, admin.email);
    await this.notifyRequester(
      adminId,
      'Dedicated server request submitted',
      `Your ${plan.name} request (₹${total}/mo) was charged and is awaiting fulfillment.`,
      { requestId: doc._id.toString(), event: 'submitted', planName: plan.name, total }
    );

    return this.toRequest(doc, { adminEmail: admin.email });
  }

  async listForAdmin(adminId: mongoose.Types.ObjectId): Promise<DedicatedServerResponse[]> {
    const docs = await DedicatedServerRequestModel.find({ adminId }).sort({ createdAt: -1 });
    return docs.map((d) => this.toRequest(d, { forAdmin: true }));
  }

  async getForAdmin(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<DedicatedServerResponse> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    return this.toRequest(doc, { forAdmin: true });
  }

  async openConsole(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    dimensions?: { width?: number; height?: number }
  ): Promise<DedicatedConsoleSession> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    if (doc.status !== 'active') {
      throw new ValidationError('Console is only available after the server is attached.');
    }
    if (!doc.ipAddress || !doc.password) {
      throw new ValidationError('Missing IP or password for console access.');
    }

    const protocol = doc.protocol || 'ssh';
    const username = doc.username || (protocol === 'rdp' ? 'Administrator' : 'root');
    let password: string;
    try {
      password = decrypt(doc.password);
    } catch {
      throw new ValidationError('Stored password could not be decrypted.');
    }

    const session = await guacamoleClient.openConsole(
      `dedicated-${doc._id.toString()}`,
      protocol,
      {
        hostname: doc.ipAddress,
        port: protocol === 'rdp' ? 3389 : 22,
        username,
        password,
        ignoreCert: true,
        securityMode: 'any',
        width: dimensions?.width,
        height: dimensions?.height,
      }
    );

    return {
      protocol,
      clientUrl: session.clientUrl,
      connectionId: session.connectionId,
    };
  }

  // ─── Super-admin requests ────────────────────────────────────────────────

  async listRequesterGroups(): Promise<DedicatedRequesterGroup[]> {
    const groups = await DedicatedServerRequestModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      pendingCount: number;
      totalCount: number;
      lastRequestedAt: Date | null;
    }>([
      {
        $group: {
          _id: '$adminId',
          pendingCount: {
            $sum: { $cond: [{ $in: ['$status', OPEN_STATUSES] }, 1, 0] },
          },
          totalCount: { $sum: 1 },
          lastRequestedAt: { $max: '$createdAt' },
        },
      },
      { $sort: { lastRequestedAt: -1 } },
    ]);

    const adminIds = groups.map((g) => g._id);
    const admins = await User.find({ _id: { $in: adminIds } }).select('email').lean();
    const emailById = new Map(admins.map((a) => [a._id.toString(), a.email]));

    return groups.map((g) => ({
      adminId: g._id.toString(),
      adminEmail: emailById.get(g._id.toString()) ?? 'Unknown',
      pendingCount: g.pendingCount,
      totalCount: g.totalCount,
      lastRequestedAt: g.lastRequestedAt ? g.lastRequestedAt.toISOString() : null,
    }));
  }

  async listRequestsForSuperAdmin(opts: {
    status?: DedicatedServerStatus | 'all';
    adminId?: mongoose.Types.ObjectId;
  }): Promise<DedicatedServerResponse[]> {
    const filter: Record<string, unknown> = {};
    if (opts.adminId) filter.adminId = opts.adminId;
    if (opts.status && opts.status !== 'all') filter.status = opts.status;

    const docs = await DedicatedServerRequestModel.find(filter).sort({ createdAt: -1 });
    const adminIds = [...new Set(docs.map((d) => d.adminId.toString()))];
    const admins = await User.find({
      _id: { $in: adminIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('email')
      .lean();
    const emailById = new Map(admins.map((a) => [a._id.toString(), a.email]));

    return docs.map((doc) =>
      this.toRequest(doc, {
        adminEmail: emailById.get(doc.adminId.toString()),
        includeSecrets: true,
      })
    );
  }

  async attachRequest(
    id: mongoose.Types.ObjectId,
    reviewerId: mongoose.Types.ObjectId,
    input: AttachDedicatedRequestInput
  ): Promise<DedicatedServerResponse> {
    const doc = await DedicatedServerRequestModel.findById(id);
    if (!doc) throw new NotFoundError('Dedicated server request not found.');
    if (doc.status !== 'provisioning') {
      throw new ValidationError('Only provisioning requests can be attached.');
    }

    doc.ipAddress = input.ipAddress.trim();
    doc.hostname = input.hostname?.trim() || undefined;
    doc.username = input.username.trim();
    doc.password = encrypt(input.password);
    doc.protocol = input.protocol;
    doc.status = 'active';
    doc.attachedAt = new Date();
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    await doc.save();

    await this.notifyRequester(
      doc.adminId,
      'Dedicated server is ready',
      `Your ${doc.planName} dedicated server is now available in My Servers.`,
      { requestId: doc._id.toString(), event: 'attached' }
    );

    return this.toRequest(doc, { includeSecrets: true });
  }

  async rejectRequest(
    id: mongoose.Types.ObjectId,
    reviewerId: mongoose.Types.ObjectId,
    reason: string
  ): Promise<DedicatedServerResponse> {
    const doc = await DedicatedServerRequestModel.findById(id);
    if (!doc) throw new NotFoundError('Dedicated server request not found.');
    if (doc.status === 'active' || doc.status === 'rejected' || doc.status === 'cancelled') {
      throw new ValidationError('This request cannot be rejected in its current state.');
    }

    const shouldRefund = doc.walletDebited && (doc.chargedAmount ?? 0) > 0;
    const refundAmount = Number(doc.chargedAmount ?? 0);

    doc.status = 'rejected';
    doc.rejectionReason = reason;
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    await doc.save();

    if (shouldRefund) {
      await adminBillingService.refundCloudRequestCharge(
        doc.adminId.toString(),
        refundAmount,
        doc._id.toString()
      );
    }

    await this.notifyRequester(
      doc.adminId,
      'Dedicated server request rejected',
      shouldRefund
        ? `Your request for ${doc.planName} was rejected and ₹${refundAmount} was refunded: ${reason}`
        : `Your request for ${doc.planName} was rejected: ${reason}`,
      {
        requestId: doc._id.toString(),
        event: 'rejected',
        reason,
        refunded: shouldRefund,
      }
    );

    return this.toRequest(doc, { includeSecrets: true });
  }
}

export const dedicatedServerService = new DedicatedServerService();
