import mongoose from 'mongoose';
import {
  CatalogVmModel,
  type ICatalogVm,
  type VmCatalogStatus,
} from '../../models/catalogVm.model';
import { VmCatalogPlan } from '../../models/vmCatalogPlan.model';
import { User } from '../../models/user.model';
import { TenantUser } from '../../models/tenantUser.model';
import { TenantNotification } from '../../models/tenantNotification.model';
import { Notification } from '../notification/notification.model';
import { adminBillingService } from '../adminBilling/adminBilling.service';
import { walletService } from '../wallet/wallet.service';
import { externalVmPricingService } from '../externalVmPricing/externalVmPricing.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { encrypt, decrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { callCatalogAgentPurchase, callCatalogAgentScrape } from './catalogAgentClient';
import type { CatalogAgentError } from './catalogAgentClient';
import {
  selectProvider as resellerSelect,
  provisionVm as resellerProvision,
  terminateVm as resellerTerminate,
} from './resellerClient';
import {
  stripProviderLeakFields,
  resolveDurationDays,
  specsToCanonicalSpec,
  computeExpiresAt,
  isAutoCloudProvider,
  type CatalogVmCallerRole,
} from './catalogVmSerializer';
import { guacamoleClient } from '../../utils/guacamoleClient';
import type {
  CatalogVmOverview,
  CatalogVmRequesterGroup,
  CatalogVmResponse,
  CreateCatalogVmRequestDto,
} from './vmCatalog.types';

