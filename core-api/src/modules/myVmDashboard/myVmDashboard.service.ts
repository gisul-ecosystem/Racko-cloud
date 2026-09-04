import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { TenantUser } from '../../models/tenantUser.model';
import { VM, type IVM } from '../vm/vm.model';
import { ExternalVMModel, type ExternalVMSource, type IExternalVM } from '../external-vm/external-vm.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { accessSchedulePublicView } from '../vmAccessSchedule/accessScheduleParse';
import { vmCatalogService } from '../vmCatalog/vmCatalog.service';
import type { AssignmentSchedule } from '../external-vm/schedule.types';
import type { ExternalVmAssignmentSummary } from '../external-vm/external-vm.types';
import type { CatalogVmResponse } from '../vmCatalog/vmCatalog.types';
import type {
  MyVmDashboardResult,
  MyVmDashboardRow,
  MyVmDashboardScope,
  MyVmOriginServiceKey,
  MyVmOriginServiceLabel,
} from './myVmDashboard.types';
import {
  catalogVmPaths,
  externalVmPaths,
  platformVmPaths,
} from './myVmDashboard.paths';

const DELETED_VM_STATUSES = ['deleted', 'deleting', 'delete_failed'] as const;

type PlatformVmLean = mongoose.FlattenMaps<IVM> & { _id: mongoose.Types.ObjectId };
type ExternalVmLean = mongoose.FlattenMaps<IExternalVM> & { _id: mongoose.Types.ObjectId };

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

function toAccessScheduleView(doc: {
  accessStartDate?: Date | null;
  accessEndDate?: Date | null;
  accessStartTime?: string | null;
  accessEndTime?: string | null;
  accessOverride?: boolean;
  accessOverrideUntil?: Date | null;
  weeklySchedule?: IExternalVM['weeklySchedule'];
  weeklyScheduleTz?: string;
}): MyVmDashboardRow['accessSchedule'] {
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

function externalOrigin(source: ExternalVMSource): {
  originServiceKey: MyVmOriginServiceKey;
  originServiceLabel: MyVmOriginServiceLabel;
} {
  if (source === 'superadmin_bulk') {
    return { originServiceKey: 'external-vm', originServiceLabel: 'External VM Import' };
  }
  return { originServiceKey: 'elastic-servers', originServiceLabel: 'Elastic Server Import' };
}

function platformStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    running: 'Running',
    stopped: 'Stopped',
    creating: 'Creating',
    paused: 'Paused',
    suspended: 'Suspended',
    error: 'Error',
  };
  return labels[status] ?? status;
}

function catalogStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_approval: 'Pending approval',
    approved: 'Approved',
    provisioning: 'Provisioning',
    fulfilling: 'Provisioning',
    ready_to_attach: 'Provisioning',
    active: 'Active',
    failed: 'Failed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    suspended: 'Suspended',
  };
  return labels[status] ?? status;
}

function sortRows(rows: MyVmDashboardRow[]): MyVmDashboardRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

class MyVmDashboardService {
  async listForAdmin(adminId: mongoose.Types.ObjectId): Promise<MyVmDashboardResult> {
    const [platformVms, catalogVms, externalDocs] = await Promise.all([
      VM.find({
        adminId,
        status: { $nin: DELETED_VM_STATUSES },
      })
        .sort({ createdAt: -1 })
        .lean(),
      vmCatalogService.listForAdmin(adminId),
      ExternalVMModel.find({ adminId }).sort({ createdAt: -1 }).lean(),
    ]);

    const rows: MyVmDashboardRow[] = [
      ...(await this.platformRows(platformVms, 'admin')),
      ...this.catalogRows(catalogVms, 'admin'),
      ...(await this.externalRows(externalDocs, 'admin', adminId, null)),
    ];

    const sorted = sortRows(rows);
    return { rows: sorted, total: sorted.length };
  }

