import mongoose from 'mongoose';
import { ServerModel } from '../../models/server.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import { CredentialAssignmentModel } from '../../models/credentialAssignment.model';
import { ProjectModel } from '../../models/project.model';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { decrypt, encrypt } from '../../utils/crypto';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type {
  BulkDeleteResult,
  BulkDeleteSkip,
  InventoryAssignmentView,
  InventoryCredentialView,
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
  hasAssignment: boolean;
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
  assigned?: 'assigned' | 'unassigned';
  locked?: boolean;
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
};

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
            { $project: { _id: 1 } },
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
          srcUsername: { $literal: null },
          srcHasPassword: { $literal: false },
          hasAssignment: { $gt: [{ $size: '$asgs' }, 0] },
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
                status: { $ne: 'deleted' },
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
                srcUsername: '$username',
                srcHasPassword: {
                  $gt: [{ $strLenCP: { $ifNull: ['$password', ''] } }, 0],
                },
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
      postMatch['entries.projectId'] = new mongoose.Types.ObjectId(params.projectId);
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
        canReveal: true,
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
          // Platform VPS stores public-network passwords unencrypted, so reveal
          // is not offered for read-only sources.
          canReveal: false,
          assignments: [],
        });
      }

      const projectId = primary.projectId ?? row.entries.find((e) => e.projectId)?.projectId ?? null;
      const project = projectId ? projectMap.get(projectId.toString()) : undefined;
      const adminId = primary.adminId ?? row.entries.find((e) => e.adminId)?.adminId ?? null;
      const tenantId = primary.tenantId ?? row.entries.find((e) => e.tenantId)?.tenantId ?? null;

      return {
        ipAddress: row._id,
        sources: [...new Set(row.entries.map((e) => e.source))],
        serverId: owned ? owned.sourceId.toString() : null,
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

      cred.username = body.username;
      if (body.password) cred.password = encrypt(body.password);
      await cred.save();
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
      await CredentialAssignmentModel.deleteMany({ serverId: { $in: deletable } });
      await ServerCredentialModel.deleteMany({ serverId: { $in: deletable } });
      await ServerModel.deleteMany({ _id: { $in: deletable } });
    }

    return { deleted: deletable.length, skipped };
  }
}

export const vmInventoryService = new VmInventoryService();
