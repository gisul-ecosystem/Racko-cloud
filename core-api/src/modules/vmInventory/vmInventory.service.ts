import mongoose from 'mongoose';
import { ServerModel } from '../../models/server.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import { CredentialAssignmentModel } from '../../models/credentialAssignment.model';
import { ProjectModel } from '../../models/project.model';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { CatalogVmInstanceModel } from '../../models/catalogVmInstance.model';
import { DedicatedServerRequestModel } from '../../models/dedicatedServerRequest.model';
import { getVmInventorySettings, resolveProviderExpiryWarningDays } from '../../models/vmInventorySettings.model';
import { InstallRunModel } from '../../models/installRun.model';
import { VM } from '../vm/vm.model';
import { SoftwareCatalogModel } from '../software-catalog/software-catalog.model';
import { decrypt, encrypt } from '../../utils/crypto';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { inventoryExternalVmMirrorService } from './inventoryExternalVmMirror.service';
import { triggerProviderExpiryCheck } from './providerExpiryScheduler';
import { isSameUtcDay } from '../projects/projectExpiryDates';
import type { PushVmInput } from '../machine-manager/machine-manager.service';
import type { JobResponse } from '../machine-manager/machine-manager.types';
import type {
  BulkDeleteResult,
  BulkDeleteSkip,
  InstallRunDetail,
  InstallRunSummary,
  InstallRunTarget,
  InstallSoftwareContext,
  InventoryAssignmentView,
  InventoryCredentialView,
  InventoryNotificationSettings,
  InventorySource,
  VmInventoryListResult,
  VmInventoryRow,
} from './vmInventory.types';

/** Escape user input before embedding it in a Mongo $regex. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

/**
 * A normalized entry emitted by each source branch of the union. Several
 * entries can share an IP, in which case they merge into one row.
 */
interface NormalizedEntry {
  ipAddress: string;
  source: InventorySource;
  sourceId: mongoose.Types.ObjectId;
  vmType: string | null;
  vmSpec: string | null;
  planDuration: string | null;
  provider: string | null;
  providerStartDate: Date | null;
  providerEndDate: Date | null;
  inventoryLocked: boolean;
  adminId: mongoose.Types.ObjectId | null;
  tenantId: mongoose.Types.ObjectId | null;
  projectId: mongoose.Types.ObjectId | null;
  srcUsername: string | null;
  srcHasPassword: boolean;
  /** As stored, so still encrypted for every source but a public-network VPS. */
  srcPassword: string | null;
  /** Platform VPS only, and the one thing that says whether srcPassword is encrypted. */
  srcNetworkType: string | null;
  /** Parent catalog VM, on catalog entries only. Deletion happens at that level. */
  catalogVmId: mongoose.Types.ObjectId | null;
  /** Machines in the parent purchase, so the operator knows the blast radius. */
  catalogQuantity: number | null;
  hasAssignment: boolean;
  /**
   * Projects and assignees taken from the credential assignments, which is
   * where they live for inventory VMs — the server document keeps no projectId.
   * Empty for the read-only sources, which carry no assignments.
   */
  asgProjectIds: mongoose.Types.ObjectId[];
  asgAssigneeIds: mongoose.Types.ObjectId[];
}

interface GroupedRow {
  _id: string;
  entries: NormalizedEntry[];
  hasAssignment: boolean;
}

export interface ListInventoryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  source?: InventorySource;
  projectId?: string;
  adminId?: string;
  tenantId?: string;
  clientName?: string;
  assigneeId?: string;
  vmSpec?: string;
  assigned?: 'assigned' | 'unassigned';
  locked?: boolean;
}

/** Dropdown choices for the inventory filter bar. */
export interface InventoryFilterOptions {
  owners: Array<{ type: 'admin' | 'tenant'; id: string; label: string }>;
  projects: Array<{ id: string; name: string; clientName: string }>;
  clients: string[];
  assignees: Array<{ id: string; label: string }>;
  /** Only inventory-owned servers record a spec, so this comes from them alone. */
  vmSpecs: string[];
}

/**
 * Shared $project shape so every union branch emits identical fields.
 *
 * Every placeholder is wrapped in $literal: inside an inclusion projection a
 * bare `false` or `0` is read as a field *exclusion*, which Mongo rejects.
 */
const NULL_FIELDS = {
  vmSpec: { $literal: null },
  planDuration: { $literal: null },
  provider: { $literal: null },
  providerStartDate: { $literal: null },
  providerEndDate: { $literal: null },
  inventoryLocked: { $literal: false },
  hasAssignment: { $literal: false },
  asgProjectIds: { $literal: [] },
  asgAssigneeIds: { $literal: [] },
  catalogVmId: { $literal: null },
  catalogQuantity: { $literal: null },
};

/**
 * Machines the read-only sources still consider real.
 *
 * A terminated or cancelled catalog VM keeps its document — and its IP — long
 * after the box is gone, and those rows cannot be removed from the inventory
 * because they belong to another subsystem. Excluding them here is the only way
 * they stop occupying the list.
 */
const LIVE_CATALOG_STATUSES = ['ready_to_attach', 'active', 'suspended'];

/** Platform VPS states that mean the machine is being torn down or already is. */
const DEAD_VPS_STATUSES = ['deleted', 'deleting', 'delete_failed'];

/**
 * Decrypt a stored secret for display, or null if it will not come back.
 *
 * A single credential written under a rotated key must not fail the whole page,
 * so the row shows the password as unreadable instead of the list 500ing.
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

/**
 * The password of a machine owned by another subsystem.
 *
 * Catalog and dedicated servers encrypt theirs. Platform VPS encrypts only
 * private-network ones and keeps public ones in plaintext, which mirrors
 * resolveConsolePassword() in the VM service.
 */
function sourcePassword(entry: NormalizedEntry): string | null {
  if (!entry.srcPassword) return null;
  if (entry.source === 'platform_vm' && entry.srcNetworkType !== 'private') {
    return entry.srcPassword;
  }
  return safeDecrypt(entry.srcPassword);
}

/** Distinct owners and projects of one source collection, for filter options. */
const OWNER_GROUP: mongoose.PipelineStage.Group = {
  $group: {
    _id: null,
    adminIds: { $addToSet: '$adminId' },
    tenantIds: { $addToSet: '$tenantId' },
    projectIds: { $addToSet: '$projectId' },
  },
};

