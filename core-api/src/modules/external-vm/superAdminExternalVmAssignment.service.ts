import mongoose from 'mongoose';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { ExternalVMModel } from './external-vm.model';
import { syncLegacyAssignedTenantUserId } from './externalVmTenantAssignment.service';
import {
  superAdminExternalVmOverviewService,
  type SuperAdminExternalVmOverviewRow,
} from './superAdminExternalVmOverview.service';
import {
  schedulesOverlap,
  type AssignmentSchedule,
} from './schedule.types';
import {
  cancelExternalAssignmentTimer,
  scheduleExternalAssignmentDisconnect,
} from '../vmAccessSchedule/scheduleManager';
import type {
  CreateSuperAdminExternalVmAssignmentInput,
  PatchSuperAdminExternalVmAssignmentInput,
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

      const tenantAlreadyAssigned = await this.hasAnotherTenantVmAssignment(
        vm.tenantId,
        tenantUserId,
        externalVmId
      );
      if (tenantAlreadyAssigned) {
        throw new ValidationError('This tenant user is already assigned to another VM.');
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
      await row.save();

      if (nextStatus === 'active' && nextSchedule) {
        this.armTimer(
          'tenant',
          row._id.toString(),
          externalVmId.toString(),
          row.tenantUserId.toString(),
          nextSchedule
        );
      } else {
        cancelExternalAssignmentTimer(row._id.toString(), 'tenant');
      }

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
    await row.save();

    if (nextStatus === 'active' && nextSchedule) {
      this.armTimer(
        'platform',
        row._id.toString(),
        externalVmId.toString(),
        row.userId.toString(),
        nextSchedule
      );
    } else {
      cancelExternalAssignmentTimer(row._id.toString(), 'platform');
    }

    await this.syncLegacyAssignedTo(externalVmId, vm.adminId);
    return this.requireOverviewRow(externalVmId);
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

  private async hasAnotherTenantVmAssignment(
    tenantId: mongoose.Types.ObjectId,
    tenantUserId: mongoose.Types.ObjectId,
    externalVmId: mongoose.Types.ObjectId
  ): Promise<boolean> {
    const [activeJunction, legacyAssigned] = await Promise.all([
      ExternalVmTenantAssignmentModel.exists({
        tenantId,
        tenantUserId,
        status: 'active',
        externalVmId: { $ne: externalVmId },
      }),
      ExternalVMModel.exists({
        tenantId,
        assignedTenantUserId: tenantUserId,
        _id: { $ne: externalVmId },
      }),
    ]);

    return Boolean(activeJunction || legacyAssigned);
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