const GST_RATE = 0.18;
const BILLING_PERIODS = ['hourly', 'monthly', 'quarterly', 'yearly'] as const;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CatalogVmConsoleSession {
  protocol: 'rdp' | 'ssh';
  clientUrl: string;
  connectionId: string;
}

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
    opts?: {
      adminEmail?: string;
      includeSecrets?: boolean;
      forAdmin?: boolean;
      role?: CatalogVmCallerRole;
    }
  ): CatalogVmResponse {
    const includeSecrets = Boolean(opts?.includeSecrets);
    const forAdmin = Boolean(opts?.forAdmin);
    const status = forAdmin ? this.adminDisplayStatus(doc.status) : doc.status;
    const showConnection = includeSecrets || doc.status === 'active';
    const role = opts?.role ?? (forAdmin ? 'admin' : 'super_admin');

    const base: CatalogVmResponse = {
      _id: doc._id.toString(),
      ...(doc.adminId ? { adminId: doc.adminId.toString() } : {}),
      ...(doc.tenantId ? { tenantId: doc.tenantId.toString() } : {}),
      ...(doc.tenantUserId ? { tenantUserId: doc.tenantUserId.toString() } : {}),
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
      ...(doc.region ? { region: doc.region } : {}),
      ...(doc.providerInstanceId ? { providerInstanceId: doc.providerInstanceId } : {}),
      ...(doc.expiresAt ? { expiresAt: doc.expiresAt.toISOString() } : {}),
      autoProvisioned: Boolean(doc.autoProvisioned),
      ...(doc.rawProviderCostPerHr != null
        ? { rawProviderCostPerHr: doc.rawProviderCostPerHr }
        : {}),
      ...(doc.attachedAt ? { attachedAt: doc.attachedAt.toISOString() } : {}),
      ...(doc.rejectionReason ? { rejectionReason: doc.rejectionReason } : {}),
      ...(doc.reviewedBy ? { reviewedBy: doc.reviewedBy.toString() } : {}),
      ...(doc.reviewedAt ? { reviewedAt: doc.reviewedAt.toISOString() } : {}),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };

    return stripProviderLeakFields(base, role);
  }

  private async notifySuperAdminsOfRequest(
    doc: ICatalogVm,
    requesterEmail: string,
    opts?: { tenantId?: string }
  ): Promise<void> {
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
    const message = `${requesterEmail} paid ₹${doc.pricingSnapshot.total} for ${doc.quantity}× ${doc.planName} (${doc.billing}). Status: provisioning.`;
    const requestId = doc._id.toString();
    const actionUrl = opts?.tenantId
      ? `/super-admin-console/webyne-vm-requests`
      : `/super-admin-console/webyne-vm-requests/${doc.adminId?.toString() ?? ''}`;

    const results = await Promise.allSettled(
      superAdmins.map((admin) =>
        Notification.create({
          userId: admin._id,
          type: 'catalog_vm_request',
          title,
          message,
          severity: 'info',
          read: false,
          actionUrl,
          metadata: {
            jobId: requestId,
            requestId,
            ...(doc.adminId ? { adminId: doc.adminId.toString() } : {}),
            ...(doc.tenantId ? { tenantId: doc.tenantId.toString() } : {}),
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

    const plan = await VmCatalogPlan.findById(dto.planId).lean();
    if (!plan || !plan.isActive) {
      throw new ValidationError('Selected template is not available.');
    }

    const billing = String(dto.billing || '').toLowerCase();
    if (!BILLING_PERIODS.includes(billing as (typeof BILLING_PERIODS)[number])) {
      throw new ValidationError('Invalid billing cycle.');
    }

    const baseUnit = Number(plan[billing as (typeof BILLING_PERIODS)[number]]);
    if (!Number.isFinite(baseUnit) || baseUnit <= 0) {
      throw new ValidationError('Selected billing cycle is not priced for this template.');
    }

    const pricingCfg = await externalVmPricingService.getByProvider('webyne');
    const multiplierRaw = Number(pricingCfg.categories[dto.category]?.multiplier);
    const multiplier =
      Number.isFinite(multiplierRaw) && multiplierRaw > 0 ? multiplierRaw : 1;

    const quantity = Math.max(1, Math.floor(Number(dto.quantity) || 1));
    const unitPrice = roundMoney(baseUnit * multiplier);
    const subtotal = roundMoney(unitPrice * quantity);
    const tax = roundMoney(subtotal * GST_RATE);
    const total = roundMoney(subtotal + tax);

    if (!Number.isFinite(total) || total <= 0) {
      throw new ValidationError('Invalid purchase total.');
    }

    const durationDays = resolveDurationDays(dto.billing, dto.durationDays);
    const canonicalSpec =
      dto.canonicalSpec || specsToCanonicalSpec(dto.specs, dto.category);

    let selection: Awaited<ReturnType<typeof resellerSelect>>;
    try {
      selection = await resellerSelect({
        canonicalSpec,
        category: dto.category,
        durationDays,
        specs: dto.specs,
      });
    } catch (err) {
      logger.warn('[VmCatalog] Reseller select failed — falling back to webyne', {
        error: err instanceof Error ? err.message : String(err),
      });
      selection = {
        provider: 'webyne',
        region: null,
        category: dto.category,
        canonicalSpec,
        rawTotalPricePerHr: null,
        autoProvisioned: false,
        reason: 'select_error_fallback',
      };
    }

    const autoProvisioned =
      Boolean(selection.autoProvisioned) && isAutoCloudProvider(selection.provider);
    const provider = autoProvisioned ? selection.provider : 'webyne';

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
        provider,
        category: dto.category,
        planId: plan._id.toString(),
        planName: plan.name,
        specs: {
          cpu: `${plan.vcpu} vCPU`,
          ram: `${plan.ramGb} GB`,
          disk: `${plan.ssdGb} GB SSD`,
        },
        billing,
        quantity,
        template: dto.template,
        pricingSnapshot: {
          currency: plan.currency || dto.pricingSnapshot.currency || 'INR',
          subtotal,
          tax,
          total,
          billingLabel: 'GST 18%',
        },
        status: 'provisioning',
        chargedAmount: total,
        walletDebited: true,
        autoProvisioned,
        ...(selection.region ? { region: selection.region } : {}),
        ...(selection.rawTotalPricePerHr != null
          ? { rawProviderCostPerHr: selection.rawTotalPricePerHr }
          : {}),
        ...(autoProvisioned ? { expiresAt: computeExpiresAt(durationDays) } : {}),
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

    if (autoProvisioned) {
      try {
        const provisioned = await resellerProvision({
          provider: selection.provider,
          region: selection.region,
          category: dto.category,
          canonicalSpec: selection.canonicalSpec || canonicalSpec,
          catalogVmId: doc._id.toString(),
        });

        doc.status = 'active';
        doc.providerInstanceId = provisioned.providerInstanceId;
        doc.region = provisioned.region || selection.region || undefined;
        doc.hostname = provisioned.hostname || provisioned.ip || undefined;
        doc.ipAddress = provisioned.ip || undefined;
        doc.username = provisioned.username;
        doc.password = encrypt(provisioned.password);
        doc.protocol = provisioned.protocol;
        doc.providerPurchased = true;
        doc.attachedAt = new Date();
        doc.updatedAt = new Date();
        await doc.save();

        await this.notifyRequester(
          adminId,
          'Cloud VM is ready',
          `Your ${doc.quantity}× ${doc.planName} purchase (₹${total}) is active.`,
          {
            requestId: doc._id.toString(),
            event: 'active',
            planName: doc.planName,
            total,
          }
        );

        logger.info('[VmCatalog] Auto-provisioned catalog VM', {
          requestId: doc._id.toString(),
          provider: doc.provider,
          region: doc.region,
        });

        return this.toResponse(doc, { adminEmail: admin.email, role: 'admin', forAdmin: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        doc.status = 'failed';
        doc.fulfillError = message;
        doc.updatedAt = new Date();
        await doc.save();

        await adminBillingService
          .refundCloudRequestCharge(adminId.toString(), total, doc._id.toString())
          .catch((refundErr: unknown) => {
            logger.error('[VmCatalog] Refund after auto-provision failure failed', {
              requestId: doc._id.toString(),
              error: refundErr instanceof Error ? refundErr.message : String(refundErr),
            });
          });

        if (doc.walletDebited) {
          doc.walletDebited = false;
          await doc.save().catch(() => undefined);
        }

        await this.notifyRequester(
          adminId,
          'Cloud VM provisioning failed',
          `Your ${doc.planName} purchase failed and was refunded. ${message}`,
          {
            requestId: doc._id.toString(),
            event: 'failed',
            planName: doc.planName,
            total,
          }
        );

        logger.error('[VmCatalog] Auto-provision failed', {
          requestId: doc._id.toString(),
          error: message,
        });

        return this.toResponse(doc, { adminEmail: admin.email, role: 'admin', forAdmin: true });
      }
    }

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
      provider: doc.provider,
      autoProvisioned: false,
    });

    return this.toResponse(doc, { adminEmail: admin.email, role: 'admin', forAdmin: true });
  }

  async listForAdmin(adminId: mongoose.Types.ObjectId): Promise<CatalogVmResponse[]> {
    const docs = await CatalogVmModel.find({ adminId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc, { forAdmin: true, role: 'admin' }));
  }

  /** Admin: single owned VM (for console toolbar name, etc.). */
  async getForAdmin(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    return this.toResponse(doc, { forAdmin: true });
  }

  /**
   * Admin Guacamole console — same path as Elastic Servers (IP + creds).
   * Only active catalog VMs with connection details.
   */
  async openConsole(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    dimensions?: { width?: number; height?: number }
  ): Promise<CatalogVmConsoleSession> {
    const doc = await this.findOwnedByAdmin(id, adminId);

    if (doc.status !== 'active') {
      throw new ValidationError('Console is only available after the VM is attached (active).');
    }
    if (!doc.ipAddress) {
      throw new ValidationError('This VM has no IP address for console access.');
    }
    if (!doc.password) {
      throw new ValidationError('This VM has no password for console access.');
    }

    const protocol = doc.protocol || (doc.category === 'windows' ? 'rdp' : 'ssh');
    const username = doc.username || (protocol === 'rdp' ? 'Administrator' : 'root');
    let password: string;
    try {
      password = decrypt(doc.password);
    } catch {
      throw new ValidationError('Stored password could not be decrypted for console access.');
    }

    const port = protocol === 'rdp' ? 3389 : 22;

    logger.info('[VmCatalog] Opening Guacamole session', {
      catalogVmId: doc._id.toString(),
      protocol,
      hostname: doc.ipAddress,
    });

    const session = await guacamoleClient.openConsole(
      `catalogvm-${doc._id.toString()}`,
      protocol,
      {
        hostname: doc.ipAddress,
        port,
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

  private async findOwnedByAdmin(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<ICatalogVm> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) throw new NotFoundError('Catalog VM not found.');
    if (!doc.adminId || doc.adminId.toString() !== adminId.toString()) {
      throw new ForbiddenError('You do not have permission to access this catalog VM.');
    }
    return doc;
  }

  private async notifyOwner(
    doc: ICatalogVm,
    title: string,
    message: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (doc.adminId) {
      await this.notifyRequester(doc.adminId, title, message, metadata);
      return;
    }
    if (doc.tenantId && doc.tenantUserId) {
      await this.notifyTenantRequester(doc.tenantId, doc.tenantUserId, title, message, metadata);
    }
  }

  private async refundOwner(doc: ICatalogVm, amount: number): Promise<void> {
    if (doc.adminId) {
      await adminBillingService.refundCloudRequestCharge(
        doc.adminId.toString(),
        amount,
        doc._id.toString()
      );
      return;
    }
    if (doc.tenantId) {
      await walletService.creditWallet(
        doc.tenantId.toString(),
        amount,
        'catalog_vm_purchase_refund',
        { relatedVmId: doc._id.toString() }
      );
    }
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
      recent: recentDocs.map((doc) => this.toResponse(doc, { forAdmin: true, role: 'admin' })),
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

      const adminIds = [
        ...new Set(
          openDocs
            .map((d) => d.adminId?.toString())
            .filter((id): id is string => Boolean(id))
        ),
      ];
      const admins = await User.find({
        _id: { $in: adminIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select('email')
        .lean();
      const emailById = new Map(admins.map((a) => [a._id.toString(), a.email]));

      for (const doc of openDocs) {
        const requestId = doc._id.toString();
        const requesterLabel = doc.adminId
          ? emailById.get(doc.adminId.toString()) ?? 'Admin'
          : 'Tenant';
        const actionUrl = doc.adminId
          ? `/super-admin-console/webyne-vm-requests/${doc.adminId.toString()}`
          : '/super-admin-console/webyne-vm-requests';
        for (const sa of superAdmins) {
          const exists = await Notification.exists({
            userId: sa._id,
            type: 'catalog_vm_request',
            'metadata.requestId': requestId,
          });
          if (exists) continue;

          await Notification.create({
            userId: sa._id,
            type: 'catalog_vm_request',
            title: 'Webyne VM request — provisioning',
            message: `${requesterLabel} paid ₹${doc.pricingSnapshot.total} for ${doc.quantity}× ${doc.planName} (${doc.billing}). Status: ${doc.status}.`,
            severity: 'info',
            read: false,
            actionUrl,
            metadata: {
              jobId: requestId,
              requestId,
              ...(doc.adminId ? { adminId: doc.adminId.toString() } : {}),
              ...(doc.tenantId ? { tenantId: doc.tenantId.toString() } : {}),
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
      { $match: { adminId: { $exists: true, $ne: null } } },
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
    const adminIds = [
      ...new Set(
        docs.map((d) => d.adminId?.toString()).filter((id): id is string => Boolean(id))
      ),
    ];
    const admins = await User.find({
      _id: { $in: adminIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('email')
      .lean();
    const emailById = new Map(admins.map((a) => [a._id.toString(), a.email]));

    return docs.map((doc) =>
      this.toResponse(doc, {
        adminEmail: doc.adminId ? emailById.get(doc.adminId.toString()) : undefined,
        includeSecrets: true,
        role: 'super_admin',
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
    if (doc.autoProvisioned) {
      throw new ValidationError(
        'Auto-provisioned catalog VMs do not use the manual Webyne approve flow.'
      );
    }
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

    return this.toResponse(doc, { includeSecrets: true, role: 'super_admin' });
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

    return this.toResponse(doc, { includeSecrets: true, role: 'super_admin' });
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

    await this.notifyOwner(
      doc,
      'Webyne VM is ready',
      `Your ${doc.quantity}× ${doc.planName} VM is now available in My VM.`,
      {
        requestId: doc._id.toString(),
        event: 'attached',
      }
    );

    return this.toResponse(doc, { includeSecrets: true, role: 'super_admin' });
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
      await this.refundOwner(doc, refundAmount);
    }

    await this.notifyOwner(
      doc,
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

    return this.toResponse(doc, { includeSecrets: true, role: 'super_admin' });
  }

  /**
   * Terminate an expired auto-provisioned catalog VM via the reseller service.
   */
  async terminateExpiredCatalogVm(doc: ICatalogVm): Promise<void> {
    if (!doc.autoProvisioned || doc.status !== 'active') {
      return;
    }
    if (!doc.providerInstanceId || !isAutoCloudProvider(doc.provider)) {
      doc.status = 'terminated';
      doc.updatedAt = new Date();
      await doc.save();
      return;
    }

    try {
      await resellerTerminate({
        provider: doc.provider,
        region: doc.region,
        providerInstanceId: doc.providerInstanceId,
      });
    } catch (err) {
      logger.error('[VmCatalog] Reseller terminate failed', {
        requestId: doc._id.toString(),
        provider: doc.provider,
        error: err instanceof Error ? err.message : String(err),
      });
      // Still mark terminated locally so we do not loop forever; ops can clean up.
    }

    doc.status = 'terminated';
    doc.updatedAt = new Date();
    await doc.save();

    await this.notifyOwner(
      doc,
      'Cloud VM expired',
      `Your ${doc.planName} VM reached its expiry and was terminated.`,
      {
        requestId: doc._id.toString(),
        event: 'expired',
        planName: doc.planName,
      }
    );
  }

  // ─── Tenant portal (white-label) ─────────────────────────────────────────

  private async findOwnedByTenant(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<ICatalogVm> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) throw new NotFoundError('Catalog VM not found.');
    if (!doc.tenantId || doc.tenantId.toString() !== tenantId.toString()) {
      throw new ForbiddenError('You do not have permission to access this catalog VM.');
    }
    return doc;
  }

  private async notifyTenantRequester(
    tenantId: mongoose.Types.ObjectId,
    tenantUserId: mongoose.Types.ObjectId,
    title: string,
    message: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      await TenantNotification.create({
        tenantId,
        tenantUserId,
        type: 'catalog_vm_request',
        title,
        message,
        severity: metadata['event'] === 'rejected' ? 'warning' : 'info',
        read: false,
        metadata,
      });
    } catch (err: unknown) {
      logger.error('[VmCatalog] Failed to notify tenant requester', {
        tenantId: tenantId.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async createRequestForTenant(
    dto: CreateCatalogVmRequestDto,
    tenantId: mongoose.Types.ObjectId,
    tenantUserId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const tenantUser = await TenantUser.findById(tenantUserId).select('email role isActive tenantId').lean();
    if (
      !tenantUser ||
      tenantUser.role !== 'tenant_admin' ||
      !tenantUser.isActive ||
      tenantUser.tenantId.toString() !== tenantId.toString()
    ) {
      throw new ForbiddenError('Only active tenant admins can submit catalog VM requests.');
    }

    const plan = await VmCatalogPlan.findById(dto.planId).lean();
    if (!plan || !plan.isActive) {
      throw new ValidationError('Selected template is not available.');
    }

    const billing = String(dto.billing || '').toLowerCase();
    if (!BILLING_PERIODS.includes(billing as (typeof BILLING_PERIODS)[number])) {
      throw new ValidationError('Invalid billing cycle.');
    }

    const baseUnit = Number(plan[billing as (typeof BILLING_PERIODS)[number]]);
    if (!Number.isFinite(baseUnit) || baseUnit <= 0) {
      throw new ValidationError('Selected billing cycle is not priced for this template.');
    }

    const pricingCfg = await externalVmPricingService.getByProvider('webyne');
    const multiplierRaw = Number(pricingCfg.categories[dto.category]?.multiplier);
    const multiplier =
      Number.isFinite(multiplierRaw) && multiplierRaw > 0 ? multiplierRaw : 1;

    const quantity = Math.max(1, Math.floor(Number(dto.quantity) || 1));
    const unitPrice = roundMoney(baseUnit * multiplier);
    const subtotal = roundMoney(unitPrice * quantity);
    const tax = roundMoney(subtotal * GST_RATE);
    const total = roundMoney(subtotal + tax);

    if (!Number.isFinite(total) || total <= 0) {
      throw new ValidationError('Invalid purchase total.');
    }

    await walletService.debitWallet(tenantId.toString(), total, 'catalog_vm_purchase');

    let doc: ICatalogVm;
    try {
      doc = await CatalogVmModel.create({
        tenantId,
        tenantUserId,
        provider: 'webyne',
        category: dto.category,
        planId: plan._id.toString(),
        planName: plan.name,
        specs: {
          cpu: `${plan.vcpu} vCPU`,
          ram: `${plan.ramGb} GB`,
          disk: `${plan.ssdGb} GB SSD`,
        },
        billing,
        quantity,
        template: dto.template,
        pricingSnapshot: {
          currency: plan.currency || dto.pricingSnapshot.currency || 'INR',
          subtotal,
          tax,
          total,
          billingLabel: 'GST 18%',
        },
        status: 'provisioning',
        chargedAmount: total,
        walletDebited: true,
      });
    } catch (err) {
      await walletService
        .creditWallet(tenantId.toString(), total, 'catalog_vm_purchase_refund')
        .catch(() => undefined);
      throw err;
    }

    await this.notifySuperAdminsOfRequest(doc, tenantUser.email, {
      tenantId: tenantId.toString(),
    });
    await this.notifyTenantRequester(
      tenantId,
      tenantUserId,
      'Webyne VM is provisioning',
      `Your ${doc.quantity}× ${doc.planName} purchase (₹${total}) was charged. It will be available soon.`,
      { requestId: doc._id.toString(), event: 'submitted', planName: doc.planName, total }
    );

    return this.toResponse(doc, { forAdmin: true });
  }

  async listForTenant(tenantId: mongoose.Types.ObjectId): Promise<CatalogVmResponse[]> {
    const docs = await CatalogVmModel.find({ tenantId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc, { forAdmin: true }));
  }

  async getOverviewForTenant(tenantId: mongoose.Types.ObjectId): Promise<CatalogVmOverview> {
    const [recentDocs, statsAgg] = await Promise.all([
      CatalogVmModel.find({ tenantId }).sort({ createdAt: -1 }).limit(5),
      CatalogVmModel.aggregate<{
        total: number;
        active: number;
        pending: number;
        linux: number;
        windows: number;
        gpu: number;
      }>([
        { $match: { tenantId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            pending: {
              $sum: { $cond: [{ $in: ['$status', PENDING_STATUSES] }, 1, 0] },
            },
            linux: { $sum: { $cond: [{ $eq: ['$category', 'linux'] }, 1, 0] } },
            windows: { $sum: { $cond: [{ $eq: ['$category', 'windows'] }, 1, 0] } },
            gpu: { $sum: { $cond: [{ $eq: ['$category', 'gpu'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const stats = statsAgg[0] ?? {
      total: 0,
      active: 0,
      pending: 0,
      linux: 0,
      windows: 0,
      gpu: 0,
    };

    return {
      stats,
      recent: recentDocs.map((doc) => this.toResponse(doc, { forAdmin: true })),
    };
  }

  async getForTenant(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const doc = await this.findOwnedByTenant(id, tenantId);
    return this.toResponse(doc, { forAdmin: true });
  }

  async openConsoleForTenant(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId,
    dimensions?: { width?: number; height?: number }
  ): Promise<CatalogVmConsoleSession> {
    const doc = await this.findOwnedByTenant(id, tenantId);
    if (doc.status !== 'active') {
      throw new ValidationError('Console is only available after the VM is attached (active).');
    }
    if (!doc.ipAddress || !doc.password) {
      throw new ValidationError('This VM has no connection details for console access.');
    }

    const protocol = doc.protocol || (doc.category === 'windows' ? 'rdp' : 'ssh');
    const username = doc.username || (protocol === 'rdp' ? 'Administrator' : 'root');
    const password = decrypt(doc.password);
    const port = protocol === 'rdp' ? 3389 : 22;

    const session = await guacamoleClient.openConsole(
      `catalogvm-${doc._id.toString()}`,
      protocol,
      {
        hostname: doc.ipAddress,
        port,
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
}

export const vmCatalogService = new VmCatalogService();
