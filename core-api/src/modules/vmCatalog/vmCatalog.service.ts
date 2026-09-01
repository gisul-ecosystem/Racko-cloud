import mongoose from 'mongoose';
import {
  CatalogVmModel,
  type ICatalogVm,
  type VmCatalogStatus,
} from '../../models/catalogVm.model';
import { CatalogVmInstanceModel } from '../../models/catalogVmInstance.model';
import { VmCatalogPlan } from '../../models/vmCatalogPlan.model';
import { ProjectModel } from '../../models/project.model';
import { User } from '../../models/user.model';
import { TenantUser } from '../../models/tenantUser.model';
import { TenantNotification } from '../../models/tenantNotification.model';
import { Notification } from '../notification/notification.model';
import { adminBillingService } from '../adminBilling/adminBilling.service';
import { walletService } from '../wallet/wallet.service';
import { accountVmPricingService } from '../accountVmPricing/accountVmPricing.service';
import { projectsService } from '../projects/projects.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { encrypt, decrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import {
  callCatalogAgentPurchase,
  callCatalogAgentScrape,
  callCatalogAgentChangeOs,
  callCatalogAgentPower,
} from './catalogAgentClient';
import type { CatalogAgentError, CatalogPowerAction } from './catalogAgentClient';
import {
  type ResellerSelectResult,
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
import { customerDisplayName } from './vmCatalogPlan.service';
import { catalogPricingBucket, needsOsTemplateChange } from './webynePlanRouting';
import { SoftwareCatalogModel } from '../software-catalog/software-catalog.model';
import { resolveSoftwareIconUrl } from '../software-catalog/software-catalog.icons';
import { JobModel } from '../machine-manager/machine-manager.model';
import { randomUUID } from 'crypto';

const AGENT_ONLINE_WAIT_TIMEOUT_MS = 15 * 60 * 1000;
const AGENT_ONLINE_WAIT_POLL_MS = 4000;

const GST_RATE = 0.18;

function catalogCategoryToMachineOs(
  category: string
): 'windows' | 'linux' {
  return String(category).toLowerCase() === 'windows' ? 'windows' : 'linux';
}
const BILLING_PERIODS = ['hourly', 'monthly', 'quarterly', 'yearly'] as const;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Webyne manual attach flow — no reseller /api/select call on Buy Now. */
function defaultWebyneManualSelection(
  category: string,
  canonicalSpec: string
): ResellerSelectResult {
  return {
    provider: 'webyne',
    region: null,
    category,
    canonicalSpec,
    rawTotalPricePerHr: null,
    autoProvisioned: false,
    reason: 'webyne_manual_flow',
  };
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

const WINDOWS_ATTACH_DELAY_MS = 12 * 60 * 1000;

class VmCatalogService {
  private async waitForMachineAgentOnline(machineId: string): Promise<void> {
    const { MachineModel } = await import('../machine-manager/machine-manager.model');
    const startedAt = Date.now();

    while (Date.now() - startedAt < AGENT_ONLINE_WAIT_TIMEOUT_MS) {
      const doc = await MachineModel.findById(machineId)
        .select('status agentId')
        .lean();
      const isOnline = doc?.status === 'online';
      const hasAgentId = Boolean(doc?.agentId);
      if (isOnline && hasAgentId) return;

      await new Promise((resolve) => setTimeout(resolve, AGENT_ONLINE_WAIT_POLL_MS));
    }

    throw new Error('Agent did not come online within 15 minutes after push.');
  }

  private postReadyStageLabel(stage: NonNullable<CatalogVmResponse['postReadyStage']>): string {
    switch (stage) {
      case 'not_requested':
        return 'Not requested';
      case 'agent_pushing':
        return 'Agent pushing';
      case 'agent_waiting_online':
        return 'Waiting for agent online';
      case 'agent_online':
        return 'Agent online';
      case 'software_queued':
        return 'Software queued';
      case 'software_installing':
        return 'Software installing';
      case 'software_done':
        return 'Software completed';
      case 'failed':
      default:
        return 'Failed';
    }
  }

  private async resolvePostReadyJobSummary(
    docs: ICatalogVm[]
  ): Promise<
    Map<
      string,
      {
        status: 'none' | 'pending' | 'running' | 'done' | 'failed';
        total: number;
        done: number;
        failed: number;
        running: number;
        pending: number;
        stage: NonNullable<CatalogVmResponse['postReadyStage']>;
        stageLabel: string;
        machineStatus?: 'pending' | 'online' | 'offline';
        agentConnected?: boolean;
        runningSoftware: string[];
        pendingSoftware: string[];
      }
    >
  > {
    const machineIds = [
      ...new Set(
        docs
          .map((d) => d.machineId?.toString())
          .filter((id): id is string => Boolean(id) && mongoose.Types.ObjectId.isValid(id!))
      ),
    ];
    if (machineIds.length === 0) return new Map();

    const jobs = await JobModel.find({
      machineId: { $in: machineIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('machineId status softwareIds')
      .lean();

    const { MachineModel } = await import('../machine-manager/machine-manager.model');
    const machineDocs = await MachineModel.find({
      _id: { $in: machineIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('_id status agentId')
      .lean();

    const machineById = new Map(
      machineDocs.map((m) => [m._id.toString(), m])
    );

    const softwareIds = [
      ...new Set(
        jobs
          .flatMap((job) => job.softwareIds ?? [])
          .map((id) => id.toString())
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
      ),
    ];
    const softwareById = new Map<string, string>();
    if (softwareIds.length > 0) {
      const softwareRows = await SoftwareCatalogModel.find({
        _id: { $in: softwareIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select('name')
        .lean();
      for (const sw of softwareRows) {
        softwareById.set(sw._id.toString(), sw.name);
      }
    }

    const countsByMachine = new Map<
      string,
      {
        total: number;
        done: number;
        failed: number;
        running: number;
        pending: number;
        runningSoftware: Set<string>;
        pendingSoftware: Set<string>;
      }
    >();

    for (const job of jobs) {
      const key = job.machineId.toString();
      const c = (key ? countsByMachine.get(key) : undefined) ?? {
        total: 0,
        done: 0,
        failed: 0,
        running: 0,
        pending: 0,
        runningSoftware: new Set<string>(),
        pendingSoftware: new Set<string>(),
      };
      c.total += 1;
      const softwareName = softwareById.get(job.softwareIds?.[0]?.toString() || '');
      if (job.status === 'success') c.done += 1;
      else if (job.status === 'failed') c.failed += 1;
      else if (job.status === 'pending') {
        c.pending += 1;
        if (softwareName) c.pendingSoftware.add(softwareName);
      } else {
        c.running += 1; // installing / retrying
        if (softwareName) c.runningSoftware.add(softwareName);
      }
      countsByMachine.set(key, c);
    }

    const out = new Map<
      string,
      {
        status: 'none' | 'pending' | 'running' | 'done' | 'failed';
        total: number;
        done: number;
        failed: number;
        running: number;
        pending: number;
        stage: NonNullable<CatalogVmResponse['postReadyStage']>;
        stageLabel: string;
        machineStatus?: 'pending' | 'online' | 'offline';
        agentConnected?: boolean;
        runningSoftware: string[];
        pendingSoftware: string[];
      }
    >();

    for (const doc of docs) {
      const hasPreferredSoftware = (doc.preferredSoftwareIds?.length ?? 0) > 0;
      const key = doc.machineId?.toString();
      const c = (key ? countsByMachine.get(key) : undefined) ?? {
        total: 0,
        done: 0,
        failed: 0,
        running: 0,
        pending: 0,
        runningSoftware: new Set<string>(),
        pendingSoftware: new Set<string>(),
      };
      const machine = key ? machineById.get(key) : undefined;
      const machineStatus = machine?.status as 'pending' | 'online' | 'offline' | undefined;
      const agentConnected = Boolean(machine?.agentId);
      const fallback = (doc.postReadyStatus ?? 'none') as
        | 'none'
        | 'pending'
        | 'running'
        | 'done'
        | 'failed';
      let status: 'none' | 'pending' | 'running' | 'done' | 'failed' = fallback;
      if (c.total > 0) {
        if (c.failed > 0) status = 'failed';
        else if (c.running > 0 || c.pending > 0) status = 'running';
        else if (c.done === c.total) status = 'done';
        else status = 'running';
      }

      let stage: NonNullable<CatalogVmResponse['postReadyStage']> = 'not_requested';
      if (status === 'failed') {
        stage = 'failed';
      } else if (!hasPreferredSoftware) {
        stage = 'not_requested';
      } else if (c.total > 0) {
        if (c.done === c.total) stage = 'software_done';
        else if (c.running > 0) stage = 'software_installing';
        else if (c.pending > 0) stage = 'software_queued';
        else stage = 'software_installing';
      } else if (!doc.machineId) {
        stage = 'agent_pushing';
      } else if (machineStatus === 'online' && agentConnected) {
        stage = 'agent_online';
      } else if (machineStatus === 'pending' || !agentConnected) {
        stage = 'agent_waiting_online';
      } else {
        stage = 'agent_pushing';
      }

      out.set(doc._id.toString(), {
        status,
        total: c.total,
        done: c.done,
        failed: c.failed,
        running: c.running,
        pending: c.pending,
        stage,
        stageLabel: this.postReadyStageLabel(stage),
        ...(machineStatus ? { machineStatus } : {}),
        agentConnected,
        runningSoftware: Array.from(c.runningSoftware),
        pendingSoftware: Array.from(c.pendingSoftware),
      });
    }

    return out;
  }

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
      /** Customer-facing plan label (Cloud VPS - N); overrides stored Webyne planName. */
      displayPlanName?: string;
      projectName?: string;
      clientName?: string;
      role?: CatalogVmCallerRole;
      postReadyOverride?: {
        status: 'none' | 'pending' | 'running' | 'done' | 'failed';
        total: number;
        done: number;
        failed: number;
        running: number;
        pending: number;
        stage: NonNullable<CatalogVmResponse['postReadyStage']>;
        stageLabel: string;
        machineStatus?: 'pending' | 'online' | 'offline';
        agentConnected?: boolean;
        runningSoftware: string[];
        pendingSoftware: string[];
      };
    }
  ): CatalogVmResponse {
    const includeSecrets = Boolean(opts?.includeSecrets);
    const forAdmin = Boolean(opts?.forAdmin);
    const status = forAdmin ? this.adminDisplayStatus(doc.status) : doc.status;
    const showConnection = includeSecrets || doc.status === 'active';
    const planName =
      forAdmin && opts?.displayPlanName ? opts.displayPlanName : doc.planName;
    const role = opts?.role ?? (forAdmin ? 'admin' : 'super_admin');

    const base: CatalogVmResponse = {
      _id: doc._id.toString(),
      ...(doc.adminId ? { adminId: doc.adminId.toString() } : {}),
      ...(doc.tenantId ? { tenantId: doc.tenantId.toString() } : {}),
      ...(doc.tenantUserId ? { tenantUserId: doc.tenantUserId.toString() } : {}),
      ...(opts?.adminEmail ? { adminEmail: opts.adminEmail } : {}),
      ...(doc.projectId ? { projectId: doc.projectId.toString() } : {}),
      ...(opts?.projectName ? { projectName: opts.projectName } : {}),
      ...(opts?.clientName ? { clientName: opts.clientName } : {}),
      preferredSoftwareIds: (doc.preferredSoftwareIds ?? []).map((id) => id.toString()),
      ...(doc.machineId ? { machineId: doc.machineId.toString() } : {}),
      postReadyStatus: opts?.postReadyOverride?.status ?? (doc.postReadyStatus ?? 'none'),
      ...(doc.postReadyError ? { postReadyError: doc.postReadyError } : {}),
      ...(opts?.postReadyOverride
        ? {
            postReadyJobTotal: opts.postReadyOverride.total,
            postReadyJobDone: opts.postReadyOverride.done,
            postReadyJobFailed: opts.postReadyOverride.failed,
            postReadyJobRunning: opts.postReadyOverride.running,
            postReadyJobPending: opts.postReadyOverride.pending,
            postReadyStage: opts.postReadyOverride.stage,
            postReadyStageLabel: opts.postReadyOverride.stageLabel,
            ...(opts.postReadyOverride.machineStatus
              ? { postReadyMachineStatus: opts.postReadyOverride.machineStatus }
              : {}),
            postReadyAgentConnected: Boolean(opts.postReadyOverride.agentConnected),
            postReadyRunningSoftware: opts.postReadyOverride.runningSoftware,
            postReadyPendingSoftware: opts.postReadyOverride.pendingSoftware,
          }
        : {}),
      provider: doc.provider,
      category: doc.category,
      planId: doc.planId,
      planName,
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
      needsOsChange: Boolean(
        doc.needsOsChange ?? needsOsTemplateChange(doc.planName, doc.category)
      ),
      osTemplateChanged: Boolean(doc.osTemplateChanged),
      ...(doc.osTemplateChangedAt
        ? { osTemplateChangedAt: doc.osTemplateChangedAt.toISOString() }
        : {}),
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

  /** Map planId → Cloud VPS - {sno} for admin/tenant responses. */
  private async resolveCustomerPlanNames(
    docs: Array<{ planId: string }>
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        docs
          .map((d) => d.planId)
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      ),
    ];
    if (ids.length === 0) return new Map();

    const plans = await VmCatalogPlan.find({
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('sno')
      .lean();

    const map = new Map<string, string>();
    for (const plan of plans) {
      map.set(plan._id.toString(), customerDisplayName(plan.sno));
    }
    return map;
  }

  private async resolveProjectLabels(
    docs: Array<{ projectId?: mongoose.Types.ObjectId | null }>
  ): Promise<Map<string, { projectName: string; clientName: string }>> {
    const ids = [
      ...new Set(
        docs
          .map((d) => d.projectId?.toString())
          .filter((id): id is string => Boolean(id) && mongoose.Types.ObjectId.isValid(id!))
      ),
    ];
    if (ids.length === 0) return new Map();

    const projects = await ProjectModel.find({
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('name clientName')
      .lean();

    const map = new Map<string, { projectName: string; clientName: string }>();
    for (const project of projects) {
      map.set(project._id.toString(), {
        projectName: project.name,
        clientName: project.clientName,
      });
    }
    return map;
  }

  private async toCustomerResponses(
    docs: ICatalogVm[],
    opts?: { adminEmail?: string; includeSecrets?: boolean }
  ): Promise<CatalogVmResponse[]> {
    const [names, projects, postReadyByRequest] = await Promise.all([
      this.resolveCustomerPlanNames(docs),
      this.resolveProjectLabels(docs),
      this.resolvePostReadyJobSummary(docs),
    ]);
    return docs.map((doc) => {
      const project = doc.projectId ? projects.get(doc.projectId.toString()) : undefined;
      const postReady = postReadyByRequest.get(doc._id.toString());
      return this.toResponse(doc, {
        ...opts,
        forAdmin: true,
        role: 'admin',
        displayPlanName: names.get(doc.planId),
        ...(postReady ? { postReadyOverride: postReady } : {}),
        ...(project
          ? { projectName: project.projectName, clientName: project.clientName }
          : {}),
      });
    });
  }

  private async toCustomerResponse(
    doc: ICatalogVm,
    opts?: { adminEmail?: string; includeSecrets?: boolean }
  ): Promise<CatalogVmResponse> {
    const [response] = await this.toCustomerResponses([doc], opts);
    return response!;
  }

  private async persistFetchedInstances(
    doc: ICatalogVm,
    servers: Array<{
      hostname?: string | null;
      ipAddress?: string | null;
      username?: string | null;
      password?: string | null;
      protocol?: 'rdp' | 'ssh' | null;
      externalRef?: string | null;
      rawLabel?: string | null;
    }>
  ): Promise<number> {
    if (!servers.length) return 0;

    for (let idx = 0; idx < servers.length; idx += 1) {
      const server = servers[idx]!;
      const update = {
        ...(doc.adminId ? { adminId: doc.adminId } : {}),
        ...(doc.tenantId ? { tenantId: doc.tenantId } : {}),
        instanceOrder: idx + 1,
        ...(server.hostname ? { hostname: server.hostname } : {}),
        ...(server.ipAddress ? { ipAddress: server.ipAddress } : {}),
        ...(server.username ? { username: server.username } : {}),
        ...(server.password ? { password: encrypt(server.password) } : {}),
        ...(server.protocol ? { protocol: server.protocol } : {}),
        ...(server.rawLabel ? { rawLabel: server.rawLabel } : {}),
        status: 'ready_to_attach' as const,
        updatedAt: new Date(),
      };

      if (server.externalRef) {
        await CatalogVmInstanceModel.findOneAndUpdate(
          { catalogVmId: doc._id, externalRef: server.externalRef },
          {
            $set: {
              ...update,
              externalRef: server.externalRef,
            },
            $setOnInsert: {
              catalogVmId: doc._id,
              createdAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );
      } else {
        await CatalogVmInstanceModel.findOneAndUpdate(
          { catalogVmId: doc._id, instanceOrder: idx + 1 },
          {
            $set: update,
            $setOnInsert: {
              catalogVmId: doc._id,
              createdAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    return CatalogVmInstanceModel.countDocuments({ catalogVmId: doc._id });
  }

  private async expandAdminResponsesWithInstances(
    docs: ICatalogVm[],
    responses: CatalogVmResponse[]
  ): Promise<CatalogVmResponse[]> {
    if (docs.length === 0) return [];
    const ids = docs.map((doc) => doc._id);
    const instances = await CatalogVmInstanceModel.find({
      catalogVmId: { $in: ids },
    })
      .sort({ instanceOrder: 1, createdAt: 1 })
      .lean();

    const responseById = new Map(responses.map((row) => [row._id, row]));
    const grouped = new Map<string, typeof instances>();
    for (const instance of instances) {
      const key = instance.catalogVmId.toString();
      const bucket = grouped.get(key);
      if (bucket) bucket.push(instance);
      else grouped.set(key, [instance]);
    }

    const expanded: CatalogVmResponse[] = [];
    for (const doc of docs) {
      const parentId = doc._id.toString();
      const base = responseById.get(parentId);
      if (!base) continue;

      const rows = grouped.get(parentId) || [];
      const total = Math.max(1, Number(doc.quantity) || 1, rows.length);
      if (rows.length === 0 && total === 1) {
        expanded.push(base);
        continue;
      }

      for (let idx = 0; idx < total; idx += 1) {
        const row = rows[idx];
        expanded.push({
          ...base,
          parentRequestId: base._id,
          ...(row ? { instanceId: row._id.toString() } : {}),
          instanceIndex: idx + 1,
          instanceTotal: total,
          ...(base.status === 'active' && row?.hostname ? { hostname: row.hostname } : {}),
          ...(base.status === 'active' && row?.ipAddress ? { ipAddress: row.ipAddress } : {}),
          ...(base.status === 'active' && row?.username ? { username: row.username } : {}),
          ...(base.status === 'active' && row?.protocol ? { protocol: row.protocol } : {}),
          ...(base.status === 'active' && row?.password
            ? (() => {
                try {
                  return { password: decrypt(row.password) };
                } catch {
                  return {};
                }
              })()
            : {}),
        });
      }
    }

    return expanded;
  }

  private displayNameForPlan(plan: { sno?: number | null; name: string }): string {
    return customerDisplayName(plan.sno);
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

  /** Slim software list for Create VM picker (org + tenant). */
  async listSoftwareOptions(): Promise<
    Array<{
      _id: string;
      name: string;
      version: string;
      iconUrl?: string;
      supportedOS: Array<'windows' | 'linux' | 'macos'>;
      installMethod: string;
    }>
  > {
    const docs = await SoftwareCatalogModel.find()
      .select('name version iconUrl supportedOS installMethod')
      .sort({ name: 1 })
      .lean();
    return docs.map((d) => ({
      _id: d._id.toString(),
      name: d.name,
      version: d.version,
      iconUrl: resolveSoftwareIconUrl(d.name, d.iconUrl),
      supportedOS: d.supportedOS,
      installMethod: d.installMethod,
    }));
  }

  private async resolvePreferredSoftwareIds(
    ids: string[] | undefined
  ): Promise<mongoose.Types.ObjectId[]> {
    const unique = [...new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean))];
    if (unique.length === 0) return [];
    for (const id of unique) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError(`Invalid software id: ${id}`);
      }
    }
    const objectIds = unique.map((id) => new mongoose.Types.ObjectId(id));
    const count = await SoftwareCatalogModel.countDocuments({ _id: { $in: objectIds } });
    if (count !== objectIds.length) {
      throw new ValidationError('One or more selected software packages were not found.');
    }
    return objectIds;
  }

  private schedulePostReadySetup(doc: ICatalogVm): void {
    const softwareIds = doc.preferredSoftwareIds ?? [];
    if (softwareIds.length === 0) return;

    // Use the org admin id directly, or fall back to the super-admin who attached
    // the VM (reviewedBy) so tenant VMs also get the agent+software push.
    const effectiveAdminId = doc.adminId ?? doc.reviewedBy;
    if (!effectiveAdminId) {
      logger.warn('[VmCatalog] Post-ready install skipped — no admin or reviewer id', {
        requestId: doc._id.toString(),
      });
      void CatalogVmModel.updateOne(
        { _id: doc._id },
        {
          $set: {
            postReadyStatus: 'failed',
            postReadyError: 'No admin or reviewer id available for agent install.',
            updatedAt: new Date(),
          },
        }
      ).catch(() => undefined);
      return;
    }

    void this.runPostReadySetup(doc._id).catch((err: unknown) => {
      logger.error('[VmCatalog] Post-ready setup failed', {
        requestId: doc._id.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private async runPostReadySetup(id: mongoose.Types.ObjectId): Promise<void> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) return;
    if (doc.status !== 'active') return;

    // Org admin id takes priority; fall back to the reviewing super-admin for tenant VMs.
    const effectiveAdminId = doc.adminId ?? doc.reviewedBy;
    if (!effectiveAdminId) return;

    const softwareIds = (doc.preferredSoftwareIds ?? []).map((sid) => sid.toString());
    if (softwareIds.length === 0) return;

    const os = catalogCategoryToMachineOs(doc.category);
    const instanceDocs = await CatalogVmInstanceModel.find({ catalogVmId: doc._id })
      .sort({ instanceOrder: 1, createdAt: 1 })
      .lean();

    const pushTargets: Array<{
      name: string;
      ipAddress: string;
      os: 'windows' | 'linux';
      username: string;
      password: string;
    }> = [];

    if (instanceDocs.length > 0) {
      for (const instance of instanceDocs) {
        if (!instance.ipAddress || !instance.username || !instance.password) {
          doc.postReadyStatus = 'failed';
          doc.postReadyError = `Missing IP, username, or password for VM #${instance.instanceOrder}.`;
          doc.updatedAt = new Date();
          await doc.save();
          return;
        }

        let plainPassword: string;
        try {
          plainPassword = decrypt(instance.password);
        } catch {
          doc.postReadyStatus = 'failed';
          doc.postReadyError = `Stored password for VM #${instance.instanceOrder} could not be decrypted.`;
          doc.updatedAt = new Date();
          await doc.save();
          return;
        }

        pushTargets.push({
          name: `${doc.planName} #${instance.instanceOrder} · ${instance.ipAddress}`.slice(0, 120),
          ipAddress: instance.ipAddress,
          os,
          username: instance.username,
          password: plainPassword,
        });
      }
    } else {
      if (!doc.ipAddress || !doc.username || !doc.password) {
        doc.postReadyStatus = 'failed';
        doc.postReadyError = 'Missing IP, username, or password for agent install.';
        doc.updatedAt = new Date();
        await doc.save();
        return;
      }

      let plainPassword: string;
      try {
        plainPassword = decrypt(doc.password);
      } catch {
        doc.postReadyStatus = 'failed';
        doc.postReadyError = 'Stored password could not be decrypted for agent install.';
        doc.updatedAt = new Date();
        await doc.save();
        return;
      }

      pushTargets.push({
        name: `${doc.planName} · ${doc.ipAddress}`.slice(0, 120),
        ipAddress: doc.ipAddress,
        os,
        username: doc.username,
        password: plainPassword,
      });
    }

    doc.postReadyStatus = 'running';
    doc.postReadyError = undefined;
    doc.updatedAt = new Date();
    await doc.save();

    const { machineManagerService } = await import('../machine-manager/machine-manager.service');
    const sessionId = randomUUID();

    try {
      const { machines } = await machineManagerService.pushAgentToVMs(
        pushTargets,
        effectiveAdminId,
        sessionId,
        undefined, // groupId — not applicable for catalog VMs
        false      // installRackoApp=false — skip racko-app during software install to
                   // avoid Windows Installer conflicts (WebView2 vs Postman/other packages).
                   // RackoApp installs later via the heartbeat update path.
      );

      if (!machines.length) {
        throw new Error('Machine Manager did not return a machine record.');
      }

      // Keep a primary machine link for compatibility (first machine).
      doc.machineId = new mongoose.Types.ObjectId(machines[0]!._id);
      await doc.save();

      // Match Setup Wizard behavior: queue software only after agent is actually
      // online/registered for each machine.
      await Promise.all(machines.map((m) => this.waitForMachineAgentOnline(m._id)));

      await machineManagerService.createJobs(
        { machineIds: machines.map((m) => m._id), softwareIds },
        effectiveAdminId
      );

      doc.postReadyStatus = 'done';
      doc.postReadyError = undefined;
      doc.updatedAt = new Date();
      await doc.save();

      logger.info('[VmCatalog] Post-ready agent push + software jobs queued', {
        requestId: doc._id.toString(),
        machineCount: machines.length,
        softwareCount: softwareIds.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      doc.postReadyStatus = 'failed';
      doc.postReadyError = message;
      doc.updatedAt = new Date();
      await doc.save();
      throw err;
    }
  }

  /** Background auto-provision for hourly cloud SKUs — does not block Buy Now. */
  private async runAutoProvision(input: {
    requestId: mongoose.Types.ObjectId;
    adminId: mongoose.Types.ObjectId;
    selection: ResellerSelectResult;
    canonicalSpec: string;
    category: string;
    total: number;
    planName: string;
  }): Promise<void> {
    const { requestId, adminId, selection, canonicalSpec, category, total, planName } = input;
    const doc = await CatalogVmModel.findById(requestId);
    if (!doc || doc.status !== 'provisioning' || !doc.autoProvisioned) return;

    try {
      const provisioned = await resellerProvision({
        provider: selection.provider,
        region: selection.region,
        category,
        canonicalSpec: selection.canonicalSpec || canonicalSpec,
        catalogVmId: requestId.toString(),
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

      this.schedulePostReadySetup(doc);

      await this.notifyRequester(
        adminId,
        'Cloud VM is ready',
        `Your ${doc.quantity}× ${planName} purchase (₹${total}) is active.`,
        {
          requestId: requestId.toString(),
          event: 'active',
          planName,
          total,
        }
      );

      logger.info('[VmCatalog] Auto-provisioned catalog VM', {
        requestId: requestId.toString(),
        provider: doc.provider,
        region: doc.region,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      doc.status = 'failed';
      doc.fulfillError = message;
      doc.updatedAt = new Date();
      await doc.save();

      await adminBillingService
        .refundCloudRequestCharge(adminId.toString(), total, requestId.toString())
        .catch((refundErr: unknown) => {
          logger.error('[VmCatalog] Refund after auto-provision failure failed', {
            requestId: requestId.toString(),
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
        `Your ${planName} purchase failed and was refunded. ${message}`,
        {
          requestId: requestId.toString(),
          event: 'failed',
          planName,
          total,
        }
      );

      logger.error('[VmCatalog] Auto-provision failed', {
        requestId: requestId.toString(),
        error: message,
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

    const preferredSoftwareIds = await this.resolvePreferredSoftwareIds(
      dto.preferredSoftwareIds
    );

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

    const adminUser = await User.findById(adminId).select('role orgOwnerId').lean();
    const orgId = adminUser
      ? accountVmPricingService.resolveOrgIdFromUser({
          _id: adminUser._id,
          role: adminUser.role,
          orgOwnerId: adminUser.orgOwnerId,
        })
      : null;
    const priceBucket = catalogPricingBucket(dto.category);
    const resolved = await accountVmPricingService.resolveWebyneUnitPrice({
      account: orgId ? { scopeType: 'organization', orgId } : null,
      category: priceBucket,
      planId: plan._id.toString(),
      period: billing as (typeof BILLING_PERIODS)[number],
      baseUnit,
    });

    const quantity = Math.max(1, Math.floor(Number(dto.quantity) || 1));
    const unitPrice = resolved.unitPrice;
    const subtotal = roundMoney(unitPrice * quantity);
    const tax = roundMoney(subtotal * GST_RATE);
    const total = roundMoney(subtotal + tax);

    if (!Number.isFinite(total) || total <= 0) {
      throw new ValidationError('Invalid purchase total.');
    }

    const durationDays = resolveDurationDays(dto.billing, dto.durationDays);
    const canonicalSpec =
      dto.canonicalSpec || specsToCanonicalSpec(dto.specs, dto.category);

    const selection = defaultWebyneManualSelection(dto.category, canonicalSpec);

    // Always route through Webyne (Super Admin manual flow).
    // Cloud auto-provision (Azure/AWS/OCI/GCP) is disabled intentionally so that
    // provider credentials can remain configured for other services without
    // the reseller selection triggering auto-VM creation here.
    const autoProvisioned = false;
    const provider = 'webyne';

    const projectCtx = dto.projectId
      ? await projectsService.assertUsableForService({
          projectId: dto.projectId,
          actingUserId: adminId.toString(),
          serviceKey: 'create-vm',
        })
      : null;

    // Debit wallet first — fails with INSUFFICIENT_BALANCE if too low.
    await adminBillingService.debitWallet(
      adminId.toString(),
      total,
      null,
      'catalog_vm_purchase',
      {
        projectId: projectCtx?.projectId.toString() ?? null,
        orgId: projectCtx?.orgId ?? null,
        serviceKey: 'create-vm',
      }
    );

    let doc: ICatalogVm;
    try {
      doc = await CatalogVmModel.create({
        adminId,
        ...(projectCtx ? { projectId: projectCtx.projectId } : {}),
        preferredSoftwareIds,
        postReadyStatus: preferredSoftwareIds.length > 0 ? 'pending' : 'none',
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
        needsOsChange:
          !autoProvisioned && needsOsTemplateChange(plan.name, dto.category),
        osTemplateChanged: false,
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
      const customerPlanName = this.displayNameForPlan(plan);
      await this.notifyRequester(
        adminId,
        'Cloud VM is provisioning',
        `Your ${doc.quantity}× ${customerPlanName} purchase (₹${total}) was charged. It will be available soon.`,
        {
          requestId: doc._id.toString(),
          event: 'submitted',
          planName: customerPlanName,
          total,
        }
      );

      void this.runAutoProvision({
        requestId: doc._id,
        adminId,
        selection,
        canonicalSpec,
        category: dto.category,
        total,
        planName: doc.planName,
      }).catch((err: unknown) => {
        logger.error('[VmCatalog] Background auto-provision crashed', {
          requestId: doc._id.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      });

      logger.info('[VmCatalog] Auto-provision scheduled', {
        requestId: doc._id.toString(),
        provider: doc.provider,
        region: doc.region,
      });

      return this.toCustomerResponse(doc, { adminEmail: admin.email });
    }

    await this.notifySuperAdminsOfRequest(doc, admin.email);
    const customerPlanName = this.displayNameForPlan(plan);
    await this.notifyRequester(
      adminId,
      'Webyne VM is provisioning',
      `Your ${doc.quantity}× ${customerPlanName} purchase (₹${total}) was charged. It will be available soon.`,
      {
        requestId: doc._id.toString(),
        event: 'submitted',
        planName: customerPlanName,
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

    return this.toCustomerResponse(doc, { adminEmail: admin.email });
  }

  async createRequestForSuperAdmin(
    dto: CreateCatalogVmRequestDto,
    superAdminId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const superAdmin = await User.findById(superAdminId).select('email role isActive').lean();
    if (!superAdmin || superAdmin.role !== 'super_admin' || !superAdmin.isActive) {
      throw new ForbiddenError('Only active super admins can submit super-admin catalog VM requests.');
    }

    const preferredSoftwareIds = await this.resolvePreferredSoftwareIds(
      dto.preferredSoftwareIds
    );

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

    const adminUser = await User.findById(superAdminId).select('role orgOwnerId').lean();
    const orgId = adminUser
      ? accountVmPricingService.resolveOrgIdFromUser({
          _id: adminUser._id,
          role: adminUser.role,
          orgOwnerId: adminUser.orgOwnerId,
        })
      : null;
    const priceBucket = catalogPricingBucket(dto.category);
    const resolved = await accountVmPricingService.resolveWebyneUnitPrice({
      account: orgId ? { scopeType: 'organization', orgId } : null,
      category: priceBucket,
      planId: plan._id.toString(),
      period: billing as (typeof BILLING_PERIODS)[number],
      baseUnit,
    });

    const quantity = Math.max(1, Math.floor(Number(dto.quantity) || 1));
    const unitPrice = resolved.unitPrice;
    const subtotal = roundMoney(unitPrice * quantity);
    const tax = roundMoney(subtotal * GST_RATE);
    const total = roundMoney(subtotal + tax);

    if (!Number.isFinite(total) || total <= 0) {
      throw new ValidationError('Invalid purchase total.');
    }

    const canonicalSpec =
      dto.canonicalSpec || specsToCanonicalSpec(dto.specs, dto.category);

    const selection = defaultWebyneManualSelection(dto.category, canonicalSpec);

    const autoProvisioned = false;
    const provider = 'webyne';

    const projectCtx = dto.projectId
      ? await projectsService.assertUsableForService({
          projectId: dto.projectId,
          actingUserId: superAdminId.toString(),
          serviceKey: 'create-vm',
        })
      : null;

    const doc = await CatalogVmModel.create({
      adminId: superAdminId,
      ...(projectCtx ? { projectId: projectCtx.projectId } : {}),
      preferredSoftwareIds,
      postReadyStatus: preferredSoftwareIds.length > 0 ? 'pending' : 'none',
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
      chargedAmount: 0,
      walletDebited: false,
      needsOsChange: !autoProvisioned && needsOsTemplateChange(plan.name, dto.category),
      osTemplateChanged: false,
      autoProvisioned,
      ...(selection.region ? { region: selection.region } : {}),
      ...(selection.rawTotalPricePerHr != null
        ? { rawProviderCostPerHr: selection.rawTotalPricePerHr }
        : {}),
    });

    const customerPlanName = this.displayNameForPlan(plan);
    await this.notifySuperAdminsOfRequest(doc, superAdmin.email, {
      tenantId: undefined,
    });
    await this.notifyRequester(
      superAdminId,
      'Webyne VM is provisioning',
      `Your ${doc.quantity}× ${customerPlanName} request was submitted. It will be available soon.`,
      {
        requestId: doc._id.toString(),
        event: 'submitted',
        planName: customerPlanName,
        total,
      }
    );

    logger.info('[VmCatalog] Super-admin request created', {
      requestId: doc._id.toString(),
      superAdminId: superAdminId.toString(),
      planName: doc.planName,
      provider: doc.provider,
      autoProvisioned: false,
      walletDebited: false,
    });

    return this.toCustomerResponse(doc, { adminEmail: superAdmin.email });
  }

  async listForAdmin(adminId: mongoose.Types.ObjectId): Promise<CatalogVmResponse[]> {
    const docs = await CatalogVmModel.find({ adminId }).sort({ createdAt: -1 });
    const responses = await this.toCustomerResponses(docs);
    return this.expandAdminResponsesWithInstances(docs, responses);
  }

  /** Admin: single owned VM (for console toolbar name, etc.). */
  async getForAdmin(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    return this.toCustomerResponse(doc);
  }

  /**
   * Admin Guacamole console — same path as Elastic Servers (IP + creds).
   * Only active catalog VMs with connection details.
   */
  async openConsole(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    dimensions?: { width?: number; height?: number },
    instanceId?: string
  ): Promise<CatalogVmConsoleSession> {
    const doc = await this.findOwnedByAdmin(id, adminId);

    if (doc.status !== 'active') {
      throw new ValidationError('Console is only available after the VM is attached (active).');
    }
    let ipAddress = doc.ipAddress;
    let username = doc.username;
    let encryptedPassword = doc.password;
    let protocol = doc.protocol || (doc.category === 'windows' ? 'rdp' : 'ssh');

    if (instanceId && mongoose.Types.ObjectId.isValid(instanceId)) {
      const instance = await CatalogVmInstanceModel.findOne({
        _id: new mongoose.Types.ObjectId(instanceId),
        catalogVmId: doc._id,
      }).lean();
      if (instance) {
        ipAddress = instance.ipAddress || ipAddress;
        username = instance.username || username;
        encryptedPassword = instance.password || encryptedPassword;
        protocol = instance.protocol || protocol;
      }
    }

    if (!ipAddress) {
      throw new ValidationError('This VM has no IP address for console access.');
    }
    if (!encryptedPassword) {
      throw new ValidationError('This VM has no password for console access.');
    }

    const resolvedUsername = username || (protocol === 'rdp' ? 'Administrator' : 'root');
    let password: string;
    try {
      password = decrypt(encryptedPassword);
    } catch {
      throw new ValidationError('Stored password could not be decrypted for console access.');
    }

    const port = protocol === 'rdp' ? 3389 : 22;

    logger.info('[VmCatalog] Opening Guacamole session', {
      catalogVmId: doc._id.toString(),
      protocol,
      hostname: ipAddress,
    });

    const session = await guacamoleClient.openConsole(
      `catalogvm-${doc._id.toString()}`,
      protocol,
      {
        hostname: ipAddress,
        port,
        username: resolvedUsername,
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
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$category',
                      ['linux', 'ubuntu', 'rocky', 'debian'],
                    ],
                  },
                  1,
                  0,
                ],
              },
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
      recent: await this.toCustomerResponses(recentDocs),
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
    const projects = await this.resolveProjectLabels(docs);
    const postReadyByRequest = await this.resolvePostReadyJobSummary(docs);
    const instances = await CatalogVmInstanceModel.find({
      catalogVmId: { $in: docs.map((doc) => doc._id) },
    })
      .sort({ instanceOrder: 1, createdAt: 1 })
      .lean();
    const instancesByRequest = new Map<string, typeof instances>();
    for (const instance of instances) {
      const key = instance.catalogVmId.toString();
      const bucket = instancesByRequest.get(key);
      if (bucket) bucket.push(instance);
      else instancesByRequest.set(key, [instance]);
    }

    return docs.map((doc) => {
      const project = doc.projectId ? projects.get(doc.projectId.toString()) : undefined;
      const postReady = postReadyByRequest.get(doc._id.toString());
      const instanceRows = instancesByRequest.get(doc._id.toString()) || [];
      return {
        ...this.toResponse(doc, {
        adminEmail: doc.adminId ? emailById.get(doc.adminId.toString()) : undefined,
        includeSecrets: true,
        role: 'super_admin',
        ...(postReady ? { postReadyOverride: postReady } : {}),
        ...(project
          ? { projectName: project.projectName, clientName: project.clientName }
          : {}),
        }),
        fetchedCount: instanceRows.length,
        missingCount: Math.max(0, (Number(doc.quantity) || 1) - instanceRows.length),
        partial: instanceRows.length < (Number(doc.quantity) || 1),
        instances: instanceRows.map((row) => ({
          instanceId: row._id.toString(),
          instanceIndex: row.instanceOrder,
          status: row.status,
          ...(row.hostname ? { hostname: row.hostname } : {}),
          ...(row.ipAddress ? { ipAddress: row.ipAddress } : {}),
          ...(row.username ? { username: row.username } : {}),
          ...(row.protocol ? { protocol: row.protocol } : {}),
          ...(row.externalRef ? { externalRef: row.externalRef } : {}),
          ...(row.password
            ? (() => {
                try {
                  return { password: decrypt(row.password) };
                } catch {
                  return {};
                }
              })()
            : {}),
        })),
      };
    });
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

      const servers =
        result.servers && result.servers.length > 0
          ? result.servers
          : result.server
            ? [result.server]
            : [];
      const fetchedCount = await this.persistFetchedInstances(doc, servers);
      const server = servers[0] || null;

      if (!server) {
        throw new ValidationError('No VM details were returned from Webyne after fulfillment.');
      }

      doc.hostname = server.hostname || undefined;
      doc.ipAddress = server.ipAddress || undefined;
      doc.username = server.username || undefined;
      if (server.password) {
        doc.password = encrypt(server.password);
      }
      doc.protocol = server.protocol || (doc.category === 'windows' ? 'rdp' : 'ssh');
      doc.externalRef = server.externalRef || undefined;
      doc.providerPurchased = doc.providerPurchased || Boolean(result.purchased);
      if (fetchedCount < doc.quantity) {
        doc.status = 'failed';
        doc.fulfillError = `Fetched ${fetchedCount}/${doc.quantity} VM details. Retry Fetch details to collect remaining VM credentials.`;
      } else {
        doc.fulfillError = undefined;
        doc.status = 'ready_to_attach';
      }
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

      const servers =
        result.servers && result.servers.length > 0
          ? result.servers
          : result.server
            ? [result.server]
            : [];
      const fetchedCount = await this.persistFetchedInstances(doc, servers);
      const server = servers[0] || null;

      if (!server) {
        throw new ValidationError('No VM details were returned from Webyne scrape.');
      }

      doc.hostname = server.hostname || undefined;
      doc.ipAddress = server.ipAddress || undefined;
      doc.username = server.username || undefined;
      if (server.password) {
        doc.password = encrypt(server.password);
      }
      doc.protocol = server.protocol || (doc.category === 'windows' ? 'rdp' : 'ssh');
      doc.externalRef = server.externalRef || undefined;
      doc.providerPurchased = true;
      if (fetchedCount < doc.quantity) {
        doc.status = 'failed';
        doc.fulfillError = `Fetched ${fetchedCount}/${doc.quantity} VM details. Retry Fetch details to collect remaining VM credentials.`;
      } else {
        doc.fulfillError = undefined;
        doc.status = 'ready_to_attach';
      }
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
    const needsChange =
      Boolean(doc.needsOsChange) || needsOsTemplateChange(doc.planName, doc.category);
    if (needsChange && !doc.osTemplateChanged) {
      throw new ValidationError(
        'Change template to Windows before attaching this VM (it was deployed as Linux first).'
      );
    }
    if (needsChange && doc.osTemplateChanged && doc.osTemplateChangedAt) {
      const elapsed = Date.now() - doc.osTemplateChangedAt.getTime();
      if (elapsed < WINDOWS_ATTACH_DELAY_MS) {
        const remainingMs = WINDOWS_ATTACH_DELAY_MS - elapsed;
        const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
        throw new ValidationError(
          `Attach will be enabled 12 minutes after template change. Please wait about ${remainingMinutes} minute(s).`
        );
      }
    }
    if (!doc.ipAddress && !doc.hostname) {
      throw new ValidationError('Cannot attach without hostname or IP from Webyne.');
    }

    const fetchedInstanceCount = await CatalogVmInstanceModel.countDocuments({
      catalogVmId: doc._id,
    });
    if (fetchedInstanceCount > 0 && fetchedInstanceCount < doc.quantity) {
      throw new ValidationError(
        `Only ${fetchedInstanceCount}/${doc.quantity} VM details were fetched. Run Fetch details until all requested VMs are captured before Attach.`
      );
    }

    doc.status = 'active';
    doc.attachedAt = new Date();
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    doc.updatedAt = new Date();
    await doc.save();

    await CatalogVmInstanceModel.updateMany(
      { catalogVmId: doc._id },
      {
        $set: {
          status: 'active',
          attachedAt: doc.attachedAt,
          updatedAt: new Date(),
        },
      }
    );

    this.schedulePostReadySetup(doc);

    const customerNames = await this.resolveCustomerPlanNames([doc]);
    const customerPlanName = customerNames.get(doc.planId) ?? doc.planName;

    await this.notifyOwner(
      doc,
      'Webyne VM is ready',
      `Your ${doc.quantity}× ${customerPlanName} VM is now available in My VM.`,
      {
        requestId: doc._id.toString(),
        event: 'attached',
      }
    );

    return this.toResponse(doc, { includeSecrets: true, role: 'super_admin' });
  }

  /** Super-admin retry: re-run post-ready agent push + software installation. */
  async retryPostReadySetup(
    id: mongoose.Types.ObjectId,
    reviewerId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) throw new NotFoundError('Catalog VM request not found.');
    if (doc.status !== 'active') {
      throw new ValidationError('Retry install is available only for active requests.');
    }

    const softwareIds = doc.preferredSoftwareIds ?? [];
    if (softwareIds.length === 0) {
      throw new ValidationError('No software package was selected for this request.');
    }
    if (doc.postReadyStatus === 'pending' || doc.postReadyStatus === 'running') {
      throw new ValidationError('Install retry is already in progress for this request.');
    }

    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    doc.postReadyStatus = 'pending';
    doc.postReadyError = undefined;
    doc.updatedAt = new Date();
    await doc.save();

    this.schedulePostReadySetup(doc);

    const postReady = (await this.resolvePostReadyJobSummary([doc])).get(doc._id.toString());
    return this.toResponse(doc, {
      includeSecrets: true,
      role: 'super_admin',
      ...(postReady ? { postReadyOverride: postReady } : {}),
    });
  }

  /**
   * Super-admin: after Linux-first deploy for a Windows request, change OS on
   * every fetched Webyne instance to Windows (template via agent env / body).
   */
  async changeTemplateToWindows(
    id: mongoose.Types.ObjectId,
    reviewerId: mongoose.Types.ObjectId,
    opts?: { template?: string }
  ): Promise<CatalogVmResponse> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) throw new NotFoundError('Catalog VM request not found.');

    const needsChange =
      Boolean(doc.needsOsChange) || needsOsTemplateChange(doc.planName, doc.category);
    if (!needsChange) {
      throw new ValidationError(
        'This request does not need an OS template change (not a Windows request on a Linux-priced plan).'
      );
    }
    if (doc.status !== 'ready_to_attach' && doc.status !== 'failed') {
      throw new ValidationError(
        'Change template to Windows is only available after the Linux VM is provisioned (ready to attach).'
      );
    }
    if (!doc.externalRef) {
      throw new ValidationError(
        'Missing Webyne machine id (externalRef). Use Fetch details first, then retry Change template.'
      );
    }
    if (!doc.providerPurchased && doc.status === 'failed') {
      throw new ValidationError('Provider purchase did not complete; Approve the request first.');
    }

    const instanceRows = await CatalogVmInstanceModel.find({ catalogVmId: doc._id })
      .sort({ instanceOrder: 1, createdAt: 1 })
      .lean();
    const externalRefs = Array.from(
      new Set(
        instanceRows
          .map((row) => String(row.externalRef || '').trim())
          .filter((value) => Boolean(value))
      )
    );
    if (!externalRefs.length && doc.externalRef) {
      externalRefs.push(doc.externalRef);
    }
    if (!externalRefs.length) {
      throw new ValidationError(
        'Missing Webyne machine id(s) (externalRef). Use Fetch details first, then retry Change template.'
      );
    }

    doc.status = 'fulfilling';
    doc.fulfillError = undefined;
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    doc.updatedAt = new Date();
    await doc.save();

    const failures: Array<{ externalRef: string; error: string }> = [];
    let firstSuccessfulResult: Awaited<ReturnType<typeof callCatalogAgentChangeOs>> | null = null;

    for (const externalRef of externalRefs) {
      try {
        const result = await callCatalogAgentChangeOs({
          externalRef,
          targetOs: 'windows',
          ...(opts?.template ? { template: opts.template } : {}),
        });

        if (!firstSuccessfulResult) {
          firstSuccessfulResult = result;
        }

        const server = result.server;
        await CatalogVmInstanceModel.findOneAndUpdate(
          { catalogVmId: doc._id, externalRef },
          {
            $set: {
              ...(server.hostname ? { hostname: server.hostname } : {}),
              ...(server.ipAddress ? { ipAddress: server.ipAddress } : {}),
              ...(server.username ? { username: server.username } : {}),
              ...(server.password ? { password: encrypt(server.password) } : {}),
              ...(server.protocol ? { protocol: server.protocol } : {}),
              ...(server.rawLabel ? { rawLabel: server.rawLabel } : {}),
              status: 'ready_to_attach' as const,
              updatedAt: new Date(),
            },
          },
          { new: true }
        );

        logger.info('[VmCatalog] OS template changed to Windows', {
          requestId: id.toString(),
          externalRef,
          template: result.template,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ externalRef, error: message });
        logger.error('[VmCatalog] Change template to Windows failed for instance', {
          requestId: id.toString(),
          externalRef,
          error: message,
        });
      }
    }

    if (!firstSuccessfulResult) {
      const message = failures[0]?.error || 'Change template to Windows failed.';
      doc.status = 'failed';
      doc.fulfillError = message.slice(0, 500);
      doc.updatedAt = new Date();
      await doc.save().catch(() => undefined);
      throw new ValidationError(message);
    }

    if (failures.length > 0) {
      const message = `Changed ${externalRefs.length - failures.length}/${externalRefs.length} VMs to Windows. Failed: ${failures
        .map((failure) => failure.externalRef)
        .join(', ')}.`;
      doc.status = 'failed';
      doc.fulfillError = message.slice(0, 500);
      doc.updatedAt = new Date();
      await doc.save().catch(() => undefined);
      throw new ValidationError(message);
    }

    const server = firstSuccessfulResult.server;
    if (server.hostname) doc.hostname = server.hostname;
    if (server.ipAddress) doc.ipAddress = server.ipAddress;
    if (server.username) doc.username = server.username;
    if (server.password) doc.password = encrypt(server.password);
    doc.protocol = server.protocol || 'rdp';
    doc.externalRef = server.externalRef || externalRefs[0];
    doc.osTemplateChanged = true;
    doc.osTemplateChangedAt = new Date();
    doc.needsOsChange = true;
    doc.fulfillError = undefined;
    doc.status = 'ready_to_attach';
    doc.updatedAt = new Date();
    await doc.save();

    return this.toResponse(doc, { includeSecrets: true });
  }

  private async resolvePowerExternalRef(
    doc: ICatalogVm,
    instanceId: string | undefined,
    missingMessage: string
  ): Promise<string> {
    let externalRef = doc.externalRef;
    if (instanceId && mongoose.Types.ObjectId.isValid(instanceId)) {
      const instance = await CatalogVmInstanceModel.findOne({
        _id: new mongoose.Types.ObjectId(instanceId),
        catalogVmId: doc._id,
      }).lean();
      if (instance?.externalRef) {
        externalRef = instance.externalRef;
      }
    }

    if (!externalRef) {
      throw new ValidationError(missingMessage);
    }

    return externalRef;
  }

  private async executeCatalogPowerAction(
    doc: ICatalogVm,
    action: CatalogPowerAction,
    instanceId: string | undefined,
    opts: { ownerFacing: boolean }
  ): Promise<{ action: CatalogPowerAction; panelUrl?: string }> {
    if (opts.ownerFacing) {
      if (doc.status !== 'active') {
        throw new ValidationError('Power controls are only available for active VMs.');
      }
      if (doc.provider !== 'webyne') {
        throw new ValidationError('Power controls are not available for this VM.');
      }
    } else if (!['ready_to_attach', 'active', 'failed'].includes(doc.status)) {
      throw new ValidationError(
        'Power controls are available after the VM has been provisioned on Webyne.'
      );
    }

    const externalRef = await this.resolvePowerExternalRef(
      doc,
      instanceId,
      opts.ownerFacing
        ? 'This VM is not ready for power controls yet.'
        : 'Missing Webyne machine id (externalRef). Use Fetch details first.'
    );

    const result = await callCatalogAgentPower({
      externalRef,
      action,
    });

    logger.info('[VmCatalog] Catalog VM power action completed', {
      requestId: doc._id.toString(),
      action,
      ownerFacing: opts.ownerFacing,
      panelUrl: result.panelUrl,
    });

    return {
      action,
      ...(result.panelUrl ? { panelUrl: result.panelUrl } : {}),
    };
  }

  /**
   * Super-admin: Virtualizor / Start / Stop / Reboot on Webyne machineshow.
   */
  async powerAction(
    id: mongoose.Types.ObjectId,
    action: CatalogPowerAction,
    instanceId?: string
  ): Promise<{
    action: CatalogPowerAction;
    panelUrl?: string;
    request: CatalogVmResponse;
  }> {
    const doc = await CatalogVmModel.findById(id);
    if (!doc) throw new NotFoundError('Catalog VM request not found.');

    const result = await this.executeCatalogPowerAction(doc, action, instanceId, {
      ownerFacing: false,
    });

    return {
      ...result,
      request: await this.toResponse(doc, { includeSecrets: true }),
    };
  }

  async powerActionForAdmin(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    action: CatalogPowerAction,
    instanceId?: string
  ): Promise<{
    action: CatalogPowerAction;
    panelUrl?: string;
    vm: CatalogVmResponse;
  }> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    const result = await this.executeCatalogPowerAction(doc, action, instanceId, {
      ownerFacing: true,
    });

    return {
      ...result,
      vm: await this.toCustomerResponse(doc),
    };
  }

  async powerActionForTenant(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId,
    action: CatalogPowerAction,
    instanceId?: string
  ): Promise<{
    action: CatalogPowerAction;
    panelUrl?: string;
    vm: CatalogVmResponse;
  }> {
    const doc = await this.findOwnedByTenant(id, tenantId);
    const result = await this.executeCatalogPowerAction(doc, action, instanceId, {
      ownerFacing: true,
    });

    return {
      ...result,
      vm: await this.toCustomerResponse(doc),
    };
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

    const customerNames = await this.resolveCustomerPlanNames([doc]);
    const customerPlanName = customerNames.get(doc.planId) ?? doc.planName;

    await this.notifyOwner(
      doc,
      'Webyne VM request rejected',
      shouldRefund
        ? `Your request for ${doc.quantity}× ${customerPlanName} was rejected and ₹${refundAmount} was refunded: ${reason}`
        : `Your request for ${doc.quantity}× ${customerPlanName} was rejected: ${reason}`,
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

    const preferredSoftwareIds = await this.resolvePreferredSoftwareIds(
      dto.preferredSoftwareIds
    );

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

    const priceBucket = catalogPricingBucket(dto.category);
    const resolved = await accountVmPricingService.resolveWebyneUnitPrice({
      account: { scopeType: 'tenant', tenantId: tenantId.toString() },
      category: priceBucket,
      planId: plan._id.toString(),
      period: billing as (typeof BILLING_PERIODS)[number],
      baseUnit,
    });

    const quantity = Math.max(1, Math.floor(Number(dto.quantity) || 1));
    const unitPrice = resolved.unitPrice;
    const subtotal = roundMoney(unitPrice * quantity);
    const tax = roundMoney(subtotal * GST_RATE);
    const total = roundMoney(subtotal + tax);

    if (!Number.isFinite(total) || total <= 0) {
      throw new ValidationError('Invalid purchase total.');
    }

    const projectCtx = dto.projectId
      ? await projectsService.assertUsableForTenantService({
          projectId: dto.projectId,
          tenantId: tenantId.toString(),
          serviceKey: 'create-vm',
        })
      : null;

    await walletService.debitWallet(
      tenantId.toString(),
      total,
      'catalog_vm_purchase',
      null,
      null,
      null,
      {
        projectId: projectCtx?.projectId.toString() ?? null,
        serviceKey: 'create-vm',
      }
    );

    let doc: ICatalogVm;
    try {
      doc = await CatalogVmModel.create({
        tenantId,
        tenantUserId,
        ...(projectCtx ? { projectId: projectCtx.projectId } : {}),
        preferredSoftwareIds,
        postReadyStatus: preferredSoftwareIds.length > 0 ? 'pending' : 'none',
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
        needsOsChange: needsOsTemplateChange(plan.name, dto.category),
        osTemplateChanged: false,
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
    const customerPlanName = this.displayNameForPlan(plan);
    await this.notifyTenantRequester(
      tenantId,
      tenantUserId,
      'Webyne VM is provisioning',
      `Your ${doc.quantity}× ${customerPlanName} purchase (₹${total}) was charged. It will be available soon.`,
      { requestId: doc._id.toString(), event: 'submitted', planName: customerPlanName, total }
    );

    return this.toCustomerResponse(doc);
  }

  async listForTenant(tenantId: mongoose.Types.ObjectId): Promise<CatalogVmResponse[]> {
    const docs = await CatalogVmModel.find({ tenantId }).sort({ createdAt: -1 });
    const responses = await this.toCustomerResponses(docs);
    return this.expandAdminResponsesWithInstances(docs, responses);
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
            linux: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$category',
                      ['linux', 'ubuntu', 'rocky', 'debian'],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
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
      recent: await this.toCustomerResponses(recentDocs),
    };
  }

  async getForTenant(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<CatalogVmResponse> {
    const doc = await this.findOwnedByTenant(id, tenantId);
    return this.toCustomerResponse(doc);
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
