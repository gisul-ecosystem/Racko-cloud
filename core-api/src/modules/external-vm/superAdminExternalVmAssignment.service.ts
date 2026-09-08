import mongoose from 'mongoose';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { encrypt } from '../../utils/crypto';
import { VmProviderMetadataModel } from '../../models/vmProviderMetadata.model';
import { normalizeCanonicalIpv4 } from '../vm/helpers/ipCidr';
import { ExternalVMModel } from './external-vm.model';
import { syncLegacyAssignedTenantUserId } from './externalVmTenantAssignment.service';
import {
  superAdminExternalVmOverviewService,
  type SuperAdminExternalVmOverviewRow,
} from './superAdminExternalVmOverview.service';
import {
  hasActiveAssignmentAccessOverride,
  schedulesOverlap,
  type AssignmentSchedule,
} from './schedule.types';
import {
  cancelExternalAssignmentTimer,
  scheduleExternalAssignmentDisconnect,
  unblockUserSession,
} from '../vmAccessSchedule/scheduleManager';
import type {
  BulkUpdateSuperAdminExternalVmOverrideInput,
  CreateSuperAdminExternalVmAssignmentInput,
  PatchSuperAdminExternalVmAssignmentInput,
  PatchSuperAdminExternalVmDetailsInput,
  CreateSuperAdminExternalVmSiblingLoginInput,
  SetSuperAdminExternalVmInventoryLockInput,
} from './superAdminExternalVmAssignment.validation';

function toSchedule(input: {
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  daysOfWeek: number[];
  dailyStart: string;
  dailyEnd: string;
  timezone: string;
}): AssignmentSchedule {
  return {
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    daysOfWeek: input.daysOfWeek,
    dailyStart: input.dailyStart,
    dailyEnd: input.dailyEnd,
    timezone: input.timezone || 'Asia/Kolkata',
  };
}

const MAX_LOGINS_PER_IP = 5;

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

class SuperAdminExternalVmAssignmentService {
  async createAssignment(
    input: CreateSuperAdminExternalVmAssignmentInput,
    assignedBy: mongoose.Types.ObjectId
  ): Promise<SuperAdminExternalVmOverviewRow> {
    const externalVmId = new mongoose.Types.ObjectId(input.params.id);
    const vm = await ExternalVMModel.findById(externalVmId).lean();
    if (!vm) throw new NotFoundError('External VM not found.');

    const schedule =
      input.body.schedule === undefined
        ? null
        : input.body.schedule
          ? toSchedule(input.body.schedule)
          : null;

    if (vm.tenantId) {
      if (input.body.userId) {
        throw new ValidationError('Tenant VMs require tenantUserId, not userId.');
      }
      const tenantUserId = new mongoose.Types.ObjectId(input.body.tenantUserId!);
      const tenantUser = await TenantUser.findOne({
        _id: tenantUserId,
        tenantId: vm.tenantId,
      })
        .select('_id')
        .lean();
      if (!tenantUser) {
        throw new ValidationError('Tenant user not found in this tenant.');
      }

      await this.assertNoScheduleOverlap({
        externalVmId,
        kind: 'tenant',
        candidate: schedule,
      });

      try {
        const created = await ExternalVmTenantAssignmentModel.create({
          tenantId: vm.tenantId,
          externalVmId,
          tenantUserId,
          schedule,
          status: 'active',
          assignedBy,
        });
        this.armTimer('tenant', created._id.toString(), externalVmId.toString(), tenantUserId.toString(), schedule);
        await syncLegacyAssignedTenantUserId(vm.tenantId, externalVmId);
        return this.requireOverviewRow(externalVmId);
      } catch (err) {
        if (err instanceof Error && (err as { code?: number }).code === 11000) {
          throw new ValidationError('Assignment already exists for this tenant user.');
        }
        throw err;
      }
    }

    if (!vm.adminId) {
      throw new ValidationError('External VM has no admin or tenant owner.');
    }
    if (input.body.tenantUserId) {
      throw new ValidationError('Platform VMs require userId, not tenantUserId.');
    }

    const userId = new mongoose.Types.ObjectId(input.body.userId!);
    const user = await User.findOne({
      _id: userId,
      createdBy: vm.adminId,
      role: 'user',
    })
      .select('_id')
      .lean();
    if (!user) {
      throw new ValidationError('Managed user not found under this admin.');
    }

    const userAlreadyAssigned = await this.hasAnotherPlatformVmAssignment(
      vm.adminId,
      userId,
      externalVmId
    );
    if (userAlreadyAssigned) {
      throw new ValidationError('This managed user is already assigned to another VM.');
    }

    await this.assertNoScheduleOverlap({
      externalVmId,
      kind: 'platform',
      candidate: schedule,
    });

    try {
      const created = await ExternalVmUserAssignmentModel.create({
        externalVmId,
        userId,
        adminId: vm.adminId,
        schedule,
        status: 'active',
        assignedBy,
      });
      this.armTimer('platform', created._id.toString(), externalVmId.toString(), userId.toString(), schedule);
      await this.syncLegacyAssignedTo(externalVmId, vm.adminId);
      return this.requireOverviewRow(externalVmId);
    } catch (err) {
      if (err instanceof Error && (err as { code?: number }).code === 11000) {
        throw new ValidationError('Assignment already exists for this user.');
      }
      throw err;
    }
  }