  async listForTenant(tenantId: mongoose.Types.ObjectId): Promise<MyVmDashboardResult> {
    const [platformVms, catalogVms, externalDocs] = await Promise.all([
      VM.find({
        tenantId,
        status: { $nin: DELETED_VM_STATUSES },
      })
        .sort({ createdAt: -1 })
        .lean(),
      vmCatalogService.listForTenant(tenantId),
      ExternalVMModel.find({ tenantId }).sort({ createdAt: -1 }).lean(),
    ]);

    const rows: MyVmDashboardRow[] = [
      ...(await this.platformRows(platformVms, 'tenant')),
      ...this.catalogRows(catalogVms, 'tenant'),
      ...(await this.externalRows(externalDocs, 'tenant', null, tenantId)),
    ];

    const sorted = sortRows(rows);
    return { rows: sorted, total: sorted.length };
  }

  private async platformRows(vms: PlatformVmLean[], scope: MyVmDashboardScope): Promise<MyVmDashboardRow[]> {
    if (vms.length === 0) return [];

    const userIds = [
      ...new Set(
        vms
          .map((vm) =>
            scope === 'tenant'
              ? vm.assignedTenantUserId?.toString()
              : vm.assignedTo?.toString()
          )
          .filter((id): id is string => Boolean(id))
      ),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const assignmentMap = new Map<string, ExternalVmAssignmentSummary[]>();

    if (scope === 'admin' && userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } })
        .select('_id email username')
        .lean();
      const userById = new Map(users.map((u) => [u._id.toString(), u]));
      for (const vm of vms) {
        if (!vm.assignedTo) continue;
        const u = userById.get(vm.assignedTo.toString());
        assignmentMap.set(vm._id.toString(), [
          {
            assignmentId: `platform:${vm._id.toString()}`,
            userId: vm.assignedTo.toString(),
            email: u?.email ?? null,
            username: u?.username ?? null,
            status: 'active',
            schedule: null,
          },
        ]);
      }
    }

    if (scope === 'tenant' && userIds.length > 0) {
      const users = await TenantUser.find({ _id: { $in: userIds } })
        .select('_id email username')
        .lean();
      const userById = new Map(users.map((u) => [u._id.toString(), u]));
      for (const vm of vms) {
        if (!vm.assignedTenantUserId) continue;
        const u = userById.get(vm.assignedTenantUserId.toString());
        assignmentMap.set(vm._id.toString(), [
          {
            assignmentId: `platform:${vm._id.toString()}`,
            tenantUserId: vm.assignedTenantUserId.toString(),
            email: u?.email ?? null,
            username: u?.username ?? null,
            status: 'active',
            schedule: null,
          },
        ]);
      }
    }

    return vms.map((vm) => {
      const id = vm._id.toString();
      const protocol = vm.consoleProtocol ?? 'rdp';
      const paths = platformVmPaths(scope, id, protocol);
      const canConsole =
        vm.status === 'running' && Boolean(vm.consoleReady && vm.ipAddress);

      return {
        _id: id,
        resourceType: 'platform_vm',
        originServiceKey: 'vm-management',
        originServiceLabel: 'VPS Hosting',
        name: vm.name,
        ipAddress: vm.ipAddress ?? null,
        protocol,
        username: vm.consoleUsername ?? null,
        password: null,
        status: vm.status,
        statusLabel: platformStatusLabel(vm.status),
        canConsole,
        consolePath: canConsole ? paths.consolePath : null,
        managePath: paths.managePath,
        assignments: assignmentMap.get(id) ?? [],
        accessSchedule: toAccessScheduleView(vm),
        createdAt: new Date(vm.createdAt).toISOString(),
        updatedAt: new Date(vm.updatedAt).toISOString(),
      };
    });
  }

  private catalogRows(vms: CatalogVmResponse[], scope: MyVmDashboardScope): MyVmDashboardRow[] {
    return vms.map((vm): MyVmDashboardRow => {
      const requestId = vm.parentRequestId ?? vm._id;
      const instanceId = vm.instanceId;
      const paths = catalogVmPaths(scope, requestId, instanceId);
      const displayStatus = vm.status;
      const canConsole = displayStatus === 'active' && Boolean(vm.ipAddress);
      const instanceSuffix =
        vm.instanceTotal && vm.instanceTotal > 1
          ? ` · VM ${vm.instanceIndex ?? 1} of ${vm.instanceTotal}`
          : '';

      return {
        _id: requestId,
        resourceType: 'catalog_vm',
        originServiceKey: 'create-vm',
        originServiceLabel: 'VM Catalog',
        name: `${vm.planName}${instanceSuffix}`,
        ipAddress: vm.ipAddress ?? null,
        protocol: vm.protocol ?? null,
        username: vm.username ?? null,
        password: vm.password ?? null,
        ...(vm.hostname ? { hostname: vm.hostname } : {}),
        status: displayStatus,
        statusLabel: catalogStatusLabel(displayStatus),
        canConsole,
        consolePath: canConsole ? paths.consolePath : null,
        managePath: paths.managePath,
        ...(instanceId ? { instanceId } : {}),
        ...(vm.parentRequestId ? { parentRequestId: vm.parentRequestId } : {}),
        ...(vm.powerControlMode ? { powerControlMode: vm.powerControlMode } : {}),
        assignments: [],
        accessSchedule: null,
        createdAt: vm.createdAt,
        updatedAt: vm.updatedAt,
      };
    });
  }

  private async externalRows(
    docs: ExternalVmLean[],
    scope: MyVmDashboardScope,
    adminId: mongoose.Types.ObjectId | null,
    tenantId: mongoose.Types.ObjectId | null
  ): Promise<MyVmDashboardRow[]> {
    if (docs.length === 0) return [];

    const vmIds = docs.map((d) => d._id);
    const byVm = new Map<string, ExternalVmAssignmentSummary[]>();

    if (scope === 'admin' && adminId) {
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

      const legacyNeeds = docs.filter((d) => d.assignedTo && !byVm.has(d._id.toString()));
      if (legacyNeeds.length > 0) {
        const legacyUsers = await User.find({
          _id: { $in: legacyNeeds.map((d) => d.assignedTo!) },
        })
          .select('_id email username')
          .lean();
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
    }

    if (scope === 'tenant' && tenantId) {
      const assignRows = await ExternalVmTenantAssignmentModel.find({
        tenantId,
        externalVmId: { $in: vmIds },
        $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
      }).lean();

      const tenantUserIds = [...new Set(assignRows.map((r) => r.tenantUserId.toString()))].map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      const tenantUsers = tenantUserIds.length
        ? await TenantUser.find({ _id: { $in: tenantUserIds } })
            .select('_id email username')
            .lean()
        : [];
      const userById = new Map(tenantUsers.map((u) => [u._id.toString(), u]));

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
    }

    return docs.map((doc) => {
      const id = doc._id.toString();
      const source = doc.source ?? 'admin_import';
      const origin = externalOrigin(source);
      const paths = externalVmPaths(scope, id);
      const canConsole = Boolean(doc.ipAddress && doc.username);

      return {
        _id: id,
        resourceType: 'external_vm',
        originServiceKey: origin.originServiceKey,
        originServiceLabel: origin.originServiceLabel,
        name: doc.name,
        ipAddress: doc.ipAddress ?? null,
        protocol: doc.protocol ?? null,
        username: doc.username ?? null,
        password: null,
        status: 'active',
        statusLabel: 'Active',
        canConsole,
        consolePath: canConsole ? paths.consolePath : null,
        managePath: paths.managePath,
        assignments: byVm.get(id) ?? [],
        accessSchedule: toAccessScheduleView(doc),
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
      };
    });
  }
}

export const myVmDashboardService = new MyVmDashboardService();