interface OwnerFacet {
  adminIds?: Array<mongoose.Types.ObjectId | null>;
  tenantIds?: Array<mongoose.Types.ObjectId | null>;
  projectIds?: Array<mongoose.Types.ObjectId | null>;
  platformUserIds?: Array<mongoose.Types.ObjectId | null>;
  tenantUserIds?: Array<mongoose.Types.ObjectId | null>;
}

/** Unique, non-null ids across several $addToSet results. */
function collectIds(
  ...sets: Array<Array<mongoose.Types.ObjectId | null> | undefined>
): mongoose.Types.ObjectId[] {
  const out = new Map<string, mongoose.Types.ObjectId>();
  for (const set of sets) {
    for (const id of set ?? []) {
      if (id) out.set(id.toString(), id);
    }
  }
  return [...out.values()];
}

class VmInventoryService {
  /**
   * Unified inventory across four sources, merged by IP address.
   *
   * Everything is read at query time so that project edits (which drive the
   * client start/end dates) show up immediately with no sync step. Grouping
   * happens before pagination so page counts are correct across sources.
   */
  async list(params: ListInventoryParams): Promise<VmInventoryListResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25));

    const pipeline: mongoose.PipelineStage[] = [
      // ── Branch 1: inventory-owned servers (the only writable source) ───
      {
        $lookup: {
          from: 'server_credentials',
          localField: '_id',
          foreignField: 'serverId',
          as: 'creds',
        },
      },
      {
        $lookup: {
          from: 'credential_assignments',
          let: { sid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$serverId', '$$sid'] }, status: 'active' } },
            { $project: { _id: 1, projectId: 1, assigneeId: 1 } },
          ],
          as: 'asgs',
        },
      },
      {
        $project: {
          _id: 0,
          ipAddress: 1,
          source: { $literal: 'inventory' as const },
          sourceId: '$_id',
          vmType: 1,
          vmSpec: 1,
          planDuration: 1,
          provider: 1,
          providerStartDate: 1,
          providerEndDate: 1,
          inventoryLocked: { $ifNull: ['$inventoryLocked', false] },
          adminId: 1,
          tenantId: 1,
          projectId: 1,
          // Inventory logins live in server_credentials, fetched during hydrate.
          srcUsername: { $literal: null },
          srcHasPassword: { $literal: false },
          srcPassword: { $literal: null },
          srcNetworkType: { $literal: null },
          catalogVmId: { $literal: null },
          catalogQuantity: { $literal: null },
          hasAssignment: { $gt: [{ $size: '$asgs' }, 0] },
          asgProjectIds: '$asgs.projectId',
          asgAssigneeIds: '$asgs.assigneeId',
          searchText: {
            $concatArrays: [
              [{ $toLower: { $ifNull: ['$ipAddress', ''] } }],
              [{ $toLower: { $ifNull: ['$provider', ''] } }],
              { $map: { input: '$creds', as: 'c', in: { $toLower: '$$c.username' } } },
            ],
          },
        },
      },

      // ── Branch 2: platform VPS ─────────────────────────────────────────
      {
        $unionWith: {
          coll: 'vms',
          pipeline: [
            {
              $match: {
                status: { $nin: DEAD_VPS_STATUSES },
                deletedAt: null,
                ipAddress: { $nin: [null, ''] },
              },
            },
            {
              $project: {
                _id: 0,
                ipAddress: 1,
                source: { $literal: 'platform_vm' as const },
                sourceId: '$_id',
                vmType: { $ifNull: ['$consoleProtocol', 'rdp'] },
                ...NULL_FIELDS,
                adminId: 1,
                tenantId: 1,
                projectId: 1,
                srcUsername: '$consoleUsername',
                srcHasPassword: {
                  $gt: [{ $strLenCP: { $ifNull: ['$consolePassword', ''] } }, 0],
                },
                srcPassword: '$consolePassword',
                srcNetworkType: '$networkType',
                searchText: [
                  { $toLower: { $ifNull: ['$ipAddress', ''] } },
                  { $toLower: { $ifNull: ['$consoleUsername', ''] } },
                ],
              },
            },
          ],
        },
      },

      // ── Branch 3: catalog VM instances ─────────────────────────────────
      // Instances are used rather than the parent catalog_vms document, whose
      // credentials duplicate instance #1 and would double-count the IP.
      {
        $unionWith: {
          coll: 'catalog_vm_instances',
          pipeline: [
            { $match: { ipAddress: { $nin: [null, ''] } } },
            {
              $lookup: {
                from: 'catalog_vms',
                localField: 'catalogVmId',
                foreignField: '_id',
                as: 'parent',
              },
            },
            // The instance has no status of its own worth trusting, so whether
            // the machine still exists is read off its catalog VM. An instance
            // whose parent is gone is a leftover and drops out here too.
            { $match: { 'parent.status': { $in: LIVE_CATALOG_STATUSES } } },
            {
              $project: {
                _id: 0,
                ipAddress: 1,
                source: { $literal: 'catalog_vm' as const },
                sourceId: '$_id',
                vmType: { $ifNull: ['$protocol', 'rdp'] },
                ...NULL_FIELDS,
                adminId: 1,
                tenantId: 1,
                // Instances carry no projectId; it lives on the parent.
                projectId: { $first: '$parent.projectId' },
                // Deleting a catalog VM is a parent-level operation, and the
                // quantity tells the operator how many machines that covers.
                catalogVmId: '$catalogVmId',
                catalogQuantity: { $first: '$parent.quantity' },
                srcUsername: '$username',
                srcHasPassword: {
                  $gt: [{ $strLenCP: { $ifNull: ['$password', ''] } }, 0],
                },
                srcPassword: '$password',
                srcNetworkType: { $literal: null },
                searchText: [
                  { $toLower: { $ifNull: ['$ipAddress', ''] } },
                  { $toLower: { $ifNull: ['$username', ''] } },
                ],
              },
            },
          ],
        },
      },

      // ── Branch 4: dedicated servers ────────────────────────────────────
      // The request document *is* the server once attached.
      {
        $unionWith: {
          coll: 'dedicated_server_requests',
          pipeline: [
            {
              $match: {
                ipAddress: { $nin: [null, ''] },
                status: { $in: ['active', 'suspended'] },
              },
            },
            {
              $project: {
                _id: 0,
                ipAddress: 1,
                source: { $literal: 'dedicated_server' as const },
                sourceId: '$_id',
                vmType: { $ifNull: ['$protocol', 'rdp'] },
                ...NULL_FIELDS,
                adminId: 1,
                tenantId: 1,
                projectId: 1,
                srcUsername: '$username',
                srcHasPassword: {
                  $gt: [{ $strLenCP: { $ifNull: ['$password', ''] } }, 0],
                },
                srcPassword: '$password',
                srcNetworkType: { $literal: null },
                searchText: [
                  { $toLower: { $ifNull: ['$ipAddress', ''] } },
                  { $toLower: { $ifNull: ['$username', ''] } },
                ],
              },
            },
          ],
        },
      },

      // ── Merge every source on IP ───────────────────────────────────────
      {
        $group: {
          _id: '$ipAddress',
          entries: { $push: '$$ROOT' },
          hasAssignment: { $max: '$hasAssignment' },
          searchText: { $push: '$searchText' },
        },
      },
      {
        $set: {
          searchText: {
            $reduce: {
              input: '$searchText',
              initialValue: [] as string[],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
    ];

    // ── Filters applied to the merged row ────────────────────────────────
    const postMatch: Record<string, unknown> = {};
    /** Conditions needing their own $or, which cannot share the match object. */
    const and: Array<Record<string, unknown>> = [];

    /** A project matches whether it sits on the source doc or an assignment. */
    const matchProjects = (ids: mongoose.Types.ObjectId[]): Record<string, unknown> => ({
      $or: [
        { 'entries.projectId': { $in: ids } },
        { 'entries.asgProjectIds': { $in: ids } },
      ],
    });

    if (params.search?.trim()) {
      postMatch['searchText'] = {
        $regex: escapeRegex(params.search.trim().toLowerCase()),
      };
    }
    if (params.source) {
      postMatch['entries.source'] = params.source;
    }
    if (params.projectId) {
      if (!mongoose.Types.ObjectId.isValid(params.projectId)) {
        throw new ValidationError('Invalid projectId.');
      }
      and.push(matchProjects([new mongoose.Types.ObjectId(params.projectId)]));
    }
    if (params.clientName) {
      // Client name is a project field, so it resolves to that client's projects.
      const clientProjects = await ProjectModel.find({ clientName: params.clientName })
        .select('_id')
        .lean();
      if (clientProjects.length === 0) return { rows: [], total: 0, page, pageSize };
      and.push(matchProjects(clientProjects.map((p) => p._id)));
    }
    if (params.vmSpec) {
      postMatch['entries.vmSpec'] = params.vmSpec;
    }
    if (params.assigneeId) {
      if (!mongoose.Types.ObjectId.isValid(params.assigneeId)) {
        throw new ValidationError('Invalid assigneeId.');
      }
      postMatch['entries.asgAssigneeIds'] = new mongoose.Types.ObjectId(params.assigneeId);
    }
    if (params.adminId) {
      if (!mongoose.Types.ObjectId.isValid(params.adminId)) {
        throw new ValidationError('Invalid adminId.');
      }
      postMatch['entries.adminId'] = new mongoose.Types.ObjectId(params.adminId);
    }
    if (params.tenantId) {
      if (!mongoose.Types.ObjectId.isValid(params.tenantId)) {
        throw new ValidationError('Invalid tenantId.');
      }
      postMatch['entries.tenantId'] = new mongoose.Types.ObjectId(params.tenantId);
    }
    if (params.assigned === 'assigned') postMatch['hasAssignment'] = true;
    if (params.assigned === 'unassigned') postMatch['hasAssignment'] = { $ne: true };
    if (params.locked !== undefined) postMatch['entries.inventoryLocked'] = params.locked;
    if (and.length > 0) postMatch['$and'] = and;

    if (Object.keys(postMatch).length > 0) {
      pipeline.push({ $match: postMatch });
    }

    pipeline.push(
      { $sort: { _id: 1 } },
      {
        $facet: {
          rows: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
          count: [{ $count: 'total' }],
        },
      }
    );

    const [facet] = await ServerModel.aggregate<{
      rows: GroupedRow[];
      count: Array<{ total: number }>;
    }>(pipeline);

    const grouped = facet?.rows ?? [];
    const total = facet?.count?.[0]?.total ?? 0;

    const rows = await this.hydrate(grouped);

    return { rows, total, page, pageSize };
  }

  /**
   * Fill in credentials, assignments, projects and owner labels for one page of
   * rows. Bounded by pageSize, so the per-row lookups stay cheap.
   */
  private async hydrate(grouped: GroupedRow[]): Promise<VmInventoryRow[]> {
    if (grouped.length === 0) return [];

    const serverIds: mongoose.Types.ObjectId[] = [];
    const projectIds = new Set<string>();
    const adminIds = new Set<string>();
    const tenantIds = new Set<string>();

    for (const row of grouped) {
      for (const entry of row.entries) {
        if (entry.source === 'inventory') serverIds.push(entry.sourceId);
        if (entry.projectId) projectIds.add(entry.projectId.toString());
        if (entry.adminId) adminIds.add(entry.adminId.toString());
        if (entry.tenantId) tenantIds.add(entry.tenantId.toString());
      }
    }

    const credentials = serverIds.length
      ? await ServerCredentialModel.find({ serverId: { $in: serverIds } })
          .sort({ isPrimary: -1, username: 1 })
          .lean()
      : [];

    const assignments = credentials.length
      ? await CredentialAssignmentModel.find({
          credentialId: { $in: credentials.map((c) => c._id) },
          status: 'active',
        }).lean()
      : [];

    for (const a of assignments) projectIds.add(a.projectId.toString());

    const [projects, admins, tenants, platformUsers, tenantUsers] = await Promise.all([
      projectIds.size
        ? ProjectModel.find({ _id: { $in: [...projectIds] } })
            .select('_id name clientName startDate endDate')
            .lean()
        : [],
      adminIds.size
        ? User.find({ _id: { $in: [...adminIds] } }).select('_id email').lean()
        : [],
      tenantIds.size
        ? Tenant.find({ _id: { $in: [...tenantIds] } }).select('_id name').lean()
        : [],
      assignments.some((a) => a.assigneeType === 'platform_user')
        ? User.find({
            _id: {
              $in: assignments
                .filter((a) => a.assigneeType === 'platform_user')
                .map((a) => a.assigneeId),
            },
          })
            .select('_id email username')
            .lean()
        : [],
      assignments.some((a) => a.assigneeType === 'tenant_user')
        ? TenantUser.find({
            _id: {
              $in: assignments
                .filter((a) => a.assigneeType === 'tenant_user')
                .map((a) => a.assigneeId),
            },
          })
            .select('_id email username')
            .lean()
        : [],
    ]);

    const projectMap = new Map(projects.map((p) => [p._id.toString(), p]));
    const adminMap = new Map(admins.map((a) => [a._id.toString(), a]));
    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));
    const assigneeMap = new Map<string, { email: string | null; username: string | null }>();
    for (const u of platformUsers) {
      assigneeMap.set(u._id.toString(), { email: u.email ?? null, username: u.username ?? null });
    }
    for (const u of tenantUsers) {
      assigneeMap.set(u._id.toString(), { email: u.email ?? null, username: u.username ?? null });
    }

    const assignmentsByCredential = new Map<string, InventoryAssignmentView[]>();
    for (const a of assignments) {
      const project = projectMap.get(a.projectId.toString());
      const assignee = assigneeMap.get(a.assigneeId.toString());
      const view: InventoryAssignmentView = {
        assignmentId: a._id.toString(),
        assigneeType: a.assigneeType,
        assigneeId: a.assigneeId.toString(),
        email: assignee?.email ?? null,
        username: assignee?.username ?? null,
        projectId: a.projectId.toString(),
        projectName: project?.name ?? null,
        clientName: project?.clientName ?? null,
        clientStartDate: iso(project?.startDate),
        clientEndDate: iso(project?.endDate),
        accessOverride: Boolean(a.accessOverride),
        accessOverrideUntil: iso(a.accessOverrideUntil),
      };
      const key = a.credentialId.toString();
      const list = assignmentsByCredential.get(key);
      if (list) list.push(view);
      else assignmentsByCredential.set(key, [view]);
    }

    const credentialsByServer = new Map<string, InventoryCredentialView[]>();
    for (const c of credentials) {
      const view: InventoryCredentialView = {
        credentialId: c._id.toString(),
        source: 'inventory',
        username: c.username,
        hasPassword: Boolean(c.password),
        password: safeDecrypt(c.password),
        assignments: assignmentsByCredential.get(c._id.toString()) ?? [],
      };
      const key = c.serverId.toString();
      const list = credentialsByServer.get(key);
      if (list) list.push(view);
      else credentialsByServer.set(key, [view]);
    }

    return grouped.map((row) => {
      const owned = row.entries.find((e) => e.source === 'inventory') ?? null;
      // Prefer the inventory-owned entry for row metadata; fall back to any source.
      const primary = owned ?? row.entries[0]!;

      const rowCredentials: InventoryCredentialView[] = [];
      if (owned) {
        rowCredentials.push(...(credentialsByServer.get(owned.sourceId.toString()) ?? []));
      }
      for (const entry of row.entries) {
        if (entry.source === 'inventory') continue;
        rowCredentials.push({
          credentialId: null,
          source: entry.source,
          username: entry.srcUsername ?? null,
          hasPassword: entry.srcHasPassword,
          password: sourcePassword(entry),
          assignments: [],
        });
      }

      // A catalog machine can share its IP with an inventory row, so the
      // catalog entry is found rather than assumed to be the primary one.
      const catalogEntry = row.entries.find((e) => e.source === 'catalog_vm') ?? null;
      const projectId = primary.projectId ?? row.entries.find((e) => e.projectId)?.projectId ?? null;
      const project = projectId ? projectMap.get(projectId.toString()) : undefined;
      const adminId = primary.adminId ?? row.entries.find((e) => e.adminId)?.adminId ?? null;
      const tenantId = primary.tenantId ?? row.entries.find((e) => e.tenantId)?.tenantId ?? null;

      return {
        ipAddress: row._id,
        sources: [...new Set(row.entries.map((e) => e.source))],
        serverId: owned ? owned.sourceId.toString() : null,
        catalogVmId: catalogEntry?.catalogVmId?.toString() ?? null,
        catalogQuantity: catalogEntry?.catalogQuantity ?? null,
        vmType: primary.vmType ?? null,
        vmSpec: owned?.vmSpec ?? null,
        planDuration: owned?.planDuration ?? null,
        provider: owned?.provider ?? null,
        providerStartDate: iso(owned?.providerStartDate),
        providerEndDate: iso(owned?.providerEndDate),
        inventoryLocked: row.entries.some((e) => e.inventoryLocked),
        owner: {
          adminId: adminId?.toString() ?? null,
          adminEmail: adminId ? adminMap.get(adminId.toString())?.email ?? null : null,
          tenantId: tenantId?.toString() ?? null,
          tenantName: tenantId ? tenantMap.get(tenantId.toString())?.name ?? null : null,
        },
        projectId: projectId?.toString() ?? null,
        projectName: project?.name ?? null,
        clientName: project?.clientName ?? null,
        clientStartDate: iso(project?.startDate),
        clientEndDate: iso(project?.endDate),
        credentials: rowCredentials,
      };
    });
  }

  /**
   * Choices for the filter dropdowns, gathered from the values actually present
   * in the inventory so a filter can never select an empty result.
   *
   * Owners and projects are read from all four sources plus the assignments,
   * because an inventory VM keeps its project on the assignment rather than on
   * the server document.
   */
  async listFilterOptions(): Promise<InventoryFilterOptions> {
    const [servers, vps, instances, dedicated, catalogParents, assignments, specs] =
      await Promise.all([
        ServerModel.aggregate<OwnerFacet>([OWNER_GROUP]),
        VM.aggregate<OwnerFacet>([
          { $match: { status: { $nin: DEAD_VPS_STATUSES }, deletedAt: null } },
          OWNER_GROUP,
        ]),
        // Mirrors the list's catalog branch, or a terminated VM's owner would
        // still be offered as a filter that then matches nothing.
        CatalogVmInstanceModel.aggregate<OwnerFacet>([
          {
            $lookup: {
              from: 'catalog_vms',
              localField: 'catalogVmId',
              foreignField: '_id',
              as: 'parent',
            },
          },
          { $match: { 'parent.status': { $in: LIVE_CATALOG_STATUSES } } },
          OWNER_GROUP,
        ]),
        DedicatedServerRequestModel.aggregate<OwnerFacet>([
          { $match: { status: { $in: ['active', 'suspended'] } } },
          OWNER_GROUP,
        ]),
        // Instances carry no projectId; it lives on the parent catalog VM.
        CatalogVmModel.aggregate<OwnerFacet>([
          { $match: { status: { $in: LIVE_CATALOG_STATUSES } } },
          { $group: { _id: null, projectIds: { $addToSet: '$projectId' } } },
        ]),
        CredentialAssignmentModel.aggregate<OwnerFacet>([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: null,
              adminIds: { $addToSet: '$adminId' },
              tenantIds: { $addToSet: '$tenantId' },
              projectIds: { $addToSet: '$projectId' },
              platformUserIds: {
                $addToSet: {
                  $cond: [{ $eq: ['$assigneeType', 'platform_user'] }, '$assigneeId', null],
                },
              },
              tenantUserIds: {
                $addToSet: {
                  $cond: [{ $eq: ['$assigneeType', 'tenant_user'] }, '$assigneeId', null],
                },
              },
            },
          },
        ]),
        ServerModel.distinct('vmSpec'),
      ]);

    const adminIds = collectIds(
      servers[0]?.adminIds,
      vps[0]?.adminIds,
      instances[0]?.adminIds,
      dedicated[0]?.adminIds,
      assignments[0]?.adminIds
    );
    const tenantIds = collectIds(
      servers[0]?.tenantIds,
      vps[0]?.tenantIds,
      instances[0]?.tenantIds,
      dedicated[0]?.tenantIds,
      assignments[0]?.tenantIds
    );
    const projectIds = collectIds(
      servers[0]?.projectIds,
      vps[0]?.projectIds,
      dedicated[0]?.projectIds,
      catalogParents[0]?.projectIds,
      assignments[0]?.projectIds
    );
    const platformUserIds = collectIds(assignments[0]?.platformUserIds);
    const tenantUserIds = collectIds(assignments[0]?.tenantUserIds);

    const [admins, tenants, projects, platformUsers, tenantUsers] = await Promise.all([
      adminIds.length ? User.find({ _id: { $in: adminIds } }).select('_id email').lean() : [],
      tenantIds.length ? Tenant.find({ _id: { $in: tenantIds } }).select('_id name').lean() : [],
      projectIds.length
        ? ProjectModel.find({ _id: { $in: projectIds } })
            .select('_id name clientName')
            .lean()
        : [],
      platformUserIds.length
        ? User.find({ _id: { $in: platformUserIds } })
            .select('_id email username')
            .lean()
        : [],
      tenantUserIds.length
        ? TenantUser.find({ _id: { $in: tenantUserIds } })
            .select('_id email username')
            .lean()
        : [],
    ]);

    const byLabel = (a: { label: string }, b: { label: string }): number =>
      a.label.localeCompare(b.label);

    return {
      owners: [
        ...admins.map((a) => ({
          type: 'admin' as const,
          id: a._id.toString(),
          label: a.email ?? a._id.toString(),
        })),
        ...tenants.map((t) => ({
          type: 'tenant' as const,
          id: t._id.toString(),
          label: t.name,
        })),
      ].sort(byLabel),
      projects: projects
        .map((p) => ({ id: p._id.toString(), name: p.name, clientName: p.clientName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      clients: [...new Set(projects.map((p) => p.clientName).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
      assignees: [...platformUsers, ...tenantUsers]
        .map((u) => ({ id: u._id.toString(), label: u.email ?? u.username ?? u._id.toString() }))
        .sort(byLabel),
      // Numeric collation so "Memory (8GB)" sorts before "Memory (32GB)".
      vmSpecs: (specs as Array<string | null>)
        .filter((s): s is string => Boolean(s && s.trim()))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    };
  }

  /** Decrypt a single stored credential. Gated by vm_inventory.reveal_credentials. */
  async revealPassword(credentialId: string): Promise<{ username: string; password: string }> {
    if (!mongoose.Types.ObjectId.isValid(credentialId)) {
      throw new ValidationError('Invalid credentialId.');
    }
    const cred = await ServerCredentialModel.findById(credentialId).lean();
    if (!cred) throw new NotFoundError('Credential not found.');

    try {
      return { username: cred.username, password: decrypt(cred.password) };
    } catch {
      throw new ValidationError(
        'Stored credential could not be decrypted. The encryption key may have changed.'
      );
    }
  }

  /** Edit server metadata. Only inventory-owned servers are editable. */
  async updateServer(
    serverId: string,
    body: {
      vmType?: 'rdp' | 'ssh' | 'vnc';
      vmSpec?: string | null;
      planDuration?: 'hourly' | 'monthly' | 'quarterly' | 'yearly' | null;
      provider?: string | null;
      providerStartDate?: Date | null;
      providerEndDate?: Date | null;
      notes?: string | null;
    }
  ): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      throw new ValidationError('Invalid serverId.');
    }
    const server = await ServerModel.findById(serverId);
    if (!server) throw new NotFoundError('Server not found.');

    if (
      body.providerStartDate &&
      body.providerEndDate &&
      body.providerStartDate > body.providerEndDate
    ) {
      throw new ValidationError('providerStartDate must be on or before providerEndDate.');
    }

    if (body.providerEndDate !== undefined) {
      const prev = server.providerEndDate ?? null;
      const next = body.providerEndDate;
      if (!prev || !next || !isSameUtcDay(prev, next)) {
        server.providerExpiryAlertSentFor = null;
      }
    }

    Object.assign(server, body);
    await server.save();
  }

  /** Add or edit a login on an inventory-owned server. */
  async upsertCredential(
    serverId: string,
    body: { credentialId?: string; username: string; password?: string }
  ): Promise<{ credentialId: string }> {
    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      throw new ValidationError('Invalid serverId.');
    }
    const server = await ServerModel.findById(serverId).lean();
    if (!server) throw new NotFoundError('Server not found.');

    if (body.credentialId) {
      if (!mongoose.Types.ObjectId.isValid(body.credentialId)) {
        throw new ValidationError('Invalid credentialId.');
      }
      const cred = await ServerCredentialModel.findOne({
        _id: body.credentialId,
        serverId: server._id,
      });
      if (!cred) throw new NotFoundError('Credential not found on this server.');

      const clash = await ServerCredentialModel.findOne({
        serverId: server._id,
        username: body.username,
        _id: { $ne: cred._id },
      }).lean();
      if (clash) {
        throw new ValidationError(`Username "${body.username}" already exists on this IP.`);
      }

      const previousUsername = cred.username;
      cred.username = body.username;
      if (body.password) cred.password = encrypt(body.password);
      await cred.save();
      // Mirrors carry their own copy of the login, so an edit has to reach them
      // or the assignee keeps connecting with the old credential.
      await inventoryExternalVmMirrorService.syncCredential(cred._id, previousUsername);
      return { credentialId: cred._id.toString() };
    }

    if (!body.password) {
      throw new ValidationError('password is required when adding a new credential.');
    }

    const existing = await ServerCredentialModel.findOne({
      serverId: server._id,
      username: body.username,
    }).lean();
    if (existing) {
      throw new ValidationError(`Username "${body.username}" already exists on this IP.`);
    }

    const count = await ServerCredentialModel.countDocuments({ serverId: server._id });
    const created = await ServerCredentialModel.create({
      serverId: server._id,
      username: body.username,
      password: encrypt(body.password),
      isPrimary: count === 0,
    });
    return { credentialId: created._id.toString() };
  }

  async setLock(serverId: string, inventoryLocked: boolean): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      throw new ValidationError('Invalid serverId.');
    }
    const res = await ServerModel.updateOne({ _id: serverId }, { $set: { inventoryLocked } });
    if (res.matchedCount === 0) throw new NotFoundError('Server not found.');
  }

  /**
   * Reset the selected VMs through the Machine Manager agent.
   *
   * The inventory tracks machines by IP while the agent is registered per
   * machine record, so the selection is resolved IP-first. A VM with no agent
   * installed comes back as `notManaged` — there is nothing to reset on it.
   */
  async resetServers(serverIds: string[]): Promise<{
    sessionId: string;
    accepted: Array<{ ipAddress: string; machineId: string; machineName: string }>;
    offline: Array<{ ipAddress: string; machineId: string; machineName: string }>;
    notManaged: string[];
  }> {
    if (serverIds.length === 0) throw new ValidationError('No servers selected.');
    if (serverIds.length > 100) {
      throw new ValidationError('Reset is capped at 100 VMs per request.');
    }

    for (const id of serverIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError(`Invalid serverId "${id}".`);
      }
    }

    const servers = await ServerModel.find({ _id: { $in: serverIds } })
      .select('ipAddress')
      .lean();
    if (servers.length === 0) throw new NotFoundError('None of those servers exist.');

    const sessionId = `reset-${Date.now()}`;
    const { machineManagerService } = await import('../machine-manager/machine-manager.service');
    const result = await machineManagerService.resetMachinesByIp(
      servers.map((s) => s.ipAddress),
      sessionId
    );

    return { sessionId, ...result };
  }

  /**
   * Install the Racko agent on the selected VMs over WinRM (Windows) or SSH.
   *
   * Unlike the Machine Manager's own push screen, nobody types credentials here:
   * they come from the inventory's stored login and are decrypted for the single
   * push, never returned to the browser. The login used is the VM's primary one,
   * since a lab user's account may not be able to install a service.
   *
   * Push is what makes reset and software install possible, so a VM already
   * running an agent is reported as such instead of being pushed again.
   */
  async pushAgent(
    serverIds: string[],
    adminId: mongoose.Types.ObjectId,
    installRackoApp: boolean
  ): Promise<{
    sessionId: string;
    targets: Array<{
      ipAddress: string;
      machineId: string;
      machineName: string;
      os: string;
      /** The inventory login the push authenticated with. */
      username: string;
    }>;
    alreadyOnline: Array<{ ipAddress: string; machineId: string; machineName: string }>;
    /** VMs that could not be attempted, with the reason. */
    skipped: Array<{ ipAddress: string; reason: string }>;
  }> {
    if (serverIds.length === 0) throw new ValidationError('No servers selected.');
    if (serverIds.length > 50) {
      throw new ValidationError('Agent push is capped at 50 VMs per request.');
    }

    for (const id of serverIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError(`Invalid serverId "${id}".`);
      }
    }

    const servers = await ServerModel.find({ _id: { $in: serverIds } })
      .select('ipAddress vmType')
      .lean();
    if (servers.length === 0) throw new NotFoundError('None of those servers exist.');

    const credentials = await ServerCredentialModel.find({
      serverId: { $in: servers.map((s) => s._id) },
      status: 'active',
    })
      .select('serverId username password isPrimary')
      .lean();

    const credByServer = new Map<string, (typeof credentials)[number]>();
    for (const cred of credentials) {
      const key = cred.serverId.toString();
      const held = credByServer.get(key);
      if (!held || (cred.isPrimary && !held.isPrimary)) credByServer.set(key, cred);
    }

    const skipped: Array<{ ipAddress: string; reason: string }> = [];
    const vms: PushVmInput[] = [];
    const usernameByIp = new Map<string, string>();

    for (const server of servers) {
      const cred = credByServer.get(server._id.toString());
      if (!cred) {
        skipped.push({
          ipAddress: server.ipAddress,
          reason: 'No active login stored. Add one in VM Inventory first.',
        });
        continue;
      }

      let password: string;
      try {
        password = decrypt(cred.password);
      } catch {
        skipped.push({
          ipAddress: server.ipAddress,
          reason: 'Stored password could not be decrypted. Re-enter it in VM Inventory.',
        });
        continue;
      }

      // The inventory records how a VM is reached, which is the only OS signal it
      // has: RDP means Windows, SSH and VNC mean a Unix box.
      vms.push({
        name: server.ipAddress,
        ipAddress: server.ipAddress,
        os: server.vmType === 'rdp' ? 'windows' : 'linux',
        username: cred.username,
        password,
      });
      usernameByIp.set(server.ipAddress, cred.username);
    }

    if (vms.length === 0) {
      throw new ValidationError(
        'None of the selected VMs have a usable login, so there is nothing to push to.'
      );
    }

    const sessionId = `push-${Date.now()}`;
    const { machineManagerService } = await import('../machine-manager/machine-manager.service');
    const result = await machineManagerService.pushAgentToVMsByIp(
      vms,
      adminId,
      sessionId,
      installRackoApp
    );

    return {
      sessionId,
      targets: result.machines.map((m) => ({
        ipAddress: m.ipAddress,
        machineId: m._id,
        machineName: m.name,
        os: m.os,
        username: usernameByIp.get(m.ipAddress) ?? '',
      })),
      alreadyOnline: result.alreadyOnline,
      skipped,
    };
  }

  /**
   * Queue Machine Manager install jobs on the VMs behind the selected logins.
   *
   * Selection in the assign flow is per login, and several logins can live on
   * one VM, so the logins are collapsed to unique IPs before dispatch — the
   * software is installed once per machine, not once per user. Jobs are owned
   * by the initiating super admin so they show up in their Jobs & Status view.
   *
   * The batch is also saved as an install run, which is what lets the assign
   * page show this progress again after the operator navigates away.
   */
  async installSoftware(
    credentialIds: string[],
    softwareIds: string[],
    adminId: mongoose.Types.ObjectId,
    context?: InstallSoftwareContext
  ): Promise<{
    /** Null when the run could not be saved; the installs still went ahead. */
    runId: string | null;
    jobs: JobResponse[];
    targets: InstallRunTarget[];
    notManaged: string[];
  }> {
    if (credentialIds.length === 0) throw new ValidationError('No logins selected.');
    if (softwareIds.length === 0) throw new ValidationError('No software selected.');

    for (const id of [...credentialIds, ...softwareIds]) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError(`Invalid id "${id}".`);
      }
    }

    const credentials = await ServerCredentialModel.find({ _id: { $in: credentialIds } })
      .select('serverId username')
      .lean();
    if (credentials.length === 0) throw new NotFoundError('None of those logins exist.');

    const serverIds = [...new Set(credentials.map((c) => c.serverId.toString()))];
    const servers = await ServerModel.find({ _id: { $in: serverIds } })
      .select('ipAddress')
      .lean();
    if (servers.length === 0) throw new NotFoundError('None of those servers exist.');

    const { machineManagerService } = await import('../machine-manager/machine-manager.service');
    const result = await machineManagerService.createJobsByIp(
      servers.map((s) => s.ipAddress),
      softwareIds,
      adminId
    );

    // Recording the run must not cost the caller their jobs, which are already
    // queued and running by this point.
    let runId: string | null = null;
    try {
      runId = await this.recordInstallRun({
        adminId,
        credentials,
        servers,
        softwareIds,
        result,
        context,
      });
    } catch (err) {
      logger.warn('[VmInventory] Could not record the install run', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      runId,
      jobs: result.jobs,
      targets: result.matched,
      notManaged: result.notManaged,
    };
  }

  /**
   * Save the grouping for an install batch so it can be reopened later.
   *
   * Names are resolved here from the ids the client sent rather than trusting
   * labels off the wire, and the per-VM rows are denormalized so the run still
   * reads correctly once the inventory moves on.
   */
  private async recordInstallRun(input: {
    adminId: mongoose.Types.ObjectId;
    credentials: Array<{ serverId: mongoose.Types.ObjectId; username: string }>;
    servers: Array<{ _id: mongoose.Types.ObjectId; ipAddress: string }>;
    softwareIds: string[];
    result: { jobs: JobResponse[]; matched: InstallRunTarget[]; notManaged: string[] };
    context?: InstallSoftwareContext;
  }): Promise<string> {
    const { adminId, credentials, servers, softwareIds, result, context } = input;

    const ipByServer = new Map(servers.map((s) => [s._id.toString(), s.ipAddress]));
    /** One IP can carry several logins, so usernames collect per IP. */
    const usernamesByIp = new Map<string, string[]>();
    for (const cred of credentials) {
      const ip = ipByServer.get(cred.serverId.toString());
      if (!ip) continue;
      const list = usernamesByIp.get(ip);
      if (list) list.push(cred.username);
      else usernamesByIp.set(ip, [cred.username]);
    }

    const emailByIp = new Map<string, string>();
    for (const row of context?.assigned ?? []) {
      if (row.ipAddress && row.email) emailByIp.set(row.ipAddress, row.email);
    }

    const targetByIp = new Map(result.matched.map((t) => [t.ipAddress, t]));
    const notManaged = new Set(result.notManaged);

    const vms = [...usernamesByIp.entries()].map(([ipAddress, usernames]) => {
      const target = targetByIp.get(ipAddress);
      return {
        ipAddress,
        vmUsername: usernames.join(', '),
        email: emailByIp.get(ipAddress),
        machineId: target ? new mongoose.Types.ObjectId(target.machineId) : undefined,
        machineName: target?.machineName,
        notManaged: notManaged.has(ipAddress),
      };
    });

    const [software, project, targetLabel] = await Promise.all([
      SoftwareCatalogModel.find({ _id: { $in: softwareIds } })
        .select('name')
        .lean(),
      context?.projectId && mongoose.Types.ObjectId.isValid(context.projectId)
        ? ProjectModel.findById(context.projectId).select('name clientName').lean()
        : null,
      this.resolveAssignTargetLabel(context),
    ]);

    const run = await InstallRunModel.create({
      startedBy: adminId,
      ...(context?.targetType ? { targetType: context.targetType } : {}),
      ...(context?.targetId && mongoose.Types.ObjectId.isValid(context.targetId)
        ? { targetId: new mongoose.Types.ObjectId(context.targetId) }
        : {}),
      ...(targetLabel ? { targetLabel } : {}),
      ...(project ? { projectId: project._id, projectName: project.name } : {}),
      ...(project?.clientName ? { clientName: project.clientName } : {}),
      ...(context?.assignedCount !== undefined ? { assignedCount: context.assignedCount } : {}),
      softwareIds: softwareIds.map((id) => new mongoose.Types.ObjectId(id)),
      softwareNames: software.map((s) => s.name),
      jobIds: result.jobs.map((j) => new mongoose.Types.ObjectId(j._id)),
      vms,
      ...(context?.resetSummary ? { resetSummary: context.resetSummary } : {}),
    });

    return run._id.toString();
  }

  /** The admin's email or the tenant's name, for the run header. */
  private async resolveAssignTargetLabel(
    context?: InstallSoftwareContext
  ): Promise<string | null> {
    if (!context?.targetId || !mongoose.Types.ObjectId.isValid(context.targetId)) return null;
    if (context.targetType === 'tenant') {
      const tenant = await Tenant.findById(context.targetId).select('name').lean();
      return tenant?.name ?? null;
    }
    const admin = await User.findById(context.targetId).select('email').lean();
    return admin?.email ?? null;
  }

  /**
   * The operator's recent install runs, newest first.
   *
   * Job status is aggregated from `machine_jobs` on every read, so a run that
   * was still installing when the page was closed shows its real state now.
   */
  async listInstallRuns(
    adminId: mongoose.Types.ObjectId,
    limit = 20
  ): Promise<InstallRunSummary[]> {
    const runs = await InstallRunModel.find({ startedBy: adminId })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 50))
      .lean();
    if (runs.length === 0) return [];

    const { JobModel } = await import('../machine-manager/machine-manager.model');
    const jobIds = runs.flatMap((r) => r.jobIds);
    const jobs = await JobModel.find({ _id: { $in: jobIds } })
      .select('status')
      .lean();
    const statusByJob = new Map(jobs.map((j) => [j._id.toString(), j.status]));

    return runs.map((run) => {
      const counts = { pending: 0, installing: 0, success: 0, failed: 0, gone: 0 };
      for (const id of run.jobIds) {
        const status = statusByJob.get(id.toString());
        if (!status) counts.gone += 1;
        else if (status === 'success') counts.success += 1;
        else if (status === 'failed') counts.failed += 1;
        else if (status === 'installing') counts.installing += 1;
        else counts.pending += 1;
      }
      return {
        id: run._id.toString(),
        createdAt: run.createdAt.toISOString(),
        projectName: run.projectName ?? null,
        clientName: run.clientName ?? null,
        targetLabel: run.targetLabel ?? null,
        targetType: run.targetType ?? null,
        assignedCount: run.assignedCount ?? null,
        softwareNames: run.softwareNames,
        vmCount: run.vms.length,
        notManagedCount: run.vms.filter((v) => v.notManaged).length,
        resetSummary: run.resetSummary ?? null,
        jobTotal: run.jobIds.length,
        ...counts,
      };
    });
  }

  /**
   * One run with its jobs, shaped like a fresh install response so the same
   * progress panel renders both. Jobs deleted since the run are dropped rather
   * than faked, and the VM rows still list the IP so nothing goes missing.
   */
  async getInstallRun(
    adminId: mongoose.Types.ObjectId,
    runId: string
  ): Promise<InstallRunDetail> {
    if (!mongoose.Types.ObjectId.isValid(runId)) {
      throw new ValidationError('Invalid runId.');
    }
    const run = await InstallRunModel.findOne({ _id: runId, startedBy: adminId }).lean();
    if (!run) throw new NotFoundError('Install run not found.');

    const { machineManagerService } = await import('../machine-manager/machine-manager.service');
    const jobs = await machineManagerService.getJobsByIds(run.jobIds, adminId);

    return {
      id: run._id.toString(),
      createdAt: run.createdAt.toISOString(),
      projectName: run.projectName ?? null,
      clientName: run.clientName ?? null,
      targetLabel: run.targetLabel ?? null,
      targetType: run.targetType ?? null,
      assignedCount: run.assignedCount ?? null,
      softwareNames: run.softwareNames,
      resetSummary: run.resetSummary ?? null,
      vms: run.vms.map((v) => ({
        ipAddress: v.ipAddress,
        vmUsername: v.vmUsername ?? null,
        email: v.email ?? null,
        notManaged: v.notManaged,
      })),
      jobs,
      // The panel groups by machineId, so it needs the same target shape a
      // fresh install returns.
      targets: run.vms
        .filter((v) => v.machineId)
        .map((v) => ({
          machineId: v.machineId!.toString(),
          ipAddress: v.ipAddress,
          machineName: v.machineName ?? v.ipAddress,
          online: true,
        })),
      notManaged: run.vms.filter((v) => v.notManaged).map((v) => v.ipAddress),
    };
  }

  /** Delete an inventory-owned server plus its credentials and assignments. */
  async deleteServer(serverId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      throw new ValidationError('Invalid serverId.');
    }
    const server = await ServerModel.findById(serverId).lean();
    if (!server) throw new NotFoundError('Server not found.');
    if (server.inventoryLocked) {
      throw new ValidationError('Server is inventory-locked. Unlock it before deleting.');
    }

    await inventoryExternalVmMirrorService.dropServersByIp([server.ipAddress]);
    await CredentialAssignmentModel.deleteMany({ serverId: server._id });
    await ServerCredentialModel.deleteMany({ serverId: server._id });
    await ServerModel.deleteOne({ _id: server._id });
  }

  /**
   * Delete many inventory-owned servers in one request.
   *
   * Locked and already-gone servers are reported back rather than aborting the
   * batch, so one stale selection can't block the rest. Runs as four queries
   * total regardless of how many servers are selected.
   */
  async deleteServers(serverIds: string[]): Promise<BulkDeleteResult> {
    if (serverIds.length === 0) throw new ValidationError('No servers selected.');
    if (serverIds.length > 500) {
      throw new ValidationError('Bulk delete is capped at 500 servers per request.');
    }

    const ids: mongoose.Types.ObjectId[] = [];
    for (const id of serverIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError(`Invalid serverId "${id}".`);
      }
      ids.push(new mongoose.Types.ObjectId(id));
    }

    const servers = await ServerModel.find({ _id: { $in: ids } })
      .select('_id ipAddress inventoryLocked')
      .lean();
    const byId = new Map(servers.map((s) => [s._id.toString(), s]));

    const skipped: BulkDeleteSkip[] = [];
    const deletable: mongoose.Types.ObjectId[] = [];

    for (const id of ids) {
      const server = byId.get(id.toString());
      if (!server) {
        skipped.push({
          serverId: id.toString(),
          ipAddress: null,
          reason: 'Server no longer exists.',
        });
        continue;
      }
      if (server.inventoryLocked) {
        skipped.push({
          serverId: id.toString(),
          ipAddress: server.ipAddress,
          reason: 'Inventory-locked. Unlock it before deleting.',
        });
        continue;
      }
      deletable.push(server._id);
    }

    if (deletable.length > 0) {
      const deletableIps = deletable
        .map((id) => byId.get(id.toString())?.ipAddress)
        .filter((ip): ip is string => Boolean(ip));
      await inventoryExternalVmMirrorService.dropServersByIp(deletableIps);
      await CredentialAssignmentModel.deleteMany({ serverId: { $in: deletable } });
      await ServerCredentialModel.deleteMany({ serverId: { $in: deletable } });
      await ServerModel.deleteMany({ _id: { $in: deletable } });
    }

    return { deleted: deletable.length, skipped };
  }

  /** Who is alerted before a provider contract lapses, and how far ahead. */
  async getNotificationSettings(): Promise<InventoryNotificationSettings> {
    const settings = await getVmInventorySettings();
    return {
      providerExpiryRecipients: settings.providerExpiryRecipients,
      warningDays: resolveProviderExpiryWarningDays(settings.warningDays),
    };
  }

  async updateNotificationSettings(
    recipients: string[],
    updatedBy: mongoose.Types.ObjectId,
    warningDays?: number
  ): Promise<InventoryNotificationSettings> {
    // Case and order are noise here; a duplicate address would just mail twice.
    const cleaned = [
      ...new Set(recipients.map((e) => e.trim().toLowerCase()).filter(Boolean)),
    ].sort();

    const settings = await getVmInventorySettings();
    const previousDays = resolveProviderExpiryWarningDays(settings.warningDays);
    settings.providerExpiryRecipients = cleaned;
    if (warningDays !== undefined) {
      settings.warningDays = warningDays;
    }
    settings.updatedBy = updatedBy;
    await settings.save();

    const nextDays = resolveProviderExpiryWarningDays(settings.warningDays);
    if (warningDays !== undefined && previousDays !== nextDays) {
      triggerProviderExpiryCheck('lead-time-changed', { force: true });
    }

    return {
      providerExpiryRecipients: cleaned,
      warningDays: nextDays,
    };
  }
}

export const vmInventoryService = new VmInventoryService();