  async patchAssignment(
    input: PatchSuperAdminExternalVmAssignmentInput
  ): Promise<SuperAdminExternalVmOverviewRow> {
    const externalVmId = new mongoose.Types.ObjectId(input.params.id);
    const assignmentId = new mongoose.Types.ObjectId(input.params.assignmentId);
    const vm = await ExternalVMModel.findById(externalVmId).lean();
    if (!vm) throw new NotFoundError('External VM not found.');

    if (vm.tenantId) {
      const row = await ExternalVmTenantAssignmentModel.findOne({
        _id: assignmentId,
        externalVmId,
        tenantId: vm.tenantId,
      });
      if (!row) throw new NotFoundError('Assignment not found.');

      const nextSchedule =
        input.body.schedule === undefined
          ? row.schedule ?? null
          : input.body.schedule
            ? toSchedule(input.body.schedule)
            : null;
      const nextStatus = input.body.status ?? row.status;

      if (input.body.schedule !== undefined && nextStatus === 'active') {
        await this.assertNoScheduleOverlap({
          externalVmId,
          kind: 'tenant',
          candidate: nextSchedule,
          excludeAssignmentId: assignmentId,
        });
      }

      row.schedule = nextSchedule;
      row.status = nextStatus;
      this.applyAccessOverridePatch(row, input.body);
      await row.save();

      this.syncAssignmentTimers(
        'tenant',
        row._id.toString(),
        externalVmId.toString(),
        row.tenantUserId.toString(),
        row.schedule ?? null,
        row
      );

      await syncLegacyAssignedTenantUserId(vm.tenantId, externalVmId);
      return this.requireOverviewRow(externalVmId);
    }

    if (!vm.adminId) {
      throw new ValidationError('External VM has no admin owner.');
    }

    const row = await ExternalVmUserAssignmentModel.findOne({
      _id: assignmentId,
      externalVmId,
      adminId: vm.adminId,
    });
    if (!row) throw new NotFoundError('Assignment not found.');

    const nextSchedule =
      input.body.schedule === undefined
        ? row.schedule ?? null
        : input.body.schedule
          ? toSchedule(input.body.schedule)
          : null;
    const nextStatus = input.body.status ?? row.status;

    if (input.body.schedule !== undefined && nextStatus === 'active') {
      await this.assertNoScheduleOverlap({
        externalVmId,
        kind: 'platform',
        candidate: nextSchedule,
        excludeAssignmentId: assignmentId,
      });
    }

    row.schedule = nextSchedule;
    row.status = nextStatus;
    this.applyAccessOverridePatch(row, input.body);
    await row.save();

    this.syncAssignmentTimers(
      'platform',
      row._id.toString(),
      externalVmId.toString(),
      row.userId.toString(),
      row.schedule ?? null,
      row
    );

    await this.syncLegacyAssignedTo(externalVmId, vm.adminId);
    return this.requireOverviewRow(externalVmId);
  }

