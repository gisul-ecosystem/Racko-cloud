import mongoose from 'mongoose';
import {
  CatalogVmModel,
  type ICatalogVm,
  type VmCatalogStatus,
} from '../../models/catalogVm.model';
import { User } from '../../models/user.model';
import { Notification } from '../notification/notification.model';
import { adminBillingService } from '../adminBilling/adminBilling.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { encrypt, decrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { callCatalogAgentPurchase, callCatalogAgentScrape } from './catalogAgentClient';
import type { CatalogAgentError } from './catalogAgentClient';
import type {
  CatalogVmOverview,
  CatalogVmRequesterGroup,
  CatalogVmResponse,
  CreateCatalogVmRequestDto,
} from './vmCatalog.types';

const PENDING_STATUSES: VmCatalogStatus[] = [
  'pending_approval',
  'approved',
  'provisioning',
  'fulfilling',
  'ready_to_attach',
  'failed',
];

/** Statuses that still need super-admin attention on requester cards. */
const OPEN_FOR_SUPER_ADMIN: VmCatalogStatus[] = [
  'pending_approval',
  'provisioning',
  'fulfilling',
  'ready_to_attach',
  'failed',
];

class VmCatalogService {
  private adminDisplayStatus(status: VmCatalogStatus): VmCatalogStatus {
    if (status === 'ready_to_attach' || status === 'fulfilling') return 'provisioning';
    return status;
  }

