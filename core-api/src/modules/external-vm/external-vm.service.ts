import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { TenantUser } from '../../models/tenantUser.model';
import { ExternalVMModel, type IExternalVM } from './external-vm.model';
import type {
  BulkAssignExternalPairsDto,
  BulkAssignExternalPairsResult,
  CreateExternalVMDto,
  ExternalVMConsoleSession,
  ExternalVMResponse,
  ExternalVmAssignmentSummary,
  ExternalVmMyAccess,
  AssignmentSchedulePublic,
  TenantBulkAssignExternalPairsDto,
} from './external-vm.types';
import { encrypt, decrypt } from '../../utils/crypto';
import { guacamoleClient } from '../../utils/guacamoleClient';
import { AccessWindowDeniedError, NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { managedUsersService } from '../managedUsers/managedUsers.service';
import { tenantUserService } from '../tenantUser/tenantUser.service';
import type { TenantUserRole } from '../../middleware/requireTenantAuth.middleware';
import {
  accessSchedulePublicView,
  parseAccessScheduleInput,
  type AccessScheduleInput,
} from '../vmAccessSchedule/accessScheduleParse';
import {
  cancelSchedule,
  unblockUserSession,
} from '../vmAccessSchedule/scheduleManager';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import {
  createExternalVmTenantAssignments,
  getAssignmentCountsByTenantUser,
  getAssignmentMapForExternalVms,
  getExternalVmIdsForTenantUser,
  getTenantUserIdsForExternalVm,
  isExternalVmAssignedToTenantUser,
  migrateLegacyExternalVmAssignments,
  removeAllExternalVmAssignmentsForVms,
  removeExternalVmTenantAssignment,
  syncLegacyAssignedTenantUserId,
} from './externalVmTenantAssignment.service';
import {
  getNextAllowedAccessHint,
  isAccessAllowedNow,
  type AssignmentSchedule,
} from './schedule.types';

type PlatformActorRole = 'admin' | 'super_admin' | 'staff' | 'user';

interface TenantExternalVmActor {
  id: string;
  tenantId: string;
  role: TenantUserRole;
}

function toAccessScheduleView(doc: IExternalVM): NonNullable<ExternalVMResponse['accessSchedule']> {
  const raw = accessSchedulePublicView(doc);
  return {
    startDate: raw.accessStartDate
      ? new Date(raw.accessStartDate).toISOString().slice(0, 10)
      : null,
    endDate: raw.accessEndDate
      ? new Date(raw.accessEndDate).toISOString().slice(0, 10)
      : null,
    startTime: raw.accessStartTime ?? null,
    endTime: raw.accessEndTime ?? null,
    override: Boolean(raw.accessOverride),
    overrideUntil: raw.accessOverrideUntil
      ? new Date(raw.accessOverrideUntil).toISOString()
      : null,
    timezone: raw.weeklyScheduleTz || 'Asia/Kolkata',
    weeklySchedule: raw.weeklySchedule ?? null,
  };
}

function toSchedulePublic(
  schedule?: AssignmentSchedule | null
): AssignmentSchedulePublic | null {
  if (!schedule) return null;
  return {
    effectiveFrom: new Date(schedule.effectiveFrom).toISOString(),
    effectiveTo: schedule.effectiveTo ? new Date(schedule.effectiveTo).toISOString() : null,
    daysOfWeek: schedule.daysOfWeek ?? [],
    dailyStart: schedule.dailyStart,
    dailyEnd: schedule.dailyEnd,
    timezone: schedule.timezone || 'Asia/Kolkata',
  };
}

function toMyAccess(schedule?: AssignmentSchedule | null): ExternalVmMyAccess {
  const pub = toSchedulePublic(schedule);
  const allowedNow = isAccessAllowedNow(schedule ?? null);
  return {
    allowedNow,
    schedule: pub,
    nextWindow: allowedNow ? null : getNextAllowedAccessHint(schedule ?? null),
  };
}

/**
 * External VM (a.k.a. "Elastic Server") service.
 *
 * Unlike platform-provisioned VPS instances, external VMs are arbitrary servers
 * the owner already runs. We store the console password AES-256-CBC encrypted and
 * decrypt it on demand to mint a browser Guacamole session.
 *
 * Ownership is either platform `adminId` or workspace `tenantId` — never both.
 */
class ExternalVMService {
  private toResponse(
    doc: IExternalVM,
    options?: {
      includePassword?: boolean;
      assignedTenantUserIds?: string[];
      assignments?: ExternalVmAssignmentSummary[];
      myAccess?: ExternalVmMyAccess;
    }
  ): ExternalVMResponse {
    const includePassword = options?.includePassword !== false;
    const assignedTenantUserIds =
      options?.assignedTenantUserIds ??
      (doc.assignedTenantUserId ? [doc.assignedTenantUserId.toString()] : []);
    return {
      _id: doc._id.toString(),
      name: doc.name,
      ipAddress: doc.ipAddress,
      protocol: doc.protocol,
      username: doc.username,
      ...(includePassword ? { password: decrypt(doc.password) } : {}),
      ...(doc.adminId ? { adminId: doc.adminId.toString() } : {}),
      ...(doc.tenantId ? { tenantId: doc.tenantId.toString() } : {}),
      assignedTo: doc.assignedTo?.toString() ?? null,
      assignedTenantUserIds,
      assignedTenantUserId: assignedTenantUserIds[0] ?? null,
      ...(options?.assignments ? { assignments: options.assignments } : {}),
      ...(options?.myAccess ? { myAccess: options.myAccess } : {}),
      accessSchedule: toAccessScheduleView(doc),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private async loadPlatformAssignmentSummaries(
    docs: IExternalVM[]
  ): Promise<Map<string, ExternalVmAssignmentSummary[]>> {
    const map = new Map<string, ExternalVmAssignmentSummary[]>();
    if (docs.length === 0) return map;

    const vmIds = docs.map((d) => d._id);
    const rows = await ExternalVmUserAssignmentModel.find({
      externalVmId: { $in: vmIds },
      $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
    }).lean();

    const userIds = [...new Set(rows.map((r) => r.userId.toString()))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('_id email username').lean()
      : [];
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    for (const row of rows) {
      const vmId = row.externalVmId.toString();
      const u = userById.get(row.userId.toString());
      const list = map.get(vmId) ?? [];
      list.push({
        assignmentId: row._id.toString(),
        userId: row.userId.toString(),
        email: u?.email ?? null,
        username: u?.username ?? null,
        status: row.status ?? 'active',
        schedule: toSchedulePublic(row.schedule ?? null),
      });
      map.set(vmId, list);
    }

    // Legacy assignedTo without junction row
    const legacyNeeds: Array<{ vmId: string; userId: string }> = [];
    for (const doc of docs) {
      const vmId = doc._id.toString();
      if ((map.get(vmId)?.length ?? 0) > 0) continue;
      if (!doc.assignedTo) continue;
      legacyNeeds.push({ vmId, userId: doc.assignedTo.toString() });
    }
    if (legacyNeeds.length > 0) {
      const legacyUsers = await User.find({
        _id: {
          $in: legacyNeeds.map((l) => new mongoose.Types.ObjectId(l.userId)),
        },
      })
        .select('_id email username')
        .lean();
      const legacyById = new Map(legacyUsers.map((u) => [u._id.toString(), u]));
      for (const need of legacyNeeds) {
        const u = legacyById.get(need.userId);
        map.set(need.vmId, [
          {
            assignmentId: `legacy:${need.vmId}`,
            userId: need.userId,
            email: u?.email ?? null,
            username: u?.username ?? null,
            status: 'active',
            schedule: null,
          },
        ]);
      }
    }

    return map;
  }

  private async loadTenantAssignmentSummaries(
    tenantId: mongoose.Types.ObjectId,
    docs: IExternalVM[]
  ): Promise<Map<string, ExternalVmAssignmentSummary[]>> {
    const map = new Map<string, ExternalVmAssignmentSummary[]>();
    if (docs.length === 0) return map;

    const rows = await ExternalVmTenantAssignmentModel.find({
      tenantId,
      externalVmId: { $in: docs.map((d) => d._id) },
      $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
    }).lean();

    const userIds = [...new Set(rows.map((r) => r.tenantUserId.toString()))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    const users = userIds.length
      ? await TenantUser.find({ _id: { $in: userIds } }).select('_id email username').lean()
      : [];
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    for (const row of rows) {
      const vmId = row.externalVmId.toString();
      const u = userById.get(row.tenantUserId.toString());
      const list = map.get(vmId) ?? [];
      list.push({
        assignmentId: row._id.toString(),
        tenantUserId: row.tenantUserId.toString(),
        email: u?.email ?? null,
        username: u?.username ?? null,
        status: row.status ?? 'active',
        schedule: toSchedulePublic(row.schedule ?? null),
      });
      map.set(vmId, list);
    }

    return map;
  }

  private async toTenantResponses(
    docs: IExternalVM[],
    tenantId: mongoose.Types.ObjectId,
    options?: { includePassword?: boolean; forTenantUserId?: string }
  ): Promise<ExternalVMResponse[]> {
    if (docs.length === 0) return [];
    const assignmentMap = await getAssignmentMapForExternalVms(
      tenantId,
      docs.map((d) => d._id)
    );
    const summaries = await this.loadTenantAssignmentSummaries(tenantId, docs);

    let myScheduleByVm = new Map<string, AssignmentSchedule | null>();
    if (options?.forTenantUserId) {
      const mine = await ExternalVmTenantAssignmentModel.find({
        tenantId,
        tenantUserId: new mongoose.Types.ObjectId(options.forTenantUserId),
        externalVmId: { $in: docs.map((d) => d._id) },
        $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
      })
        .select('externalVmId schedule')
        .lean();
      myScheduleByVm = new Map(
        mine.map((r) => [r.externalVmId.toString(), r.schedule ?? null] as const)
      );
    }

    return docs.map((doc) => {
      const vmId = doc._id.toString();
      const assignments = summaries.get(vmId) ?? [];
      const myAccess = options?.forTenantUserId
        ? toMyAccess(myScheduleByVm.get(vmId) ?? null)
        : undefined;
      return this.toResponse(doc, {
        ...options,
        assignedTenantUserIds: assignmentMap.get(vmId) ?? [],
        assignments,
        myAccess,
      });
    });
  }

  /** Deny when outside the assignment's schedule window (no schedule → allow). */
  private assertAssignmentScheduleWindow(schedule?: AssignmentSchedule | null): void {
    if (isAccessAllowedNow(schedule)) return;
    const next = getNextAllowedAccessHint(schedule);
    throw new AccessWindowDeniedError(
      next
        ? `Access denied: outside your access window. Next allowed: ${next}.`
        : 'Access denied: outside your access window.',
      next
    );
  }

  private isAssignmentStatusActive(status?: string | null): boolean {
    // Pre-migration rows may omit status; treat missing as active.
    return status == null || status === 'active';
  }

  private async assertPlatformAccess(
    doc: IExternalVM,
    requestingUserId: string,
    requestingRole: PlatformActorRole
  ): Promise<void> {
    if (requestingRole === 'super_admin') return;
    if (requestingRole === 'user') {
      const userId = new mongoose.Types.ObjectId(requestingUserId);
      const assignment = await ExternalVmUserAssignmentModel.findOne({
        externalVmId: doc._id,
        userId,
      })
        .select('schedule status')
        .lean();

      if (assignment) {
        if (!this.isAssignmentStatusActive(assignment.status)) {
          throw new ForbiddenError('You do not have permission to access this external VM.');
        }
        this.assertAssignmentScheduleWindow(assignment.schedule ?? null);
        return;
      }

      // Legacy path: ExternalVM.assignedTo only (no assignment row yet).
      if (doc.assignedTo && doc.assignedTo.toString() === requestingUserId) {
        return;
      }

      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
    if (!doc.adminId || doc.adminId.toString() !== requestingUserId) {
      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
  }

  private async assertTenantAccess(doc: IExternalVM, actor: TenantExternalVmActor): Promise<void> {
    if (!doc.tenantId || doc.tenantId.toString() !== actor.tenantId) {
      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
    if (actor.role === 'tenant_user') {
      const tenantId = new mongoose.Types.ObjectId(actor.tenantId);
      const tenantUserId = new mongoose.Types.ObjectId(actor.id);
      const activeAssignmentFilter = {
        $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
      };
      const assignment = await ExternalVmTenantAssignmentModel.findOne({
        tenantId,
        externalVmId: doc._id,
        tenantUserId,
        ...activeAssignmentFilter,
      })
        .select('schedule status')
        .lean();

      if (assignment) {
        this.assertAssignmentScheduleWindow(assignment.schedule ?? null);
        return;
      }

      // Legacy path: ExternalVM.assignedTenantUserId (self-heal junction if missing).
      if (doc.assignedTenantUserId && doc.assignedTenantUserId.toString() === actor.id) {
        await ExternalVmTenantAssignmentModel.updateOne(
          { tenantId, externalVmId: doc._id, tenantUserId },
          {
            $set: { status: 'active' },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );
        return;
      }

      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
  }

  async addExternalVM(
    dto: CreateExternalVMDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    let projectId: mongoose.Types.ObjectId | undefined;
    if (dto.projectId) {
      const { projectsService } = await import('../projects/projects.service');
      const projectCtx = await projectsService.assertUsableForService({
        projectId: dto.projectId,
        actingUserId: adminId.toString(),
        serviceKey: 'elastic-servers',
      });
      projectId = projectCtx.projectId;
    }

    const doc = await ExternalVMModel.create({
      name: dto.name,
      ipAddress: dto.ipAddress,
      protocol: dto.protocol,
      username: dto.username,
      password: encrypt(dto.password),
      source: 'admin_import',
      adminId,
      ...(projectId ? { projectId } : {}),
    });

    logger.info('[ExternalVM] Added external VM', {
      externalVmId: doc._id.toString(),
      adminId: adminId.toString(),
      projectId: projectId?.toString() ?? null,
      protocol: doc.protocol,
    });

    return this.toResponse(doc);
  }

  async bulkAddExternalVMs(
    dtos: CreateExternalVMDto[],
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse[]> {
    const created: ExternalVMResponse[] = [];
    for (const dto of dtos) {
      created.push(await this.addExternalVM(dto, adminId));
    }
    return created;
  }

  async listExternalVMs(adminId: mongoose.Types.ObjectId): Promise<ExternalVMResponse[]> {
    const docs = await ExternalVMModel.find({ adminId, source: { $in: ['admin_import', 'tenant_import'] } }).sort({ createdAt: -1 });
    const summaries = await this.loadPlatformAssignmentSummaries(docs);
    return docs.map((doc) =>
      this.toResponse(doc, {
        assignments: summaries.get(doc._id.toString()) ?? [],
      })
    );
  }

  async getExternalVM(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    const summaries = await this.loadPlatformAssignmentSummaries([doc]);
    return this.toResponse(doc, {
      assignments: summaries.get(doc._id.toString()) ?? [],
    });
  }

  async getExternalVMForActor(
    id: mongoose.Types.ObjectId,
    requestingUserId: mongoose.Types.ObjectId,
    requestingRole: PlatformActorRole
  ): Promise<ExternalVMResponse> {
    const doc = await ExternalVMModel.findById(id);
    if (!doc) throw new NotFoundError('External VM not found.');
    await this.assertPlatformAccess(doc, requestingUserId.toString(), requestingRole);
    const includePassword = requestingRole !== 'user';

    let myAccess: ExternalVmMyAccess | undefined;
    if (requestingRole === 'user') {
      const assignment = await ExternalVmUserAssignmentModel.findOne({
        externalVmId: doc._id,
        userId: requestingUserId,
        $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
      })
        .select('schedule')
        .lean();
      myAccess = toMyAccess(assignment?.schedule ?? null);
    }

    return this.toResponse(doc, { includePassword, myAccess });
  }

  async deleteExternalVM(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    await doc.deleteOne();

    logger.info('[ExternalVM] Deleted external VM', {
      externalVmId: id.toString(),
      adminId: adminId.toString(),
    });
  }

  async getConsoleSession(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    dimensions?: { width?: number; height?: number }
  ): Promise<ExternalVMConsoleSession> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    return this.openGuacamole(doc, { adminId: adminId.toString() }, dimensions);
  }

  async getConsoleSessionForActor(
    id: mongoose.Types.ObjectId,
    requestingUserId: mongoose.Types.ObjectId,
    requestingRole: PlatformActorRole,
    dimensions?: { width?: number; height?: number }
  ): Promise<ExternalVMConsoleSession> {
    const doc = await ExternalVMModel.findById(id);
    if (!doc) throw new NotFoundError('External VM not found.');
    await this.assertPlatformAccess(doc, requestingUserId.toString(), requestingRole);
    return this.openGuacamole(
      doc,
      {
        userId: requestingUserId.toString(),
        role: requestingRole,
      },
      dimensions
    );
  }

  async getMyAssignedExternalVMs(
    userId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse[]> {
    const junction = await ExternalVmUserAssignmentModel.find({
      userId,
      $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
    })
      .select('externalVmId schedule')
      .lean();

    const byVmSchedule = new Map(
      junction.map((j) => [j.externalVmId.toString(), j.schedule ?? null] as const)
    );

    const fromJunction = junction.map((j) => j.externalVmId);
    const docs = await ExternalVMModel.find({
      $or: [{ assignedTo: userId }, { _id: { $in: fromJunction } }],
    }).sort({ createdAt: -1 });

    return docs.map((doc) => {
      const schedule =
        byVmSchedule.get(doc._id.toString()) ??
        // Legacy assignedTo with no junction schedule → always-on
        null;
      return this.toResponse(doc, {
        includePassword: false,
        myAccess: toMyAccess(schedule),
      });
    });
  }

  async getAssignedCounts(adminId: mongoose.Types.ObjectId): Promise<Record<string, number>> {
    const results = await ExternalVMModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { adminId, assignedTo: { $ne: null } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]);

    const map: Record<string, number> = {};
    for (const r of results) {
      map[r._id.toString()] = r.count;
    }
    return map;
  }

  async getAvailableExternalVMs(adminId: mongoose.Types.ObjectId): Promise<ExternalVMResponse[]> {
    const docs = await ExternalVMModel.find({ adminId, assignedTo: null }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc));
  }

  async getAssignedExternalVMsForUser(
    targetUserId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse[]> {
    const user = await User.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');
    if (!user.createdBy || user.createdBy.toString() !== adminId.toString()) {
      throw new ForbiddenError('You can only manage users you created.');
    }

    const docs = await ExternalVMModel.find({ adminId, assignedTo: targetUserId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc));
  }

  async assignExternalVMs(
    externalVmIds: mongoose.Types.ObjectId[],
    targetUserId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<{ assigned: number }> {
    if (externalVmIds.length === 0) throw new ValidationError('No servers specified.');
    if (externalVmIds.length > 250) throw new ValidationError('Cannot assign more than 250 servers at once.');

    const user = await User.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');
    if (!user.createdBy || user.createdBy.toString() !== adminId.toString()) {
      throw new ForbiddenError('You can only assign servers to users you created.');
    }

    const docs = await ExternalVMModel.find({ _id: { $in: externalVmIds }, adminId });
    if (docs.length !== externalVmIds.length) {
      throw new ForbiddenError('One or more servers not found or do not belong to you.');
    }

    const alreadyAssigned = docs.filter((doc) => doc.assignedTo != null);
    if (alreadyAssigned.length > 0) {
      const names = alreadyAssigned.map((d) => d.name).join(', ');
      throw new ValidationError(`The following servers are already assigned: ${names}`);
    }

    await ExternalVMModel.updateMany(
      { _id: { $in: externalVmIds }, adminId, assignedTo: null },
      { $set: { assignedTo: targetUserId } }
    );

    logger.info('[ExternalVM] Servers assigned to user', {
      adminId: adminId.toString(),
      targetUserId: targetUserId.toString(),
      externalVmIds: externalVmIds.map((id) => id.toString()),
    });

    return { assigned: externalVmIds.length };
  }

  async bulkAssignOneToOne(
    dto: BulkAssignExternalPairsDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<BulkAssignExternalPairsResult> {
    const externalVmObjectIds = dto.externalVmIds.map((id) => new mongoose.Types.ObjectId(id));
    const pairs: BulkAssignExternalPairsResult['pairs'] = [];

    const docs = await ExternalVMModel.find({
      _id: { $in: externalVmObjectIds },
      adminId,
      assignedTo: null,
    }).lean();

    const docById = new Map(docs.map((doc) => [doc._id.toString(), doc]));
    const orderedDocs = dto.externalVmIds.map((id) => docById.get(id));

    if (orderedDocs.some((doc) => !doc)) {
      throw new ValidationError('One or more servers are not available for assignment.');
    }

    type UserSlot = { userId?: mongoose.Types.ObjectId; email: string; password?: string };
    const userSlots: UserSlot[] = [];

    if (dto.mode === 'create') {
      const bulkResult = await managedUsersService.createBulk(
        {
          emailPrefix: dto.emailPrefix!,
          count: dto.externalVmIds.length,
          password: dto.passwordMode === 'shared' ? dto.sharedPassword : undefined,
        },
        adminId
      );

      for (const row of bulkResult.users) {
        if (row.status !== 'created') {
          userSlots.push({ email: row.email, password: row.password });
          continue;
        }
        const user = await User.findOne({ email: row.email, createdBy: adminId }).select('_id email');
        userSlots.push({
          userId: user?._id,
          email: row.email,
          password: row.password,
        });
      }
    } else {
      const userObjectIds = dto.userIds!.map((id) => new mongoose.Types.ObjectId(id));
      const users = await User.find({ _id: { $in: userObjectIds }, createdBy: adminId, role: 'user' }).lean();
      const userById = new Map(users.map((u) => [u._id.toString(), u]));

      for (const userId of dto.userIds!) {
        const user = userById.get(userId);
        if (!user) {
          throw new ValidationError('One or more users not found or do not belong to you.');
        }
        userSlots.push({ userId: user._id, email: user.email });
      }
    }

    let assigned = 0;
    let failed = 0;

    for (let i = 0; i < dto.externalVmIds.length; i++) {
      const doc = orderedDocs[i]!;
      const slot = userSlots[i]!;

      if (!slot.userId) {
        pairs.push({
          externalVmId: doc._id.toString(),
          externalVmName: doc.name,
          userEmail: slot.email,
          password: slot.password,
          status: 'failed',
          error: 'User creation failed',
        });
        failed++;
        continue;
      }

      const update = await ExternalVMModel.updateOne(
        { _id: doc._id, adminId, assignedTo: null },
        { $set: { assignedTo: slot.userId } }
      );

      if (update.modifiedCount === 0) {
        pairs.push({
          externalVmId: doc._id.toString(),
          externalVmName: doc.name,
          userId: slot.userId.toString(),
          userEmail: slot.email,
          password: slot.password,
          status: 'failed',
          error: 'Server is no longer available for assignment',
        });
        failed++;
        continue;
      }

      pairs.push({
        externalVmId: doc._id.toString(),
        externalVmName: doc.name,
        userId: slot.userId.toString(),
        userEmail: slot.email,
        password: slot.password,
        status: 'assigned',
      });
      assigned++;
    }

    logger.info('[ExternalVM] Bulk 1:1 server assignment complete', {
      adminId: adminId.toString(),
      mode: dto.mode,
      assigned,
      failed,
      total: dto.externalVmIds.length,
    });

    return { assigned, failed, pairs };
  }

  async unassignExternalVM(
    externalVmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwnedByAdmin(externalVmId, adminId);
    if (!doc.assignedTo) throw new ValidationError('Server is not currently assigned.');

    doc.assignedTo = undefined;
    await doc.save();

    logger.info('[ExternalVM] Server unassigned', {
      adminId: adminId.toString(),
      externalVmId: externalVmId.toString(),
    });
  }

  // ─── Tenant-scoped operations ───────────────────────────────────────────────

  async addTenantExternalVM(
    dto: CreateExternalVMDto,
    tenantId: mongoose.Types.ObjectId,
    createdByTenantUserId?: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    let projectId: mongoose.Types.ObjectId | undefined;
    if (dto.projectId) {
      const { projectsService } = await import('../projects/projects.service');
      const projectCtx = await projectsService.assertUsableForTenantService({
        projectId: dto.projectId,
        tenantId: tenantId.toString(),
        serviceKey: 'elastic-servers',
      });
      projectId = projectCtx.projectId;
    }

    const doc = await ExternalVMModel.create({
      name: dto.name,
      ipAddress: dto.ipAddress,
      protocol: dto.protocol,
      username: dto.username,
      password: encrypt(dto.password),
      source: 'tenant_import',
      tenantId,
      ...(projectId ? { projectId } : {}),
      ...(createdByTenantUserId ? { createdByTenantUserId } : {}),
    });

    logger.info('[ExternalVM] Added tenant external VM', {
      externalVmId: doc._id.toString(),
      tenantId: tenantId.toString(),
      projectId: projectId?.toString() ?? null,
      protocol: doc.protocol,
    });

    return this.toResponse(doc);
  }

  async bulkAddTenantExternalVMs(
    dtos: CreateExternalVMDto[],
    tenantId: mongoose.Types.ObjectId,
    createdByTenantUserId?: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse[]> {
    const created: ExternalVMResponse[] = [];
    for (const dto of dtos) {
      created.push(await this.addTenantExternalVM(dto, tenantId, createdByTenantUserId));
    }
    return created;
  }

  async listTenantExternalVMs(
    actor: TenantExternalVmActor
  ): Promise<ExternalVMResponse[]> {
    const tenantId = new mongoose.Types.ObjectId(actor.tenantId);
    await migrateLegacyExternalVmAssignments(tenantId);

    const query: Record<string, unknown> = {
      tenantId,
      source: { $in: ['admin_import', 'tenant_import', 'superadmin_bulk'] },
    };
    if (actor.role === 'tenant_user') {
      const assignedIds = await getExternalVmIdsForTenantUser(
        tenantId,
        new mongoose.Types.ObjectId(actor.id)
      );
      if (assignedIds.length === 0) return [];
      query['_id'] = { $in: assignedIds };
    }

    const docs = await ExternalVMModel.find(query).sort({ createdAt: -1 });
    const includePassword = actor.role === 'tenant_admin';
    return this.toTenantResponses(docs, tenantId, {
      includePassword,
      ...(actor.role === 'tenant_user' ? { forTenantUserId: actor.id } : {}),
    });
  }

  async getTenantExternalVM(
    id: mongoose.Types.ObjectId,
    actor: TenantExternalVmActor
  ): Promise<ExternalVMResponse> {
    const tenantId = new mongoose.Types.ObjectId(actor.tenantId);
    await migrateLegacyExternalVmAssignments(tenantId);
    const doc = await this.findOwnedByTenant(id, tenantId);
    await this.assertTenantAccess(doc, actor);
    const includePassword = actor.role === 'tenant_admin';
    const [response] = await this.toTenantResponses([doc], tenantId, {
      includePassword,
      ...(actor.role === 'tenant_user' ? { forTenantUserId: actor.id } : {}),
    });
    return response!;
  }

  async deleteTenantExternalVM(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwnedByTenant(id, tenantId);
    await doc.deleteOne();
    await removeAllExternalVmAssignmentsForVms(tenantId, [id]);

    logger.info('[ExternalVM] Deleted tenant external VM', {
      externalVmId: id.toString(),
      tenantId: tenantId.toString(),
    });
  }

  /**
   * Hard-delete tenant-owned elastic servers from MongoDB (tenant_admin).
   * Only deletes documents matching both the given ids and tenantId.
   */
  async bulkDeleteTenantExternalVMs(
    ids: mongoose.Types.ObjectId[],
    tenantId: mongoose.Types.ObjectId
  ): Promise<{ deleted: number }> {
    const result = await ExternalVMModel.deleteMany({
      _id: { $in: ids },
      tenantId,
    });

    await removeAllExternalVmAssignmentsForVms(tenantId, ids);

    logger.info('[ExternalVM] Bulk deleted tenant external VMs', {
      requested: ids.length,
      deleted: result.deletedCount,
      tenantId: tenantId.toString(),
    });

    return { deleted: result.deletedCount ?? 0 };
  }

  async getTenantConsoleSession(
    id: mongoose.Types.ObjectId,
    actor: TenantExternalVmActor,
    dimensions?: { width?: number; height?: number }
  ): Promise<ExternalVMConsoleSession> {
    const tenantId = new mongoose.Types.ObjectId(actor.tenantId);
    await migrateLegacyExternalVmAssignments(tenantId);
    const doc = await this.findOwnedByTenant(id, tenantId);
    await this.assertTenantAccess(doc, actor);
    return this.openGuacamole(
      doc,
      { tenantId: actor.tenantId, tenantUserId: actor.id },
      dimensions
    );
  }

  async getTenantAssignedCounts(tenantId: mongoose.Types.ObjectId): Promise<Record<string, number>> {
    await migrateLegacyExternalVmAssignments(tenantId);
    return getAssignmentCountsByTenantUser(tenantId);
  }

  async getAvailableTenantExternalVMs(
    tenantId: mongoose.Types.ObjectId,
    options?: { excludeTenantUserId?: mongoose.Types.ObjectId }
  ): Promise<ExternalVMResponse[]> {
    await migrateLegacyExternalVmAssignments(tenantId);

    let docs = await ExternalVMModel.find({ tenantId }).sort({ createdAt: -1 });

    if (options?.excludeTenantUserId) {
      const assignedToUser = new Set(
        (await getExternalVmIdsForTenantUser(tenantId, options.excludeTenantUserId)).map((id) =>
          id.toString()
        )
      );
      docs = docs.filter((doc) => !assignedToUser.has(doc._id.toString()));
    }

    return this.toTenantResponses(docs, tenantId);
  }

  async getAssignedTenantExternalVMsForUser(
    targetUserId: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse[]> {
    await migrateLegacyExternalVmAssignments(tenantId);

    const user = await TenantUser.findOne({ _id: targetUserId, tenantId, role: 'tenant_user' });
    if (!user) throw new NotFoundError('Tenant user not found.');
    if (!user.createdBy || user.createdBy.toString() !== createdBy.toString()) {
      throw new ForbiddenError('You can only view assignments for tenant users you created.');
    }

    const assignedIds = await getExternalVmIdsForTenantUser(tenantId, targetUserId);
    if (assignedIds.length === 0) return [];

    const docs = await ExternalVMModel.find({ tenantId, _id: { $in: assignedIds } }).sort({
      createdAt: -1,
    });
    return this.toTenantResponses(docs, tenantId);
  }

  async assignTenantExternalVMs(
    externalVmIds: mongoose.Types.ObjectId[],
    targetUserId: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId,
    accessSchedule?: AccessScheduleInput
  ): Promise<{ assigned: number; skipped: number }> {
    if (externalVmIds.length === 0) throw new ValidationError('No servers specified.');
    if (externalVmIds.length > 250) throw new ValidationError('Cannot assign more than 250 servers at once.');

    await migrateLegacyExternalVmAssignments(tenantId);

    const user = await TenantUser.findOne({ _id: targetUserId, tenantId, role: 'tenant_user' });
    if (!user) throw new NotFoundError('Tenant user not found.');
    if (!user.createdBy || user.createdBy.toString() !== createdBy.toString()) {
      throw new ForbiddenError('You can only assign servers to tenant users you created.');
    }

    const docs = await ExternalVMModel.find({ _id: { $in: externalVmIds }, tenantId });
    if (docs.length !== externalVmIds.length) {
      throw new ForbiddenError('One or more servers not found or do not belong to this tenant.');
    }

    const toAssign: mongoose.Types.ObjectId[] = [];
    let skipped = 0;
    for (const doc of docs) {
      const already = await isExternalVmAssignedToTenantUser({
        tenantId,
        externalVmId: doc._id,
        tenantUserId: targetUserId,
      });
      if (already) {
        skipped++;
      } else {
        toAssign.push(doc._id);
      }
    }

    if (toAssign.length === 0) {
      throw new ValidationError('All selected servers are already assigned to this user.');
    }

    const schedulePatch = parseAccessScheduleInput(accessSchedule);
    if (Object.keys(schedulePatch).length > 0) {
      await ExternalVMModel.updateMany({ _id: { $in: toAssign }, tenantId }, { $set: schedulePatch });
    }

    const assigned = await createExternalVmTenantAssignments({
      tenantId,
      externalVmIds: toAssign,
      tenantUserId: targetUserId,
      assignedByTenantUserId: createdBy,
    });

    for (const externalVmId of toAssign) {
      await syncLegacyAssignedTenantUserId(tenantId, externalVmId);
    }

    return { assigned, skipped };
  }

  async bulkAssignTenantOneToOne(
    dto: TenantBulkAssignExternalPairsDto,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<BulkAssignExternalPairsResult> {
    await migrateLegacyExternalVmAssignments(tenantId);

    const schedulePatch = parseAccessScheduleInput(dto.accessSchedule);
    const externalVmObjectIds = dto.externalVmIds.map((id) => new mongoose.Types.ObjectId(id));
    const pairs: BulkAssignExternalPairsResult['pairs'] = [];

    const docs = await ExternalVMModel.find({
      _id: { $in: externalVmObjectIds },
      tenantId,
    }).lean();

    const docById = new Map(docs.map((doc) => [doc._id.toString(), doc]));
    const orderedDocs = dto.externalVmIds.map((id) => docById.get(id));

    if (orderedDocs.some((doc) => !doc)) {
      throw new ValidationError('One or more servers were not found for this tenant.');
    }

    type UserSlot = { userId?: mongoose.Types.ObjectId; email: string; password?: string };
    const userSlots: UserSlot[] = [];

    if (dto.mode === 'create') {
      const bulkResult = await tenantUserService.createBulk(
        {
          emailPrefix: dto.emailPrefix!,
          count: dto.externalVmIds.length,
          password: dto.passwordMode === 'shared' ? dto.sharedPassword : undefined,
        },
        tenantId,
        createdBy
      );

      for (const row of bulkResult.users) {
        if (row.status !== 'created') {
          userSlots.push({ email: row.email, password: row.password });
          continue;
        }
        const user = await TenantUser.findOne({
          tenantId,
          email: row.email,
          role: 'tenant_user',
        }).select('_id email');
        userSlots.push({
          userId: user?._id,
          email: row.email,
          password: row.password,
        });
      }
    } else {
      const userObjectIds = dto.userIds!.map((id) => new mongoose.Types.ObjectId(id));
      const users = await TenantUser.find({
        _id: { $in: userObjectIds },
        tenantId,
        role: 'tenant_user',
        createdBy,
      }).lean();
      const userById = new Map(users.map((u) => [u._id.toString(), u]));

      for (const userId of dto.userIds!) {
        const user = userById.get(userId);
        if (!user) {
          throw new ValidationError('One or more users not found or do not belong to you.');
        }
        userSlots.push({ userId: user._id, email: user.email });
      }
    }

    let assigned = 0;
    let failed = 0;

    for (let i = 0; i < dto.externalVmIds.length; i++) {
      const doc = orderedDocs[i]!;
      const slot = userSlots[i]!;

      if (!slot.userId) {
        pairs.push({
          externalVmId: doc._id.toString(),
          externalVmName: doc.name,
          userEmail: slot.email,
          password: slot.password,
          status: 'failed',
          error: 'Tenant user creation failed',
        });
        failed++;
        continue;
      }

      const already = await isExternalVmAssignedToTenantUser({
        tenantId,
        externalVmId: doc._id,
        tenantUserId: slot.userId,
      });
      if (already) {
        pairs.push({
          externalVmId: doc._id.toString(),
          externalVmName: doc.name,
          userId: slot.userId.toString(),
          userEmail: slot.email,
          password: slot.password,
          status: 'failed',
          error: 'Server is already assigned to this user',
        });
        failed++;
        continue;
      }

      if (Object.keys(schedulePatch).length > 0) {
        await ExternalVMModel.updateOne({ _id: doc._id, tenantId }, { $set: schedulePatch });
      }

      const created = await createExternalVmTenantAssignments({
        tenantId,
        externalVmIds: [doc._id],
        tenantUserId: slot.userId,
        assignedByTenantUserId: createdBy,
      });

      if (created === 0) {
        pairs.push({
          externalVmId: doc._id.toString(),
          externalVmName: doc.name,
          userId: slot.userId.toString(),
          userEmail: slot.email,
          password: slot.password,
          status: 'failed',
          error: 'Assignment failed',
        });
        failed++;
        continue;
      }

      await syncLegacyAssignedTenantUserId(tenantId, doc._id);

      pairs.push({
        externalVmId: doc._id.toString(),
        externalVmName: doc.name,
        userId: slot.userId.toString(),
        userEmail: slot.email,
        password: slot.password,
        status: 'assigned',
      });
      assigned++;
    }

    return { assigned, failed, pairs };
  }

  async unassignTenantExternalVM(
    externalVmId: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId,
    tenantUserId: mongoose.Types.ObjectId
  ): Promise<void> {
    await this.findOwnedByTenant(externalVmId, tenantId);
    const removed = await removeExternalVmTenantAssignment({
      tenantId,
      externalVmId,
      tenantUserId,
    });
    if (!removed) {
      throw new ValidationError('Server is not assigned to this user.');
    }
    await syncLegacyAssignedTenantUserId(tenantId, externalVmId);
  }

  /**
   * PATCH access schedule for a tenant-owned elastic server (tenant_admin).
   * Does not touch override fields.
   */
  async updateTenantExternalVmSchedule(
    id: mongoose.Types.ObjectId,
    actor: TenantExternalVmActor,
    body: AccessScheduleInput
  ): Promise<NonNullable<ExternalVMResponse['accessSchedule']>> {
    if (actor.role !== 'tenant_admin') {
      throw new ForbiddenError('Only tenant admins can update access schedules.');
    }
    const doc = await this.findOwnedByTenant(id, new mongoose.Types.ObjectId(actor.tenantId));
    const patch = parseAccessScheduleInput(body);
    Object.assign(doc, patch);
    await doc.save();

    logger.info('[ExternalVM] Access schedule updated', {
      externalVmId: doc._id.toString(),
      tenantId: actor.tenantId,
      actorId: actor.id,
    });

    return toAccessScheduleView(doc);
  }

  /**
   * Grant or revoke access override for a tenant-owned elastic server (tenant_admin).
   * Lets the assigned user connect outside weekly / legacy schedule windows.
   */
  async updateTenantExternalVmOverride(
    id: mongoose.Types.ObjectId,
    actor: TenantExternalVmActor,
    body: { accessOverride: boolean; accessOverrideUntil?: string | null }
  ): Promise<NonNullable<ExternalVMResponse['accessSchedule']>> {
    if (actor.role !== 'tenant_admin') {
      throw new ForbiddenError('Only tenant admins can grant access overrides.');
    }

    const doc = await this.findOwnedByTenant(id, new mongoose.Types.ObjectId(actor.tenantId));

    if (body.accessOverride) {
      doc.accessOverride = true;
      doc.accessOverrideUntil = body.accessOverrideUntil
        ? new Date(body.accessOverrideUntil)
        : null;
      cancelSchedule(doc._id.toString());
      const assignedUserIds = await getTenantUserIdsForExternalVm(
        new mongoose.Types.ObjectId(actor.tenantId),
        doc._id
      );
      for (const userId of assignedUserIds) {
        unblockUserSession(userId);
      }
    } else {
      doc.accessOverride = false;
      doc.accessOverrideUntil = null;
    }

    await doc.save();

    logger.info('[ExternalVM] Access override updated', {
      externalVmId: doc._id.toString(),
      tenantId: actor.tenantId,
      actorId: actor.id,
      accessOverride: doc.accessOverride,
      accessOverrideUntil: doc.accessOverrideUntil,
    });

    return toAccessScheduleView(doc);
  }

  async bulkUpdateTenantExternalVmOverride(
    ids: mongoose.Types.ObjectId[],
    actor: TenantExternalVmActor,
    body: { accessOverride: boolean; accessOverrideUntil?: string | null }
  ): Promise<{
    updated: number;
    results: Array<{ externalVmId: string; ok: boolean; error?: string }>;
  }> {
    const results: Array<{ externalVmId: string; ok: boolean; error?: string }> = [];
    let updated = 0;

    for (const id of ids) {
      try {
        await this.updateTenantExternalVmOverride(id, actor, body);
        results.push({ externalVmId: id.toString(), ok: true });
        updated += 1;
      } catch (err) {
        results.push({
          externalVmId: id.toString(),
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { updated, results };
  }

  private async openGuacamole(
    doc: IExternalVM,
    logContext: Record<string, string>,
    dimensions?: { width?: number; height?: number }
  ): Promise<ExternalVMConsoleSession> {
    const password = decrypt(doc.password);
    const port = doc.protocol === 'rdp' ? 3389 : 22;

    logger.info('[ExternalVM] Opening Guacamole session', {
      externalVmId: doc._id.toString(),
      protocol: doc.protocol,
      hostname: doc.ipAddress,
      ...logContext,
    });

    const session = await guacamoleClient.openConsole(
      `externalvm-${doc._id.toString()}`,
      doc.protocol,
      {
        hostname: doc.ipAddress,
        port,
        username: doc.username,
        password,
        ignoreCert: true,
        securityMode: 'any',
        width: dimensions?.width,
        height: dimensions?.height,
      }
    );

    return {
      protocol: doc.protocol,
      clientUrl: session.clientUrl,
      connectionId: session.connectionId,
    };
  }

  private async findOwnedByAdmin(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<IExternalVM> {
    const doc = await ExternalVMModel.findById(id);
    if (!doc) throw new NotFoundError('External VM not found.');
    if (!doc.adminId || doc.adminId.toString() !== adminId.toString()) {
      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
    return doc;
  }

  private async findOwnedByTenant(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<IExternalVM> {
    const doc = await ExternalVMModel.findById(id);
    if (!doc) throw new NotFoundError('External VM not found.');
    if (!doc.tenantId || doc.tenantId.toString() !== tenantId.toString()) {
      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
    return doc;
  }
}

export const externalVMService = new ExternalVMService();