  /**
   * Grant/revoke access override on many VMs in a few Mongo updates so the
   * HTTP request does not time out (no per-VM save / overview reload).
   */
  async bulkUpdateOverride(
    input: BulkUpdateSuperAdminExternalVmOverrideInput['body']
  ): Promise<{
    updatedVms: number;
    updatedAssignments: number;
    notFound: string[];
  }> {
    const uniqueIds = [...new Set(input.ids)];
    const objectIds = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));

    const found = uniqueIds.length
      ? await ExternalVMModel.find({ _id: { $in: objectIds } }).select('_id').lean()
      : [];
    const foundOids = found.map((vm) => vm._id as mongoose.Types.ObjectId);
    const foundIdSet = new Set(foundOids.map((id) => id.toString()));
    const notFound = uniqueIds.filter((id) => !foundIdSet.has(id));

    if (foundOids.length === 0) {
      return { updatedVms: 0, updatedAssignments: 0, notFound };
    }

    const accessOverrideUntil = input.accessOverride
      ? input.accessOverrideUntil
        ? new Date(input.accessOverrideUntil)
        : null
      : null;
    const setFields = {
      accessOverride: input.accessOverride,
      accessOverrideUntil,
    };

    const assignmentFilter = {
      externalVmId: { $in: foundOids },
      status: 'active' as const,
    };

    const [platformAssigns, tenantAssigns] = await Promise.all([
      ExternalVmUserAssignmentModel.find(assignmentFilter)
        .select('_id externalVmId userId schedule status')
        .lean(),
      ExternalVmTenantAssignmentModel.find(assignmentFilter)
        .select('_id externalVmId tenantUserId schedule status')
        .lean(),
    ]);

    await Promise.all([
      ExternalVmUserAssignmentModel.updateMany(assignmentFilter, { $set: setFields }),
      ExternalVmTenantAssignmentModel.updateMany(assignmentFilter, { $set: setFields }),
      ExternalVMModel.updateMany(
        { _id: { $in: foundOids } },
        { $set: { ...setFields, updatedAt: new Date() } }
      ),
    ]);

    for (const row of platformAssigns) {
      this.syncAssignmentTimers(
        'platform',
        row._id.toString(),
        row.externalVmId.toString(),
        row.userId.toString(),
        row.schedule ?? null,
        { status: row.status, ...setFields }
      );
    }
    for (const row of tenantAssigns) {
      this.syncAssignmentTimers(
        'tenant',
        row._id.toString(),
        row.externalVmId.toString(),
        row.tenantUserId.toString(),
        row.schedule ?? null,
        { status: row.status, ...setFields }
      );
    }

    const updatedAssignments = platformAssigns.length + tenantAssigns.length;
    logger.info('[SuperAdminExternalVM] Bulk access override updated', {
      accessOverride: input.accessOverride,
      updatedVms: foundOids.length,
      updatedAssignments,
      notFound: notFound.length,
    });

    return {
      updatedVms: foundOids.length,
      updatedAssignments,
      notFound,
    };
  }

  async setInventoryLock(
    input: SetSuperAdminExternalVmInventoryLockInput
  ): Promise<{ externalVmId: string; inventoryLocked: boolean }> {
    const externalVmId = new mongoose.Types.ObjectId(input.params.id);
    const result = await ExternalVMModel.findByIdAndUpdate(
      externalVmId,
      {
        $set: {
          inventoryLocked: input.body.inventoryLocked,
          updatedAt: new Date(),
        },
      },
      { new: true, select: '_id inventoryLocked' }
    ).lean();

    if (!result) throw new NotFoundError('External VM not found.');

    logger.info('[SuperAdminExternalVM] Inventory lock updated', {
      externalVmId: result._id.toString(),
      inventoryLocked: Boolean(result.inventoryLocked),
    });

    return {
      externalVmId: result._id.toString(),
      inventoryLocked: Boolean(result.inventoryLocked),
    };
  }

  async updateDetails(
    input: PatchSuperAdminExternalVmDetailsInput,
    updatedByUserId: string
  ): Promise<SuperAdminExternalVmOverviewRow> {
    const externalVmId = new mongoose.Types.ObjectId(input.params.id);
    const doc = await ExternalVMModel.findById(externalVmId);
    if (!doc) throw new NotFoundError('External VM not found.');

    const nextName = input.body.name?.trim();
    const nextUsername = input.body.username?.trim();
    const nextPassword = input.body.password;

    if (nextUsername) {
      const siblings = await this.findSiblingsByIp(doc.ipAddress);
      const taken = siblings.some(
        (sibling) =>
          sibling._id.toString() !== doc._id.toString() &&
          normalizeUsername(sibling.username ?? '') === normalizeUsername(nextUsername)
      );
      if (taken) {
        throw new ValidationError('This IP already has a VM login with that username.');
      }
      doc.username = nextUsername;
    }

    if (nextName) {
      doc.name = nextName;
    }
    if (nextPassword) {
      doc.password = encrypt(nextPassword);
    }

    doc.updatedAt = new Date();
    await doc.save();

    const oldest = await ExternalVMModel.findOne({ ipAddress: doc.ipAddress })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean();
    if (oldest && oldest._id.toString() === doc._id.toString() && (nextUsername || nextPassword)) {
      const ipAddress = normalizeCanonicalIpv4(doc.ipAddress);
      const set: Record<string, unknown> = {
        updatedBy: new mongoose.Types.ObjectId(updatedByUserId),
      };
      if (nextUsername) set['providerUsername'] = nextUsername;
      if (nextPassword) set['providerPassword'] = encrypt(nextPassword);
      await VmProviderMetadataModel.findOneAndUpdate(
        { ipAddress },
        { $set: set, $setOnInsert: { ipAddress } },
        { upsert: true }
      );
    }

    logger.info('[SuperAdminExternalVM] VM details updated', {
      externalVmId: doc._id.toString(),
      ipAddress: doc.ipAddress,
    });

    return this.requireOverviewRow(doc._id);
  }

  async addSiblingLogin(
    input: CreateSuperAdminExternalVmSiblingLoginInput
  ): Promise<SuperAdminExternalVmOverviewRow> {
    const sourceId = new mongoose.Types.ObjectId(input.params.id);
    const source = await ExternalVMModel.findById(sourceId);
    if (!source) throw new NotFoundError('External VM not found.');

    const username = input.body.username.trim();
    const siblings = await this.findSiblingsByIp(source.ipAddress);
    if (siblings.length >= MAX_LOGINS_PER_IP) {
      throw new ValidationError(`This IP already has the maximum of ${MAX_LOGINS_PER_IP} VM logins.`);
    }
    const taken = siblings.some(
      (sibling) => normalizeUsername(sibling.username ?? '') === normalizeUsername(username)
    );
    if (taken) {
      throw new ValidationError('This IP already has a VM login with that username.');
    }

    const now = new Date();
    const created = await ExternalVMModel.create({
      name: input.body.name?.trim() || `${source.name} (login ${siblings.length + 1})`,
      ipAddress: source.ipAddress,
      protocol: source.protocol,
      port: source.port,
      username,
      password: encrypt(input.body.password),
      source: source.source,
      adminId: source.adminId,
      tenantId: source.tenantId,
      projectId: source.projectId,
      inventoryLocked: false,
      createdAt: now,
      updatedAt: now,
    });

    logger.info('[SuperAdminExternalVM] Sibling VM login created', {
      sourceId: source._id.toString(),
      createdId: created._id.toString(),
      ipAddress: source.ipAddress,
    });

    return this.requireOverviewRow(created._id);
  }

  private async findSiblingsByIp(
    ipAddress: string
  ): Promise<Array<{ _id: mongoose.Types.ObjectId; username?: string | null }>> {
    const canonical = normalizeCanonicalIpv4(ipAddress);
    const candidates = await ExternalVMModel.find({
      ipAddress: { $in: [...new Set([ipAddress, canonical])] },
    })
      .select('_id ipAddress username')
      .lean();

    return candidates.filter((item) => normalizeCanonicalIpv4(item.ipAddress) === canonical);
  }

  async deleteAssignment(
    externalVmIdRaw: string,
    assignmentIdRaw: string
  ): Promise<SuperAdminExternalVmOverviewRow> {
    const externalVmId = new mongoose.Types.ObjectId(externalVmIdRaw);
    const assignmentId = new mongoose.Types.ObjectId(assignmentIdRaw);
    const vm = await ExternalVMModel.findById(externalVmId).lean();
    if (!vm) throw new NotFoundError('External VM not found.');

    if (vm.tenantId) {
      const result = await ExternalVmTenantAssignmentModel.deleteOne({
        _id: assignmentId,
        externalVmId,
        tenantId: vm.tenantId,
      });
      if (result.deletedCount === 0) throw new NotFoundError('Assignment not found.');
      cancelExternalAssignmentTimer(assignmentIdRaw, 'tenant');
      await syncLegacyAssignedTenantUserId(vm.tenantId, externalVmId);
      return this.requireOverviewRow(externalVmId);
    }

    if (!vm.adminId) {
      throw new ValidationError('External VM has no admin owner.');
    }

    const result = await ExternalVmUserAssignmentModel.deleteOne({
      _id: assignmentId,
      externalVmId,
      adminId: vm.adminId,
    });
    if (result.deletedCount === 0) throw new NotFoundError('Assignment not found.');
    cancelExternalAssignmentTimer(assignmentIdRaw, 'platform');
    await this.syncLegacyAssignedTo(externalVmId, vm.adminId);
    return this.requireOverviewRow(externalVmId);
  }

  private async assertNoScheduleOverlap(input: {
    externalVmId: mongoose.Types.ObjectId;
    kind: 'platform' | 'tenant';
    candidate: AssignmentSchedule | null;
    excludeAssignmentId?: mongoose.Types.ObjectId;
  }): Promise<void> {
    if (!input.candidate) return;

    const rows =
      input.kind === 'tenant'
        ? await ExternalVmTenantAssignmentModel.find({
            externalVmId: input.externalVmId,
            status: 'active',
            ...(input.excludeAssignmentId ? { _id: { $ne: input.excludeAssignmentId } } : {}),
          }).lean()
        : await ExternalVmUserAssignmentModel.find({
            externalVmId: input.externalVmId,
            status: 'active',
            ...(input.excludeAssignmentId ? { _id: { $ne: input.excludeAssignmentId } } : {}),
          }).lean();

    for (const row of rows) {
      if (!row.schedule) continue;
      if (schedulesOverlap(input.candidate, row.schedule)) {
        throw new ValidationError('Schedule overlaps with an existing assignment on this VM.');
      }
    }
  }

  private applyAccessOverridePatch(
    row: {
      accessOverride: boolean;
      accessOverrideUntil?: Date | null;
    },
    body: PatchSuperAdminExternalVmAssignmentInput['body']
  ): void {
    if (body.accessOverride === undefined) return;

    row.accessOverride = body.accessOverride;
    if (body.accessOverride) {
      row.accessOverrideUntil = body.accessOverrideUntil
        ? new Date(body.accessOverrideUntil)
        : null;
    } else {
      row.accessOverrideUntil = null;
    }
  }

  private syncAssignmentTimers(
    kind: 'platform' | 'tenant',
    assignmentId: string,
    externalVmId: string,
    assigneeUserId: string,
    schedule: AssignmentSchedule | null,
    row: {
      status: string;
      accessOverride: boolean;
      accessOverrideUntil?: Date | null;
    }
  ): void {
    if (row.status !== 'active') {
      cancelExternalAssignmentTimer(assignmentId, kind);
      return;
    }

    if (hasActiveAssignmentAccessOverride(row)) {
      cancelExternalAssignmentTimer(assignmentId, kind);
      unblockUserSession(assigneeUserId);
      return;
    }

    if (schedule) {
      this.armTimer(kind, assignmentId, externalVmId, assigneeUserId, schedule);
    } else {
      cancelExternalAssignmentTimer(assignmentId, kind);
    }
  }

  private armTimer(
    kind: 'platform' | 'tenant',
    assignmentId: string,
    externalVmId: string,
    assigneeUserId: string,
    schedule: AssignmentSchedule | null
  ): void {
    if (!schedule) {
      cancelExternalAssignmentTimer(assignmentId, kind);
      return;
    }
    scheduleExternalAssignmentDisconnect({
      assignmentId,
      externalVmId,
      assigneeUserId,
      schedule,
      kind,
    });
  }

  private async hasAnotherPlatformVmAssignment(
    adminId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    externalVmId: mongoose.Types.ObjectId
  ): Promise<boolean> {
    const [activeJunction, legacyAssigned] = await Promise.all([
      ExternalVmUserAssignmentModel.exists({
        adminId,
        userId,
        status: 'active',
        externalVmId: { $ne: externalVmId },
      }),
      ExternalVMModel.exists({
        adminId,
        assignedTo: userId,
        _id: { $ne: externalVmId },
      }),
    ]);

    return Boolean(activeJunction || legacyAssigned);
  }

  private async syncLegacyAssignedTo(
    externalVmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const first = await ExternalVmUserAssignmentModel.findOne({
      externalVmId,
      adminId,
      status: 'active',
    })
      .sort({ createdAt: 1 })
      .select('userId')
      .lean();

    await ExternalVMModel.updateOne(
      { _id: externalVmId, adminId },
      first?.userId
        ? { $set: { assignedTo: first.userId } }
        : { $unset: { assignedTo: 1 } }
    );
  }

  private async requireOverviewRow(
    externalVmId: mongoose.Types.ObjectId
  ): Promise<SuperAdminExternalVmOverviewRow> {
    const row = await superAdminExternalVmOverviewService.getOverviewRow(externalVmId);
    if (!row) throw new NotFoundError('External VM not found.');
    return row;
  }
}

export const superAdminExternalVmAssignmentService = new SuperAdminExternalVmAssignmentService();
