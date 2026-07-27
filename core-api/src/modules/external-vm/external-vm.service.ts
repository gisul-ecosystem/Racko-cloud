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
import { checkAccessWindow } from '../vmAccessSchedule/scheduleManager';

type PlatformActorRole = 'admin' | 'super_admin' | 'user';

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
  private toResponse(doc: IExternalVM, options?: { includePassword?: boolean }): ExternalVMResponse {
    const includePassword = options?.includePassword !== false;
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
      assignedTenantUserId: doc.assignedTenantUserId?.toString() ?? null,
      accessSchedule: toAccessScheduleView(doc),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private assertPlatformAccess(
    doc: IExternalVM,
    requestingUserId: string,
    requestingRole: PlatformActorRole
  ): void {
    if (requestingRole === 'super_admin') return;
    if (requestingRole === 'user') {
      if (!doc.assignedTo || doc.assignedTo.toString() !== requestingUserId) {
        throw new ForbiddenError('You do not have permission to access this external VM.');
      }
      return;
    }
    if (!doc.adminId || doc.adminId.toString() !== requestingUserId) {
      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
  }

  private assertTenantAccess(doc: IExternalVM, actor: TenantExternalVmActor): void {
    if (!doc.tenantId || doc.tenantId.toString() !== actor.tenantId) {
      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
    if (actor.role === 'tenant_user') {
      if (!doc.assignedTenantUserId || doc.assignedTenantUserId.toString() !== actor.id) {
        throw new ForbiddenError('You do not have permission to access this external VM.');
      }
    }
  }

  async addExternalVM(
    dto: CreateExternalVMDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    const doc = await ExternalVMModel.create({
      name: dto.name,
      ipAddress: dto.ipAddress,
      protocol: dto.protocol,
      username: dto.username,
      password: encrypt(dto.password),
      adminId,
    });

    logger.info('[ExternalVM] Added external VM', {
      externalVmId: doc._id.toString(),
      adminId: adminId.toString(),
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
    const docs = await ExternalVMModel.find({ adminId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc));
  }

  async getExternalVM(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    return this.toResponse(doc);
  }

  async getExternalVMForActor(
    id: mongoose.Types.ObjectId,
    requestingUserId: mongoose.Types.ObjectId,
    requestingRole: PlatformActorRole
  ): Promise<ExternalVMResponse> {
    const doc = await ExternalVMModel.findById(id);
    if (!doc) throw new NotFoundError('External VM not found.');
    this.assertPlatformAccess(doc, requestingUserId.toString(), requestingRole);
    const includePassword = requestingRole !== 'user';
    return this.toResponse(doc, { includePassword });
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
    this.assertPlatformAccess(doc, requestingUserId.toString(), requestingRole);
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
    const docs = await ExternalVMModel.find({ assignedTo: userId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc, { includePassword: false }));
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
    const doc = await ExternalVMModel.create({
      name: dto.name,
      ipAddress: dto.ipAddress,
      protocol: dto.protocol,
      username: dto.username,
      password: encrypt(dto.password),
      tenantId,
      ...(createdByTenantUserId ? { createdByTenantUserId } : {}),
    });

    logger.info('[ExternalVM] Added tenant external VM', {
      externalVmId: doc._id.toString(),
      tenantId: tenantId.toString(),
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
    const query: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(actor.tenantId),
    };
    if (actor.role === 'tenant_user') {
      query['assignedTenantUserId'] = new mongoose.Types.ObjectId(actor.id);
    }

    const docs = await ExternalVMModel.find(query).sort({ createdAt: -1 });
    const includePassword = actor.role === 'tenant_admin';
    return docs.map((doc) => this.toResponse(doc, { includePassword }));
  }

  async getTenantExternalVM(
    id: mongoose.Types.ObjectId,
    actor: TenantExternalVmActor
  ): Promise<ExternalVMResponse> {
    const doc = await this.findOwnedByTenant(id, new mongoose.Types.ObjectId(actor.tenantId));
    this.assertTenantAccess(doc, actor);
    const includePassword = actor.role === 'tenant_admin';
    return this.toResponse(doc, { includePassword });
  }

  async deleteTenantExternalVM(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwnedByTenant(id, tenantId);
    await doc.deleteOne();

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
    const doc = await this.findOwnedByTenant(id, new mongoose.Types.ObjectId(actor.tenantId));
    this.assertTenantAccess(doc, actor);
    if (actor.role === 'tenant_user') {
      const access = checkAccessWindow(doc);
      if (!access.allowed) {
        throw new AccessWindowDeniedError(
          access.error || 'Access denied: outside scheduled window.',
          access.nextWindow ?? null
        );
      }
    }
    return this.openGuacamole(
      doc,
      { tenantId: actor.tenantId, tenantUserId: actor.id },
      dimensions
    );
  }

  async getTenantAssignedCounts(tenantId: mongoose.Types.ObjectId): Promise<Record<string, number>> {
    const results = await ExternalVMModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { tenantId, assignedTenantUserId: { $ne: null } } },
      { $group: { _id: '$assignedTenantUserId', count: { $sum: 1 } } },
    ]);

    const map: Record<string, number> = {};
    for (const r of results) {
      map[r._id.toString()] = r.count;
    }
    return map;
  }

  async getAvailableTenantExternalVMs(tenantId: mongoose.Types.ObjectId): Promise<ExternalVMResponse[]> {
    const docs = await ExternalVMModel.find({ tenantId, assignedTenantUserId: null }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc));
  }

  async getAssignedTenantExternalVMsForUser(
    targetUserId: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse[]> {
    const user = await TenantUser.findOne({ _id: targetUserId, tenantId, role: 'tenant_user' });
    if (!user) throw new NotFoundError('Tenant user not found.');
    if (!user.createdBy || user.createdBy.toString() !== createdBy.toString()) {
      throw new ForbiddenError('You can only view assignments for tenant users you created.');
    }

    const docs = await ExternalVMModel.find({ tenantId, assignedTenantUserId: targetUserId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc));
  }

  async assignTenantExternalVMs(
    externalVmIds: mongoose.Types.ObjectId[],
    targetUserId: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId,
    accessSchedule?: AccessScheduleInput
  ): Promise<{ assigned: number }> {
    if (externalVmIds.length === 0) throw new ValidationError('No servers specified.');
    if (externalVmIds.length > 250) throw new ValidationError('Cannot assign more than 250 servers at once.');

    const user = await TenantUser.findOne({ _id: targetUserId, tenantId, role: 'tenant_user' });
    if (!user) throw new NotFoundError('Tenant user not found.');
    if (!user.createdBy || user.createdBy.toString() !== createdBy.toString()) {
      throw new ForbiddenError('You can only assign servers to tenant users you created.');
    }

    const docs = await ExternalVMModel.find({ _id: { $in: externalVmIds }, tenantId });
    if (docs.length !== externalVmIds.length) {
      throw new ForbiddenError('One or more servers not found or do not belong to this tenant.');
    }

    const alreadyAssigned = docs.filter((doc) => doc.assignedTenantUserId != null);
    if (alreadyAssigned.length > 0) {
      const names = alreadyAssigned.map((d) => d.name).join(', ');
      throw new ValidationError(`The following servers are already assigned: ${names}`);
    }

    const schedulePatch = parseAccessScheduleInput(accessSchedule);

    await ExternalVMModel.updateMany(
      { _id: { $in: externalVmIds }, tenantId, assignedTenantUserId: null },
      { $set: { assignedTenantUserId: targetUserId, ...schedulePatch } }
    );

    return { assigned: externalVmIds.length };
  }

  async bulkAssignTenantOneToOne(
    dto: TenantBulkAssignExternalPairsDto,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<BulkAssignExternalPairsResult> {
    const schedulePatch = parseAccessScheduleInput(dto.accessSchedule);
    const externalVmObjectIds = dto.externalVmIds.map((id) => new mongoose.Types.ObjectId(id));
    const pairs: BulkAssignExternalPairsResult['pairs'] = [];

    const docs = await ExternalVMModel.find({
      _id: { $in: externalVmObjectIds },
      tenantId,
      assignedTenantUserId: null,
    }).lean();

    const docById = new Map(docs.map((doc) => [doc._id.toString(), doc]));
    const orderedDocs = dto.externalVmIds.map((id) => docById.get(id));

    if (orderedDocs.some((doc) => !doc)) {
      throw new ValidationError('One or more servers are not available for assignment.');
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

      const update = await ExternalVMModel.updateOne(
        { _id: doc._id, tenantId, assignedTenantUserId: null },
        { $set: { assignedTenantUserId: slot.userId, ...schedulePatch } }
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

    return { assigned, failed, pairs };
  }

  async unassignTenantExternalVM(
    externalVmId: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwnedByTenant(externalVmId, tenantId);
    if (!doc.assignedTenantUserId) throw new ValidationError('Server is not currently assigned.');

    doc.assignedTenantUserId = undefined;
    await doc.save();
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