  private toResponse(
    doc: ICatalogVm,
    opts?: { adminEmail?: string; includeSecrets?: boolean; forAdmin?: boolean }
  ): CatalogVmResponse {
    const includeSecrets = Boolean(opts?.includeSecrets);
    const forAdmin = Boolean(opts?.forAdmin);
    const status = forAdmin ? this.adminDisplayStatus(doc.status) : doc.status;
    const showConnection = includeSecrets || doc.status === 'active';

    return {
      _id: doc._id.toString(),
      adminId: doc.adminId.toString(),
      ...(opts?.adminEmail ? { adminEmail: opts.adminEmail } : {}),
      provider: doc.provider,
      category: doc.category,
      planId: doc.planId,
      planName: doc.planName,
      specs: doc.specs ?? {},
      billing: doc.billing,
      quantity: doc.quantity,
      template: doc.template,
      pricingSnapshot: doc.pricingSnapshot,
      status,
      displayStatus: status,
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
      ...(showConnection && doc.externalRef ? { externalRef: doc.externalRef } : {}),
      ...(!forAdmin && doc.fulfillError ? { fulfillError: doc.fulfillError } : {}),
      providerPurchased: Boolean(doc.providerPurchased),
      ...(doc.attachedAt ? { attachedAt: doc.attachedAt.toISOString() } : {}),
      ...(doc.rejectionReason ? { rejectionReason: doc.rejectionReason } : {}),
      ...(doc.reviewedBy ? { reviewedBy: doc.reviewedBy.toString() } : {}),
      ...(doc.reviewedAt ? { reviewedAt: doc.reviewedAt.toISOString() } : {}),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private async notifySuperAdminsOfRequest(doc: ICatalogVm, adminEmail: string): Promise<void> {
    const superAdmins = await User.find({ role: 'super_admin', isActive: true })
      .select('_id')
      .lean();

    if (superAdmins.length === 0) {
      logger.warn('[VmCatalog] No active super_admins to notify for catalog VM request', {
        requestId: doc._id.toString(),
      });
      return;
    }

    const title = 'Webyne VM request — provisioning';
    const message = `${adminEmail} paid ₹${doc.pricingSnapshot.total} for ${doc.quantity}× ${doc.planName} (${doc.billing}). Status: provisioning.`;
    const requestId = doc._id.toString();

    const results = await Promise.allSettled(
      superAdmins.map((admin) =>
        Notification.create({
          userId: admin._id,
          type: 'catalog_vm_request',
          title,
          message,
          severity: 'info',
          read: false,
          actionUrl: `/super-admin-console/webyne-vm-requests/${doc.adminId.toString()}`,
          metadata: {
            // Unique index: { userId, metadata.jobId, metadata.event } — must be unique per request
            jobId: requestId,
            requestId,
            adminId: doc.adminId.toString(),
            event: 'catalog_provisioning',
            planName: doc.planName,
            quantity: doc.quantity,
            total: doc.pricingSnapshot.total,
          },
        })
      )
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error('[VmCatalog] Failed to create catalog VM request notification', {
          requestId,
          userId: superAdmins[index]?._id?.toString(),
          error:
            result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  }

  private async notifyRequester(
    adminId: mongoose.Types.ObjectId,
    title: string,
    message: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const requestId =
      typeof metadata['requestId'] === 'string' ? metadata['requestId'] : adminId.toString();
    const event =
      typeof metadata['event'] === 'string' ? metadata['event'] : 'catalog_update';

    try {
      await Notification.create({
        userId: adminId,
        type: 'catalog_vm_request',
        title,
        message,
        severity: metadata['event'] === 'rejected' ? 'warning' : 'success',
        read: false,
        actionUrl: '/console/create-vm/my-vms',
        metadata: {
          ...metadata,
          // Unique index requires distinct jobId+event per user
          jobId: `${requestId}:${event}`,
          requestId,
          event: `catalog_${event}`,
        },
      });
    } catch (err: unknown) {
      logger.error('[VmCatalog] Failed to notify catalog VM requester', {
        adminId: adminId.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async createRequest(
    dto: CreateCatalogVmRequestDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const admin = await User.findById(adminId).select('email role isActive').lean();
    if (!admin || admin.role !== 'admin' || !admin.isActive) {
      throw new ForbiddenError('Only active admins can submit catalog VM requests.');
    }

    const total = Number(dto.pricingSnapshot.total);
    if (!Number.isFinite(total) || total <= 0) {
      throw new ValidationError('Invalid purchase total.');
    }

    // Debit wallet first — fails with INSUFFICIENT_BALANCE if too low.
    await adminBillingService.debitWallet(
      adminId.toString(),
      total,
      null,
      'catalog_vm_purchase'
    );

    let doc: ICatalogVm;
    try {
      doc = await CatalogVmModel.create({
        adminId,
        provider: 'webyne',
        category: dto.category,
        planId: dto.planId,
        planName: dto.planName,
        specs: dto.specs ?? {},
        billing: dto.billing,
        quantity: dto.quantity,
        template: dto.template,
        pricingSnapshot: {
          currency: dto.pricingSnapshot.currency || 'INR',
          subtotal: dto.pricingSnapshot.subtotal,
          tax: dto.pricingSnapshot.tax,
          total,
          billingLabel: dto.pricingSnapshot.billingLabel,
        },
        status: 'provisioning',
        chargedAmount: total,
        walletDebited: true,
      });
    } catch (err) {
      await adminBillingService
        .refundCloudRequestCharge(adminId.toString(), total, null)
        .catch((refundErr: unknown) => {
          logger.error('[VmCatalog] Wallet debit rollback failed after create error', {
            adminId: adminId.toString(),
            total,
            error: refundErr instanceof Error ? refundErr.message : String(refundErr),
          });
        });
      throw err;
    }

    // Link debit txn to this request id
    await adminBillingService.patchLatestTransactionJobId(adminId.toString(), doc._id.toString());

    await this.notifySuperAdminsOfRequest(doc, admin.email);
    await this.notifyRequester(
      adminId,
      'Webyne VM is provisioning',
      `Your ${doc.quantity}× ${doc.planName} purchase (₹${total}) was charged. It will be available soon.`,
      {
        requestId: doc._id.toString(),
        event: 'submitted',
        planName: doc.planName,
        total,
      }
    );

    logger.info('[VmCatalog] Request created and wallet charged', {
      requestId: doc._id.toString(),
      adminId: adminId.toString(),
      planName: doc.planName,
      chargedAmount: total,
    });

    return this.toResponse(doc, { adminEmail: admin.email });
  }

  async listForAdmin(adminId: mongoose.Types.ObjectId): Promise<CatalogVmResponse[]> {
    const docs = await CatalogVmModel.find({ adminId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc, { forAdmin: true }));
  }

  async getOverview(adminId: mongoose.Types.ObjectId): Promise<CatalogVmOverview> {
    const [recentDocs, statsAgg] = await Promise.all([
      CatalogVmModel.find({ adminId }).sort({ createdAt: -1 }).limit(5),
      CatalogVmModel.aggregate<{
        total: number;
        active: number;
        pending: number;
        linux: number;
        windows: number;
        gpu: number;
      }>([
        { $match: { adminId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
            },
            pending: {
              $sum: {
                $cond: [{ $in: ['$status', PENDING_STATUSES] }, 1, 0],
              },
            },
            linux: {
              $sum: { $cond: [{ $eq: ['$category', 'linux'] }, 1, 0] },
            },
            windows: {
              $sum: { $cond: [{ $eq: ['$category', 'windows'] }, 1, 0] },
            },
            gpu: {
              $sum: { $cond: [{ $eq: ['$category', 'gpu'] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const statsRow = statsAgg[0];

    return {
      stats: {
        total: statsRow?.total ?? 0,
        active: statsRow?.active ?? 0,
        pending: statsRow?.pending ?? 0,
        linux: statsRow?.linux ?? 0,
        windows: statsRow?.windows ?? 0,
        gpu: statsRow?.gpu ?? 0,
      },
      recent: recentDocs.map((doc) => this.toResponse(doc, { forAdmin: true })),
    };
  }

  /**
   * Older Buy Now calls may have failed notification inserts (unique index without jobId).
   * Backfill missing catalog_vm_request notifications for open requests.
   */
  private async ensureSuperAdminNotificationsForOpenRequests(): Promise<void> {
    try {
      const openDocs = await CatalogVmModel.find({
        status: { $in: OPEN_FOR_SUPER_ADMIN },
      })
        .sort({ createdAt: -1 })
        .limit(50);

      if (openDocs.length === 0) return;

      const superAdmins = await User.find({ role: 'super_admin', isActive: true })
        .select('_id')
        .lean();
      if (superAdmins.length === 0) return;

      const adminIds = [...new Set(openDocs.map((d) => d.adminId.toString()))];
      const admins = await User.find({
        _id: { $in: adminIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select('email')
        .lean();
      const emailById = new Map(admins.map((a) => [a._id.toString(), a.email]));

      for (const doc of openDocs) {
        const requestId = doc._id.toString();
        for (const sa of superAdmins) {
          const exists = await Notification.exists({
            userId: sa._id,
            type: 'catalog_vm_request',
            'metadata.requestId': requestId,
          });
          if (exists) continue;

          const adminEmail = emailById.get(doc.adminId.toString()) ?? 'Admin';
          await Notification.create({
            userId: sa._id,
            type: 'catalog_vm_request',
            title: 'Webyne VM request — provisioning',
            message: `${adminEmail} paid ₹${doc.pricingSnapshot.total} for ${doc.quantity}× ${doc.planName} (${doc.billing}). Status: ${doc.status}.`,
            severity: 'info',
            read: false,
            actionUrl: `/super-admin-console/webyne-vm-requests/${doc.adminId.toString()}`,
            metadata: {
              jobId: requestId,
              requestId,
              adminId: doc.adminId.toString(),
              event: 'catalog_provisioning',
              planName: doc.planName,
              quantity: doc.quantity,
              total: doc.pricingSnapshot.total,
            },
          }).catch((err: unknown) => {
            logger.warn('[VmCatalog] Backfill notification failed', {
              requestId,
              userId: sa._id.toString(),
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    } catch (err: unknown) {
      logger.warn('[VmCatalog] ensureSuperAdminNotificationsForOpenRequests failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Super-admin: one card per requesting admin with pending/total counts. */
  async listRequesterGroups(): Promise<CatalogVmRequesterGroup[]> {
    // Repair: ensure open requests have super-admin notifications (older buys may have missed them)
    await this.ensureSuperAdminNotificationsForOpenRequests();

    const groups = await CatalogVmModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      pendingCount: number;
      totalCount: number;
      lastRequestedAt: Date | null;
    }>([
      {
        $group: {
          _id: '$adminId',
          pendingCount: {
            $sum: {
              $cond: [
                {
                  $in: ['$status', OPEN_FOR_SUPER_ADMIN],
                },
                1,
                0,
              ],
            },
          },
          totalCount: { $sum: 1 },
          lastRequestedAt: { $max: '$createdAt' },
        },
      },
      { $sort: { pendingCount: -1, lastRequestedAt: -1 } },
    ]);

    if (groups.length === 0) return [];

    const adminIds = groups.map((g) => g._id);
    const admins = await User.find({ _id: { $in: adminIds } })
      .select('email')
      .lean();
    const emailById = new Map(admins.map((a) => [a._id.toString(), a.email]));

    return groups.map((g) => ({
      adminId: g._id.toString(),
      adminEmail: emailById.get(g._id.toString()) ?? g._id.toString(),
      pendingCount: g.pendingCount,
      totalCount: g.totalCount,
      lastRequestedAt: g.lastRequestedAt ? g.lastRequestedAt.toISOString() : null,
    }));
  }

  async listRequestsForSuperAdmin(opts: {
    status?: VmCatalogStatus | 'all';
    adminId?: mongoose.Types.ObjectId;
  }): Promise<CatalogVmResponse[]> {
    const filter: Record<string, unknown> = {};
    if (opts.adminId) filter.adminId = opts.adminId;
    if (opts.status && opts.status !== 'all') filter.status = opts.status;

    const docs = await CatalogVmModel.find(filter).sort({ createdAt: -1 });
    const adminIds = [...new Set(docs.map((d) => d.adminId.toString()))];
    const admins = await User.find({
      _id: { $in: adminIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('email')
      .lean();
    const emailById = new Map(admins.map((a) => [a._id.toString(), a.email]));

    return docs.map((doc) =>
      this.toResponse(doc, {
        adminEmail: emailById.get(doc.adminId.toString()),
        includeSecrets: true,
      })
    );
  }

  /**
   * Super-admin Approve: start Webyne fulfill (Playwright) asynchronously.
   * When done, status becomes ready_to_attach (secrets visible only to super-admin).
   */
  async approveRequest(
    id: mongoose.Types.ObjectId,
    reviewerId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) throw new NotFoundError('Catalog VM request not found.');
    if (
      doc.status !== 'pending_approval' &&
      doc.status !== 'provisioning' &&
      doc.status !== 'failed'
    ) {
      throw new ValidationError(
        'Only provisioning or failed requests can be approved for fulfillment.'
      );
    }

    doc.status = 'fulfilling';
    doc.fulfillError = undefined;
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    doc.updatedAt = new Date();
    await doc.save();

    void this.runFulfillment(doc._id);

    return this.toResponse(doc, { includeSecrets: true });
  }

  private async runFulfillment(id: mongoose.Types.ObjectId): Promise<void> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) return;

    try {
      const result = await callCatalogAgentPurchase({
        category: doc.category,
        planId: doc.planId,
        planName: doc.planName,
        billing: doc.billing,
        template: doc.template.value,
        quantity: doc.quantity,
        scrapeOnly: Boolean(doc.providerPurchased),
      });

      const server = result.server;
      doc.hostname = server.hostname || undefined;
      doc.ipAddress = server.ipAddress || undefined;
      doc.username = server.username || undefined;
      if (server.password) {
        doc.password = encrypt(server.password);
      }
      doc.protocol = server.protocol || (doc.category === 'windows' ? 'rdp' : 'ssh');
      doc.externalRef = server.externalRef || undefined;
      doc.providerPurchased = doc.providerPurchased || Boolean(result.purchased);
      doc.fulfillError = undefined;
      doc.status = 'ready_to_attach';
      doc.updatedAt = new Date();
      await doc.save();

      logger.info('[VmCatalog] Fulfillment ready_to_attach', {
        requestId: id.toString(),
        ipAddress: doc.ipAddress,
        hostname: doc.hostname,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const agentErr = err as CatalogAgentError;
      // Checkout may have succeeded even when scrape failed — never buy again.
      if (agentErr.purchase?.ok || agentErr.code === 'SERVER_DETAILS_NOT_FOUND') {
        doc.providerPurchased = true;
      }
      logger.error('[VmCatalog] Fulfillment failed', {
        requestId: id.toString(),
        error: message,
        providerPurchased: doc.providerPurchased,
      });
      doc.status = 'failed';
      doc.fulfillError = message.slice(0, 500);
      doc.updatedAt = new Date();
      await doc.save().catch(() => undefined);
    }
  }

  /**
   * Super-admin Fetch details: scrape /admin/server only (no second purchase).
   * Use after Approve when checkout worked but scrape missed the DataTable.
   */
  async fetchRequestDetails(
    id: mongoose.Types.ObjectId,
    reviewerId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) throw new NotFoundError('Catalog VM request not found.');
    if (
      doc.status !== 'failed' &&
      doc.status !== 'ready_to_attach' &&
      doc.status !== 'provisioning' &&
      doc.status !== 'pending_approval'
    ) {
      throw new ValidationError(
        'Fetch details is only available for open or failed requests (not while fulfilling).'
      );
    }

    doc.status = 'fulfilling';
    doc.fulfillError = undefined;
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    doc.updatedAt = new Date();
    // Ensure retry uses scrape-only (VM already on Webyne)
    doc.providerPurchased = true;
    await doc.save();

    void this.runScrapeOnly(doc._id);

    return this.toResponse(doc, { includeSecrets: true });
  }

  private async runScrapeOnly(id: mongoose.Types.ObjectId): Promise<void> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) return;

    try {
      const result = await callCatalogAgentScrape({
        category: doc.category,
        planId: doc.planId,
        planName: doc.planName,
        billing: doc.billing,
        template: doc.template.value,
        quantity: doc.quantity,
        scrapeOnly: true,
      });

      const server = result.server;
      doc.hostname = server.hostname || undefined;
      doc.ipAddress = server.ipAddress || undefined;
      doc.username = server.username || undefined;
      if (server.password) {
        doc.password = encrypt(server.password);
      }
      doc.protocol = server.protocol || (doc.category === 'windows' ? 'rdp' : 'ssh');
      doc.externalRef = server.externalRef || undefined;
      doc.providerPurchased = true;
      doc.fulfillError = undefined;
      doc.status = 'ready_to_attach';
      doc.updatedAt = new Date();
      await doc.save();

      logger.info('[VmCatalog] Scrape ready_to_attach', {
        requestId: id.toString(),
        ipAddress: doc.ipAddress,
        externalRef: doc.externalRef,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[VmCatalog] Scrape failed', {
        requestId: id.toString(),
        error: message,
      });
      doc.providerPurchased = true;
      doc.status = 'failed';
      doc.fulfillError = message.slice(0, 500);
      doc.updatedAt = new Date();
      await doc.save().catch(() => undefined);
    }
  }

  /** Super-admin Attach: reveal VM to requesting admin as active. */
  async attachRequest(
    id: mongoose.Types.ObjectId,
    reviewerId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) throw new NotFoundError('Catalog VM request not found.');
    if (doc.status !== 'ready_to_attach') {
      throw new ValidationError(
        'Only requests with fetched provider details can be attached to the admin.'
      );
    }
    if (!doc.ipAddress && !doc.hostname) {
      throw new ValidationError('Cannot attach without hostname or IP from Webyne.');
    }

    doc.status = 'active';
    doc.attachedAt = new Date();
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    doc.updatedAt = new Date();
    await doc.save();

    await this.notifyRequester(
      doc.adminId,
      'Webyne VM is ready',
      `Your ${doc.quantity}× ${doc.planName} VM is now available in My VM.`,
      {
        requestId: doc._id.toString(),
        event: 'attached',
      }
    );

    return this.toResponse(doc, { includeSecrets: true });
  }

  async rejectRequest(
    id: mongoose.Types.ObjectId,
    reviewerId: mongoose.Types.ObjectId,
    reason: string
  ): Promise<CatalogVmResponse> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) throw new NotFoundError('Catalog VM request not found.');
    if (
      doc.status === 'active' ||
      doc.status === 'rejected' ||
      doc.status === 'cancelled' ||
      doc.status === 'fulfilling'
    ) {
      throw new ValidationError('This request cannot be rejected in its current state.');
    }

    const shouldRefund = doc.walletDebited && (doc.chargedAmount ?? doc.pricingSnapshot.total) > 0;
    const refundAmount = Number(doc.chargedAmount ?? doc.pricingSnapshot.total);

    doc.status = 'rejected';
    doc.rejectionReason = reason;
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    doc.updatedAt = new Date();
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
      'Webyne VM request rejected',
      shouldRefund
        ? `Your request for ${doc.quantity}× ${doc.planName} was rejected and ₹${refundAmount} was refunded: ${reason}`
        : `Your request for ${doc.quantity}× ${doc.planName} was rejected: ${reason}`,
      {
        requestId: doc._id.toString(),
        event: 'rejected',
        reason,
        refunded: shouldRefund,
      }
    );

    return this.toResponse(doc, { includeSecrets: true });
  }
}

export const vmCatalogService = new VmCatalogService();
