import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { TenantUser } from '../../models/tenantUser.model';
import { ExternalVMModel } from '../external-vm/external-vm.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { accessSchedulePublicView } from '../vmAccessSchedule/accessScheduleParse';
import type { AssignmentSchedule } from '../external-vm/schedule.types';
import type { ExternalVmAssignmentSummary } from '../external-vm/external-vm.types';
import type { IExternalVM } from '../external-vm/external-vm.model';
import type { MyVmDashboardResult, MyVmDashboardRow } from './myVmDashboard.types';

function toSchedulePublic(
  schedule?: AssignmentSchedule | null
): ExternalVmAssignmentSummary['schedule'] {
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

function toAccessScheduleView(doc: IExternalVM): MyVmDashboardRow['accessSchedule'] {
  const raw = accessSchedulePublicView(doc);
  return {
    startDate: raw.accessStartDate ? new Date(raw.accessStartDate).toISOString().slice(0, 10) : null,
    endDate: raw.accessEndDate ? new Date(raw.accessEndDate).toISOString().slice(0, 10) : null,
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

function toRow(
  doc: IExternalVM,
  assignments: ExternalVmAssignmentSummary[]
): MyVmDashboardRow {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    ipAddress: doc.ipAddress,
    protocol: doc.protocol,
    username: doc.username,
    password: '••••••••',
    source: doc.source ?? 'admin_import',
    sourceLabel: 'External Server',
    assignments,
    accessSchedule: toAccessScheduleView(doc),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

class MyVmDashboardService {
  /** GET /my-vms — platform admin view scoped to caller's adminId. */
  async listForAdmin(adminId: mongoose.Types.ObjectId): Promise<MyVmDashboardResult> {
    const docs = await ExternalVMModel.find({ adminId, source: 'superadmin_bulk' }).sort({ createdAt: -1 }).lean();
    if (docs.length === 0) return { rows: [], total: 0 };

    const vmIds = docs.map((d) => d._id);
    const assignRows = await ExternalVmUserAssignmentModel.find({
      externalVmId: { $in: vmIds },
      $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
    }).lean();

    const userIds = [...new Set(assignRows.map((r) => r.userId.toString()))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('_id email username').lean()
      : [];
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    const byVm = new Map<string, ExternalVmAssignmentSummary[]>();
    for (const row of assignRows) {
      const key = row.externalVmId.toString();
      const u = userById.get(row.userId.toString());
      const list = byVm.get(key) ?? [];
      list.push({
        assignmentId: row._id.toString(),
        userId: row.userId.toString(),
        email: u?.email ?? null,
        username: u?.username ?? null,
        status: row.status ?? 'active',
        schedule: toSchedulePublic(row.schedule ?? null),
      });
      byVm.set(key, list);
    }

    // Surface legacy assignedTo when no junction row exists
    const legacyNeeds = docs.filter(
      (d) => d.assignedTo && !byVm.has(d._id.toString())
    );
    if (legacyNeeds.length > 0) {
      const legacyUsers = await User.find({
        _id: { $in: legacyNeeds.map((d) => d.assignedTo!) },
      }).select('_id email username').lean();
      const legacyById = new Map(legacyUsers.map((u) => [u._id.toString(), u]));
      for (const d of legacyNeeds) {
        const u = legacyById.get(d.assignedTo!.toString());
        byVm.set(d._id.toString(), [
          {
            assignmentId: `legacy:${d._id.toString()}`,
            userId: d.assignedTo!.toString(),
            email: u?.email ?? null,
            username: u?.username ?? null,
            status: 'active',
            schedule: null,
          },
        ]);
      }
    }

    const rows = docs.map((doc) => toRow(doc as unknown as IExternalVM, byVm.get(doc._id.toString()) ?? []));
    return { rows, total: rows.length };
  }

  /** GET /tenant/my-vms — tenant admin view scoped to caller's tenantId. */
  async listForTenant(tenantId: mongoose.Types.ObjectId): Promise<MyVmDashboardResult> {
    const docs = await ExternalVMModel.find({ tenantId, source: 'superadmin_bulk' }).sort({ createdAt: -1 }).lean();
    if (docs.length === 0) return { rows: [], total: 0 };

    const vmIds = docs.map((d) => d._id);
    const assignRows = await ExternalVmTenantAssignmentModel.find({
      tenantId,
      externalVmId: { $in: vmIds },
      $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
    }).lean();

    const tenantUserIds = [...new Set(assignRows.map((r) => r.tenantUserId.toString()))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    const tenantUsers = tenantUserIds.length
      ? await TenantUser.find({ _id: { $in: tenantUserIds } }).select('_id email username').lean()
      : [];
    const userById = new Map(tenantUsers.map((u) => [u._id.toString(), u]));

    const byVm = new Map<string, ExternalVmAssignmentSummary[]>();
    for (const row of assignRows) {
      const key = row.externalVmId.toString();
      const u = userById.get(row.tenantUserId.toString());
      const list = byVm.get(key) ?? [];
      list.push({
        assignmentId: row._id.toString(),
        tenantUserId: row.tenantUserId.toString(),
        email: u?.email ?? null,
        username: u?.username ?? null,
        status: row.status ?? 'active',
        schedule: toSchedulePublic(row.schedule ?? null),
      });
      byVm.set(key, list);
    }

    const rows = docs.map((doc) => toRow(doc as unknown as IExternalVM, byVm.get(doc._id.toString()) ?? []));
    return { rows, total: rows.length };
  }
}

export const myVmDashboardService = new MyVmDashboardService();
