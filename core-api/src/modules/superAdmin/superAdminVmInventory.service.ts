import mongoose from 'mongoose';
import { VM } from '../vm/vm.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { CatalogVmInstanceModel } from '../../models/catalogVmInstance.model';
import { ExternalVMModel, type ExternalVMSource } from '../external-vm/external-vm.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { ProjectModel } from '../../models/project.model';
import { VmProviderMetadataModel, type ProviderPlanDuration } from '../../models/vmProviderMetadata.model';
import { decrypt, encrypt } from '../../utils/crypto';
import { normalizeCanonicalIpv4 } from '../vm/helpers/ipCidr';
import { cancelExternalAssignmentTimer } from '../vmAccessSchedule/scheduleManager';

type InventoryResourceType = 'platform_vm' | 'catalog_vm' | 'external_vm';
type InventoryOwnerScope = 'admin' | 'tenant';
type InventoryStatus = 'provisioning' | 'active' | 'suspended' | 'failed' | 'deleted';

type InventoryOriginChannel =
  | 'vps_admin_create'
  | 'vps_tenant_order'
  | 'vps_clone'
  | 'catalog_admin_request'
  | 'catalog_tenant_request'
  | 'catalog_auto_provision'
  | 'external_admin_import'
  | 'external_tenant_import'
  | 'external_superadmin_bulk';

export interface SuperAdminVmInventoryFilters {
  resourceType?: InventoryResourceType;
  originServiceKey?: 'vm-management' | 'create-vm' | 'external-vm';
  ownerScope?: InventoryOwnerScope;
  tenantId?: string;
  adminId?: string;
  projectId?: string;
  status?: InventoryStatus;
  search?: string;
  ownerSearch?: string;
  sortBy?: 'createdAt' | 'owner' | 'service';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  createdFrom?: string;
  createdTo?: string;
}

export interface VmInventoryRecord {
  inventoryId: string;
  resourceType: InventoryResourceType;
  sourceCollection: 'vms' | 'catalog_vms' | 'external_vms';
  sourceId: string;
  name: string;
  ipAddress?: string;
  protocol?: 'rdp' | 'ssh' | 'vnc';
  status: InventoryStatus;
  originServiceKey: 'vm-management' | 'create-vm' | 'external-vm';
  originServiceLabel: 'VPS Hosting' | 'VM Catalog' | 'External VM Import';
  originChannel: InventoryOriginChannel;
  providerVmSpec?: string | null;
  providerPlanDuration?: ProviderPlanDuration | null;
  providerUsername?: string | null;
  providerPassword?: string | null;
  providerStartDate?: Date | null;
  providerEndDate?: Date | null;
  ownerScope: InventoryOwnerScope;
  ownerAdminId?: string;
  ownerAdminEmail?: string;
  ownerTenantId?: string;
  ownerTenantName?: string;
  mappedTenantId?: string;
  mappedTenantName?: string;
  mappedTenantUserId?: string;
  mappedTenantUserEmail?: string;
  mappedAssignments: Array<{
    username: string;
    isTenantUser: boolean;
    tenantName?: string;
    planDuration?: ProviderPlanDuration | null;
    vmUsername?: string | null;
    vmPassword?: string | null;
    providerStartDate?: Date | null;
    providerEndDate?: Date | null;
    startDate?: Date | null;
    endDate?: Date | null;
  }>;
  mappedUsers: string[];
  assignmentLocation: string;
  projectId?: string;
  projectName?: string;
  projectClientName?: string;
  orderId?: string;
  vmid?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuperAdminVmInventoryListResult {
  items: VmInventoryRecord[];
  owners: SuperAdminVmInventoryOwnerOption[];
  total: number;
  page: number;
  limit: number;
}

export interface SuperAdminVmInventoryOwnerOption {
  label: string;
  count: number;
}

export interface VmProviderMetadataImportRow {
  ipAddress: string;
  name?: string;
  vmSpec?: string;
  protocol?: 'rdp' | 'ssh' | 'vnc';
  planDuration?: ProviderPlanDuration;
  username?: string;
  password?: string;
  providerStartDate?: string;
  providerEndDate?: string;
}

export interface VmProviderMetadataImportResult {
  total: number;
  updated: number;
  created: number;
}

export interface VmProviderMetadataUpdateRow {
  ipAddress: string;
  providerStartDate?: string | null;
  providerEndDate?: string | null;
  planDuration?: ProviderPlanDuration;
}

export interface VmProviderMetadataUpdateResult {
  updated: boolean;
}

export interface SuperAdminVmInventoryClearAssignmentInput {
  resourceType: InventoryResourceType;
  sourceId: string;
}

export interface SuperAdminVmInventoryClearAssignmentResult {
  updated: boolean;
  deletedPlatformUsers?: number;
  deletedTenantUsers?: number;
}

export interface SuperAdminVmInventoryDeleteAssignedUserResult {
  updated: boolean;
  deletedPlatformUsers: number;
  deletedTenantUsers: number;
}

export interface SuperAdminVmInventoryFreeVmResult {
  updated: boolean;
  deletedPlatformUsers: number;
  deletedTenantUsers: number;
  clearedAssignment: boolean;
  clearedOwner: boolean;
}

function normalizeIpAddress(ipAddress: string): string {
  return normalizeCanonicalIpv4(ipAddress);
}

function parseProviderImportDate(value?: string | Date | null): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    const whole = Math.floor(serial);
    if (Number.isFinite(serial) && whole >= 32874 && whole <= 73415) {
      const utc = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!Number.isNaN(utc.getTime())) {
        return new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()));
      }
    }
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[tT\s](.+))?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const timePart = isoMatch[4]?.trim();
    if (!timePart || /^00:00:00(\.0+)?(z|[+-]00:00)?$/i.test(timePart)) {
      const date = new Date(Date.UTC(year, month, day));
      if (
        !Number.isNaN(date.getTime()) &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month &&
        date.getUTCDate() === day
      ) {
        return date;
      }
    } else {
      const parsedIso = new Date(trimmed);
      if (!Number.isNaN(parsedIso.getTime())) {
        const utcHours =
          parsedIso.getUTCHours() +
          parsedIso.getUTCMinutes() / 60 +
          parsedIso.getUTCSeconds() / 3600;
        if (utcHours >= 0.001) {
          const shifted = new Date(parsedIso.getTime() + 12 * 60 * 60 * 1000);
          return new Date(
            Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
          );
        }
        return new Date(
          Date.UTC(parsedIso.getUTCFullYear(), parsedIso.getUTCMonth(), parsedIso.getUTCDate())
        );
      }
    }
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[/.\\-](\d{1,2})[/.\\-](\d{2,4})$/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const yearRaw = dmyMatch[3];
    const year =
      yearRaw.length === 2
        ? Number(yearRaw) >= 70
          ? 1900 + Number(yearRaw)
          : 2000 + Number(yearRaw)
        : Number(yearRaw);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date;
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function inferExternalVmProtocol(row: VmProviderMetadataImportRow): 'rdp' | 'ssh' | 'vnc' {
  if (row.protocol === 'rdp' || row.protocol === 'ssh' || row.protocol === 'vnc') {
    return row.protocol;
  }

  const username = row.username?.trim().toLowerCase();
  if (username === 'root' || username === 'ubuntu' || username === 'ec2-user' || username === 'admin') {
    return 'ssh';
  }

  return 'rdp';
}

function toObjectId(id?: string): mongoose.Types.ObjectId | undefined {
  if (!id) return undefined;
  if (!mongoose.isValidObjectId(id)) return undefined;
  return new mongoose.Types.ObjectId(id);
}

function normalizeVmStatus(status: string): InventoryStatus {
  if (status === 'running') return 'active';
  if (status === 'stopped' || status === 'paused' || status === 'suspended') return 'suspended';
  if (status === 'error' || status === 'delete_failed') return 'failed';
  if (status === 'deleting' || status === 'deleted') return 'deleted';
  return 'provisioning';
}

function normalizeCatalogStatus(status: string): InventoryStatus {
  if (status === 'active') return 'active';
  if (status === 'suspended') return 'suspended';
  if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'failed';
  if (status === 'terminated') return 'deleted';
  return 'provisioning';
}

function externalSourceToChannel(source: ExternalVMSource): InventoryOriginChannel {
  if (source === 'tenant_import') return 'external_tenant_import';
  if (source === 'superadmin_bulk') return 'external_superadmin_bulk';
  return 'external_admin_import';
}

function hasInventoryAssignee(item: VmInventoryRecord): boolean {
  return (
    item.mappedAssignments.length > 0 ||
    item.mappedUsers.length > 0 ||
    Boolean(item.mappedTenantUserId || item.mappedTenantUserEmail)
  );
}

function hasKnownInventoryOwner(item: VmInventoryRecord): boolean {
  return Boolean(
    item.ownerTenantName ||
    item.ownerTenantId ||
    item.ownerAdminEmail ||
    item.ownerAdminId
  );
}

function effectiveOwnerLabel(item: VmInventoryRecord): string {
  if (!hasKnownInventoryOwner(item) && !hasInventoryAssignee(item)) return 'Unassigned';

  if (item.ownerScope === 'tenant') {
    return item.ownerTenantName || item.ownerTenantId || 'Unknown tenant';
  }

  return item.ownerAdminEmail || item.ownerAdminId || 'Unknown admin';
}

export class SuperAdminVmInventoryService {
  private async resolveAssignedUsersForInventoryRow(input: SuperAdminVmInventoryClearAssignmentInput): Promise<{
    found: boolean;
    platformUserIds: string[];
    tenantUserIds: string[];
  }> {
    if (input.resourceType === 'platform_vm') {
      const vm = await VM.findById(toObjectId(input.sourceId)).select('assignedTo assignedTenantUserId');
      if (!vm) return { found: false, platformUserIds: [], tenantUserIds: [] };
      return {
        found: true,
        platformUserIds: vm.assignedTo ? [vm.assignedTo.toString()] : [],
        tenantUserIds: vm.assignedTenantUserId ? [vm.assignedTenantUserId.toString()] : [],
      };
    }

    if (input.resourceType === 'catalog_vm') {
      const vm = await CatalogVmModel.findById(toObjectId(input.sourceId)).select('tenantUserId');
      if (!vm) return { found: false, platformUserIds: [], tenantUserIds: [] };
      return {
        found: true,
        platformUserIds: [],
        tenantUserIds: vm.tenantUserId ? [vm.tenantUserId.toString()] : [],
      };
    }

    const externalVmId = toObjectId(input.sourceId);
    const externalVm = await ExternalVMModel.findById(externalVmId).select('assignedTo assignedTenantUserId');
    if (!externalVm || !externalVmId) {
      return { found: false, platformUserIds: [], tenantUserIds: [] };
    }

    const [platformAssignments, tenantAssignments] = await Promise.all([
      ExternalVmUserAssignmentModel.find({ externalVmId }).select('userId').lean(),
      ExternalVmTenantAssignmentModel.find({ externalVmId }).select('tenantUserId').lean(),
    ]);

    const platformUserIds = [
      ...(externalVm.assignedTo ? [externalVm.assignedTo.toString()] : []),
      ...platformAssignments.map((a) => a.userId.toString()),
    ];
    const tenantUserIds = [
      ...(externalVm.assignedTenantUserId ? [externalVm.assignedTenantUserId.toString()] : []),
      ...tenantAssignments.map((a) => a.tenantUserId.toString()),
    ];

    return {
      found: true,
      platformUserIds: [...new Set(platformUserIds)],
      tenantUserIds: [...new Set(tenantUserIds)],
    };
  }

  /**
   * Remove all end-user assignment state from a single inventory resource (VM stays with owner).
   * Clears junction rows, legacy assignee columns, and access schedules on the resource.
   */
  private async clearResourceAssignmentsForInventoryRow(
    input: SuperAdminVmInventoryClearAssignmentInput
  ): Promise<{
    found: boolean;
    updated: boolean;
    affectedPlatformUserIds: string[];
    affectedTenantUserIds: string[];
  }> {
    const sourceObjectId = toObjectId(input.sourceId);
    if (!sourceObjectId) {
      return {
        found: false,
        updated: false,
        affectedPlatformUserIds: [],
        affectedTenantUserIds: [],
      };
    }

    const affectedPlatformUserIds: string[] = [];
    const affectedTenantUserIds: string[] = [];

    if (input.resourceType === 'platform_vm') {
      const vm = await VM.findById(sourceObjectId);
      if (!vm) {
        return {
          found: false,
          updated: false,
          affectedPlatformUserIds: [],
          affectedTenantUserIds: [],
        };
      }

      const hasAssignment = Boolean(vm.assignedTo || vm.assignedTenantUserId);
      if (!hasAssignment) {
        return {
          found: true,
          updated: false,
          affectedPlatformUserIds: [],
          affectedTenantUserIds: [],
        };
      }

      if (vm.assignedTo) affectedPlatformUserIds.push(vm.assignedTo.toString());
      if (vm.assignedTenantUserId) affectedTenantUserIds.push(vm.assignedTenantUserId.toString());

      vm.assignedTo = undefined;
      vm.assignedTenantUserId = undefined;
      vm.accessStartDate = null;
      vm.accessEndDate = null;
      vm.accessStartTime = null;
      vm.accessEndTime = null;
      vm.weeklySchedule = null;
      await vm.save();

      return {
        found: true,
        updated: true,
        affectedPlatformUserIds,
        affectedTenantUserIds,
      };
    }

    if (input.resourceType === 'catalog_vm') {
      const vm = await CatalogVmModel.findById(sourceObjectId);
      if (!vm) {
        return {
          found: false,
          updated: false,
          affectedPlatformUserIds: [],
          affectedTenantUserIds: [],
        };
      }
      if (!vm.tenantUserId) {
        return {
          found: true,
          updated: false,
          affectedPlatformUserIds: [],
          affectedTenantUserIds: [],
        };
      }

      affectedTenantUserIds.push(vm.tenantUserId.toString());
      vm.tenantUserId = undefined;
      await vm.save();

      return {
        found: true,
        updated: true,
        affectedPlatformUserIds,
        affectedTenantUserIds,
      };
    }

    const externalVm = await ExternalVMModel.findById(sourceObjectId);
    if (!externalVm) {
      return {
        found: false,
        updated: false,
        affectedPlatformUserIds: [],
        affectedTenantUserIds: [],
      };
    }

    if (externalVm.assignedTo) affectedPlatformUserIds.push(externalVm.assignedTo.toString());
    if (externalVm.assignedTenantUserId) {
      affectedTenantUserIds.push(externalVm.assignedTenantUserId.toString());
    }

    const [linkedPlatformAssignments, linkedTenantAssignments] = await Promise.all([
      ExternalVmUserAssignmentModel.find({ externalVmId: sourceObjectId }).select('_id userId').lean(),
      ExternalVmTenantAssignmentModel.find({ externalVmId: sourceObjectId })
        .select('_id tenantUserId')
        .lean(),
    ]);

    for (const assignment of linkedPlatformAssignments) {
      cancelExternalAssignmentTimer(assignment._id.toString(), 'platform');
      affectedPlatformUserIds.push(assignment.userId.toString());
    }
    for (const assignment of linkedTenantAssignments) {
      cancelExternalAssignmentTimer(assignment._id.toString(), 'tenant');
      affectedTenantUserIds.push(assignment.tenantUserId.toString());
    }

    const [platformAssignments, tenantAssignments] = await Promise.all([
      ExternalVmUserAssignmentModel.deleteMany({ externalVmId: sourceObjectId }),
      ExternalVmTenantAssignmentModel.deleteMany({ externalVmId: sourceObjectId }),
    ]);

    const hadLegacyAssignment = Boolean(externalVm.assignedTo || externalVm.assignedTenantUserId);
    const hadAssignments =
      hadLegacyAssignment || platformAssignments.deletedCount > 0 || tenantAssignments.deletedCount > 0;

    if (!hadAssignments) {
      return {
        found: true,
        updated: false,
        affectedPlatformUserIds: [...new Set(affectedPlatformUserIds)],
        affectedTenantUserIds: [...new Set(affectedTenantUserIds)],
      };
    }

    externalVm.assignedTo = undefined;
    externalVm.assignedTenantUserId = undefined;
    externalVm.accessStartDate = null;
    externalVm.accessEndDate = null;
    externalVm.accessStartTime = null;
    externalVm.accessEndTime = null;
    externalVm.weeklySchedule = null;
    await externalVm.save();

    return {
      found: true,
      updated: true,
      affectedPlatformUserIds: [...new Set(affectedPlatformUserIds)],
      affectedTenantUserIds: [...new Set(affectedTenantUserIds)],
    };
  }

  private async forceDeletePlatformUsers(userIds: string[]): Promise<number> {
    let deletedPlatformUsers = 0;

    for (const userId of [...new Set(userIds.filter(Boolean))]) {
      const oid = toObjectId(userId);
      if (!oid) continue;

      const user = await User.findById(oid);
      if (!user || user.role !== 'user') continue;

      await Promise.all([
        VM.updateMany({ assignedTo: oid }, { $unset: { assignedTo: 1 } }),
        ExternalVMModel.updateMany({ assignedTo: oid }, { $unset: { assignedTo: 1 } }),
        ExternalVmUserAssignmentModel.deleteMany({ userId: oid }),
      ]);

      await user.deleteOne();
      deletedPlatformUsers += 1;
    }

    return deletedPlatformUsers;
  }

  private async forceDeleteTenantUsers(tenantUserIds: string[]): Promise<number> {
    let deletedTenantUsers = 0;

    for (const tenantUserId of [...new Set(tenantUserIds.filter(Boolean))]) {
      const oid = toObjectId(tenantUserId);
      if (!oid) continue;

      const tenantUser = await TenantUser.findById(oid);
      if (!tenantUser || tenantUser.role !== 'tenant_user') continue;

      await Promise.all([
        VM.updateMany({ assignedTenantUserId: oid }, { $unset: { assignedTenantUserId: 1 } }),
        CatalogVmModel.updateMany({ tenantUserId: oid }, { $unset: { tenantUserId: 1 } }),
        ExternalVMModel.updateMany({ assignedTenantUserId: oid }, { $unset: { assignedTenantUserId: 1 } }),
        ExternalVmTenantAssignmentModel.deleteMany({ tenantUserId: oid }),
      ]);

      await tenantUser.deleteOne();
      deletedTenantUsers += 1;
    }

    return deletedTenantUsers;
  }

  /**
   * Detach a VM from tenant/admin ownership so it returns to the free pool.
   * External VMs become owner-less (available for future tenant attach).
   * Platform VPS clears tenant/order/project links but keeps adminId (schema-required).
   */
  private async clearResourceOwnerForInventoryRow(
    input: SuperAdminVmInventoryClearAssignmentInput
  ): Promise<{ found: boolean; updated: boolean }> {
    const sourceObjectId = toObjectId(input.sourceId);
    if (!sourceObjectId) {
      return { found: false, updated: false };
    }

    if (input.resourceType === 'platform_vm') {
      const vm = await VM.findById(sourceObjectId);
      if (!vm) {
        return { found: false, updated: false };
      }

      const hadTenantLink = Boolean(vm.tenantId || vm.projectId || vm.orderId);
      if (!hadTenantLink) {
        return { found: true, updated: false };
      }

      vm.tenantId = null;
      vm.orderId = null;
      vm.projectId = undefined;
      await vm.save();
      return { found: true, updated: true };
    }

    if (input.resourceType === 'catalog_vm') {
      const vm = await CatalogVmModel.findById(sourceObjectId);
      if (!vm) {
        return { found: false, updated: false };
      }

      const hadOwner = Boolean(vm.tenantId || vm.adminId || vm.projectId);
      if (!hadOwner) {
        return { found: true, updated: false };
      }

      vm.tenantId = undefined;
      vm.adminId = undefined;
      vm.projectId = undefined;
      await vm.save();
      return { found: true, updated: true };
    }

    const externalVm = await ExternalVMModel.findById(sourceObjectId);
    if (!externalVm) {
      return { found: false, updated: false };
    }

    const hadOwner = Boolean(
      externalVm.tenantId ||
      externalVm.adminId ||
      externalVm.projectId ||
      externalVm.createdByTenantUserId
    );
    if (!hadOwner) {
      return { found: true, updated: false };
    }

    await ExternalVMModel.updateOne(
      { _id: sourceObjectId },
      {
        $unset: {
          tenantId: 1,
          adminId: 1,
          projectId: 1,
          createdByTenantUserId: 1,
        },
        $set: {
          source: 'superadmin_bulk' as ExternalVMSource,
          updatedAt: new Date(),
        },
      }
    );
    return { found: true, updated: true };
  }

  /**
   * Strip the client-assigned display name when returning a VM to the free pool.
   * External VM `name` is a required label, so it falls back to the IP address.
   */
  private async resetResourceDisplayNameForInventoryRow(
    input: SuperAdminVmInventoryClearAssignmentInput
  ): Promise<{ found: boolean; updated: boolean }> {
    const sourceObjectId = toObjectId(input.sourceId);
    if (!sourceObjectId) {
      return { found: false, updated: false };
    }

    if (input.resourceType !== 'external_vm') {
      return { found: true, updated: false };
    }

    const externalVm = await ExternalVMModel.findById(sourceObjectId).select('name ipAddress');
    if (!externalVm) {
      return { found: false, updated: false };
    }

    const nextName = externalVm.ipAddress?.trim() || 'Unassigned VM';
    if (externalVm.name?.trim() === nextName) {
      return { found: true, updated: false };
    }

    await ExternalVMModel.updateOne(
      { _id: sourceObjectId },
      {
        $set: {
          name: nextName,
          updatedAt: new Date(),
        },
      }
    );
    return { found: true, updated: true };
  }

  async deleteAssignedUser(
    input: SuperAdminVmInventoryClearAssignmentInput
  ): Promise<SuperAdminVmInventoryDeleteAssignedUserResult> {
    const resolved = await this.resolveAssignedUsersForInventoryRow(input);
    const cleared = await this.clearResourceAssignmentsForInventoryRow(input);

    if (!resolved.found && !cleared.found) {
      return { updated: false, deletedPlatformUsers: 0, deletedTenantUsers: 0 };
    }

    const platformUserIds = [
      ...new Set([...resolved.platformUserIds, ...cleared.affectedPlatformUserIds]),
    ];
    const tenantUserIds = [
      ...new Set([...resolved.tenantUserIds, ...cleared.affectedTenantUserIds]),
    ];

    const [deletedPlatformUsers, deletedTenantUsers] = await Promise.all([
      this.forceDeletePlatformUsers(platformUserIds),
      this.forceDeleteTenantUsers(tenantUserIds),
    ]);

    const updated =
      cleared.updated || deletedPlatformUsers > 0 || deletedTenantUsers > 0;
    return { updated, deletedPlatformUsers, deletedTenantUsers };
  }

  async freeVmAndDeleteAssignedUser(
    input: SuperAdminVmInventoryClearAssignmentInput
  ): Promise<SuperAdminVmInventoryFreeVmResult> {
    const resolved = await this.resolveAssignedUsersForInventoryRow(input);
    const cleared = await this.clearResourceAssignmentsForInventoryRow(input);
    const ownerCleared = await this.clearResourceOwnerForInventoryRow(input);
    const nameReset = await this.resetResourceDisplayNameForInventoryRow(input);

    if (!resolved.found && !cleared.found && !ownerCleared.found && !nameReset.found) {
      return {
        updated: false,
        deletedPlatformUsers: 0,
        deletedTenantUsers: 0,
        clearedAssignment: false,
        clearedOwner: false,
      };
    }

    const platformUserIds = [
      ...new Set([...resolved.platformUserIds, ...cleared.affectedPlatformUserIds]),
    ];
    const tenantUserIds = [
      ...new Set([...resolved.tenantUserIds, ...cleared.affectedTenantUserIds]),
    ];

    const [deletedPlatformUsers, deletedTenantUsers] = await Promise.all([
      this.forceDeletePlatformUsers(platformUserIds),
      this.forceDeleteTenantUsers(tenantUserIds),
    ]);

    const updated =
      cleared.updated ||
      ownerCleared.updated ||
      nameReset.updated ||
      deletedPlatformUsers > 0 ||
      deletedTenantUsers > 0;

    return {
      updated,
      deletedPlatformUsers,
      deletedTenantUsers,
      clearedAssignment: cleared.updated,
      clearedOwner: ownerCleared.updated,
    };
  }

  private async deletePlatformUsersIfDetached(userIds: string[]): Promise<number> {
    let deleted = 0;
    const uniqueIds = [...new Set(userIds.filter(Boolean))];

    for (const userId of uniqueIds) {
      const oid = toObjectId(userId);
      if (!oid) continue;

      const [hasVmAssignment, hasExternalLegacyAssignment, hasExternalJunctionAssignment] = await Promise.all([
        VM.exists({ assignedTo: oid }),
        ExternalVMModel.exists({ assignedTo: oid }),
        ExternalVmUserAssignmentModel.exists({ userId: oid }),
      ]);
      if (hasVmAssignment || hasExternalLegacyAssignment || hasExternalJunctionAssignment) {
        continue;
      }

      const user = await User.findById(oid);
      if (!user || user.role !== 'user') continue;
      await user.deleteOne();
      deleted += 1;
    }

    return deleted;
  }

  private async deleteTenantUsersIfDetached(tenantUserIds: string[]): Promise<number> {
    let deleted = 0;
    const uniqueIds = [...new Set(tenantUserIds.filter(Boolean))];

    for (const tenantUserId of uniqueIds) {
      const oid = toObjectId(tenantUserId);
      if (!oid) continue;

      const [hasVmAssignment, hasCatalogAssignment, hasExternalLegacyAssignment, hasExternalJunctionAssignment] = await Promise.all([
        VM.exists({ assignedTenantUserId: oid }),
        CatalogVmModel.exists({ tenantUserId: oid }),
        ExternalVMModel.exists({ assignedTenantUserId: oid }),
        ExternalVmTenantAssignmentModel.exists({ tenantUserId: oid }),
      ]);
      if (hasVmAssignment || hasCatalogAssignment || hasExternalLegacyAssignment || hasExternalJunctionAssignment) {
        continue;
      }

      const tenantUser = await TenantUser.findById(oid);
      if (!tenantUser || tenantUser.role !== 'tenant_user') continue;
      await tenantUser.deleteOne();
      deleted += 1;
    }

    return deleted;
  }

  async clearAssignment(
    input: SuperAdminVmInventoryClearAssignmentInput
  ): Promise<SuperAdminVmInventoryClearAssignmentResult> {
    const cleared = await this.clearResourceAssignmentsForInventoryRow(input);
    if (!cleared.found) return { updated: false };
    if (!cleared.updated) return { updated: false };

    const [deletedPlatformUsers, deletedTenantUsers] = await Promise.all([
      this.deletePlatformUsersIfDetached(cleared.affectedPlatformUserIds),
      this.deleteTenantUsersIfDetached(cleared.affectedTenantUserIds),
    ]);

    return { updated: true, deletedPlatformUsers, deletedTenantUsers };
  }

  async listInventory(filters: SuperAdminVmInventoryFilters): Promise<SuperAdminVmInventoryListResult> {
    const page = Math.max(1, Number(filters.page ?? 1));
    const limit = Math.min(5000, Math.max(1, Number(filters.limit ?? 25)));
    const sortDirection = filters.sortDirection === 'asc' ? 1 : -1;

    const tenantObjectId = toObjectId(filters.tenantId);
    const adminObjectId = toObjectId(filters.adminId);
    const projectObjectId = toObjectId(filters.projectId);

    const createdAtRange: { $gte?: Date; $lte?: Date } = {};
    if (filters.createdFrom) createdAtRange.$gte = new Date(filters.createdFrom);
    if (filters.createdTo) createdAtRange.$lte = new Date(filters.createdTo);
    const hasCreatedRange = Boolean(createdAtRange.$gte || createdAtRange.$lte);

    const vmQuery: Record<string, unknown> = {};
    if (tenantObjectId) vmQuery['tenantId'] = tenantObjectId;
    if (adminObjectId) vmQuery['adminId'] = adminObjectId;
    if (projectObjectId) vmQuery['projectId'] = projectObjectId;
    if (hasCreatedRange) vmQuery['createdAt'] = createdAtRange;
    if (filters.search) {
      vmQuery['$or'] = [
        { name: { $regex: filters.search, $options: 'i' } },
        { ipAddress: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const catalogQuery: Record<string, unknown> = {};
    // Inventory should only include catalog VMs that are attached and active.
    catalogQuery['status'] = 'active';
    catalogQuery['attachedAt'] = { $ne: null };
    if (tenantObjectId) catalogQuery['tenantId'] = tenantObjectId;
    if (adminObjectId) catalogQuery['adminId'] = adminObjectId;
    if (projectObjectId) catalogQuery['projectId'] = projectObjectId;
    if (hasCreatedRange) catalogQuery['createdAt'] = createdAtRange;
    if (filters.search) {
      catalogQuery['$or'] = [
        { hostname: { $regex: filters.search, $options: 'i' } },
        { planName: { $regex: filters.search, $options: 'i' } },
        { ipAddress: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const externalQuery: Record<string, unknown> = {};
    if (tenantObjectId) externalQuery['tenantId'] = tenantObjectId;
    if (adminObjectId) externalQuery['adminId'] = adminObjectId;
    if (projectObjectId) externalQuery['projectId'] = projectObjectId;
    if (hasCreatedRange) externalQuery['createdAt'] = createdAtRange;
    if (filters.search) {
      externalQuery['$or'] = [
        { name: { $regex: filters.search, $options: 'i' } },
        { ipAddress: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [platformVms, catalogVms, externalVms] = await Promise.all([
      filters.resourceType && filters.resourceType !== 'platform_vm'
        ? Promise.resolve([])
        : VM.find(vmQuery)
          .select(
            '_id vmid name ipAddress consoleProtocol status adminId tenantId assignedTo assignedTenantUserId projectId orderId isVmClone accessStartDate accessEndDate createdAt updatedAt'
          )
          .lean(),
      filters.resourceType && filters.resourceType !== 'catalog_vm'
        ? Promise.resolve([])
        : CatalogVmModel.find(catalogQuery)
          .select(
            '_id hostname planName ipAddress protocol username password status adminId tenantId tenantUserId projectId autoProvisioned attachedAt expiresAt createdAt updatedAt'
          )
          .lean(),
      filters.resourceType && filters.resourceType !== 'external_vm'
        ? Promise.resolve([])
        : ExternalVMModel.find(externalQuery)
          .select(
            '_id name ipAddress protocol source adminId tenantId assignedTo assignedTenantUserId projectId accessStartDate accessEndDate createdAt updatedAt'
          )
          .lean(),
    ]);

    const catalogVmIds = catalogVms.map((vm) => vm._id);
    const catalogInstances =
      catalogVmIds.length > 0
        ? await CatalogVmInstanceModel.find({
            catalogVmId: { $in: catalogVmIds },
            status: 'active',
          })
            .select(
              '_id catalogVmId instanceOrder hostname ipAddress username password protocol status createdAt updatedAt'
            )
            .sort({ instanceOrder: 1, createdAt: 1 })
            .lean()
        : [];
    const catalogInstancesByVmId = new Map<string, typeof catalogInstances>();
    for (const row of catalogInstances) {
      const key = row.catalogVmId.toString();
      const list = catalogInstancesByVmId.get(key) ?? [];
      list.push(row);
      catalogInstancesByVmId.set(key, list);
    }

    const externalVmIds = externalVms.map((vm) => vm._id);
    const [externalUserAssignments, externalTenantAssignments] = await Promise.all([
      externalVmIds.length > 0
        ? ExternalVmUserAssignmentModel.find({
          externalVmId: { $in: externalVmIds },
          status: 'active',
        })
          .select('externalVmId userId schedule')
          .lean()
        : Promise.resolve([]),
      externalVmIds.length > 0
        ? ExternalVmTenantAssignmentModel.find({
          externalVmId: { $in: externalVmIds },
          status: 'active',
        })
          .select('externalVmId tenantUserId schedule')
          .lean()
        : Promise.resolve([]),
    ]);

    const ipAddresses = [...new Set([
      ...platformVms.map((vm) => vm.ipAddress).filter((value): value is string => Boolean(value?.trim())),
      ...catalogVms.map((vm) => vm.ipAddress).filter((value): value is string => Boolean(value?.trim())),
      ...catalogInstances.map((vm) => vm.ipAddress).filter((value): value is string => Boolean(value?.trim())),
      ...externalVms.map((vm) => vm.ipAddress).filter((value): value is string => Boolean(value?.trim())),
    ].map((ip) => normalizeIpAddress(ip)))];

    const providerMetadata = ipAddresses.length > 0
      ? await VmProviderMetadataModel.find({ ipAddress: { $in: ipAddresses } })
        .select('ipAddress vmSpec planDuration providerUsername providerPassword providerStartDate providerEndDate')
        .lean()
      : [];
    const providerMetadataByIp = new Map(
      providerMetadata.map((item) => [normalizeIpAddress(item.ipAddress), item])
    );

    const providerPasswordByIp = new Map<string, string | null>();
    for (const item of providerMetadata) {
      const ip = normalizeIpAddress(item.ipAddress);
      if (!item.providerPassword) {
        providerPasswordByIp.set(ip, null);
        continue;
      }
      try {
        providerPasswordByIp.set(ip, decrypt(item.providerPassword));
      } catch {
        providerPasswordByIp.set(ip, null);
      }
    }

    const adminIds = new Set<string>();
    const tenantIds = new Set<string>();
    const userIds = new Set<string>();
    const tenantUserIds = new Set<string>();
    const projectIds = new Set<string>();

    for (const vm of platformVms) {
      if (vm.adminId) adminIds.add(vm.adminId.toString());
      if (vm.assignedTo) userIds.add(vm.assignedTo.toString());
      if (vm.tenantId) tenantIds.add(vm.tenantId.toString());
      if (vm.assignedTenantUserId) tenantUserIds.add(vm.assignedTenantUserId.toString());
      if (vm.projectId) projectIds.add(vm.projectId.toString());
    }
    for (const vm of catalogVms) {
      if (vm.adminId) adminIds.add(vm.adminId.toString());
      if (vm.tenantId) tenantIds.add(vm.tenantId.toString());
      if (vm.tenantUserId) tenantUserIds.add(vm.tenantUserId.toString());
      if (vm.projectId) projectIds.add(vm.projectId.toString());
    }
    for (const vm of externalVms) {
      if (vm.adminId) adminIds.add(vm.adminId.toString());
      if (vm.assignedTo) userIds.add(vm.assignedTo.toString());
      if (vm.tenantId) tenantIds.add(vm.tenantId.toString());
      if (vm.assignedTenantUserId) tenantUserIds.add(vm.assignedTenantUserId.toString());
      if (vm.projectId) projectIds.add(vm.projectId.toString());
    }
    for (const assignment of externalUserAssignments) {
      userIds.add(assignment.userId.toString());
    }
    for (const assignment of externalTenantAssignments) {
      tenantUserIds.add(assignment.tenantUserId.toString());
    }

    const [admins, users, tenants, tenantUsers, projects] = await Promise.all([
      adminIds.size > 0
        ? User.find({ _id: { $in: [...adminIds].map((id) => new mongoose.Types.ObjectId(id)) } })
          .select('_id email')
          .lean()
        : Promise.resolve([]),
      userIds.size > 0
        ? User.find({ _id: { $in: [...userIds].map((id) => new mongoose.Types.ObjectId(id)) } })
          .select('_id email')
          .lean()
        : Promise.resolve([]),
      tenantIds.size > 0
        ? Tenant.find({ _id: { $in: [...tenantIds].map((id) => new mongoose.Types.ObjectId(id)) } })
          .select('_id name')
          .lean()
        : Promise.resolve([]),
      tenantUserIds.size > 0
        ? TenantUser.find({ _id: { $in: [...tenantUserIds].map((id) => new mongoose.Types.ObjectId(id)) } })
          .select('_id email')
          .lean()
        : Promise.resolve([]),
      projectIds.size > 0
        ? ProjectModel.find({ _id: { $in: [...projectIds].map((id) => new mongoose.Types.ObjectId(id)) } })
          .select('_id name clientName')
          .lean()
        : Promise.resolve([]),
    ]);

    const adminEmailById = new Map(admins.map((item) => [item._id.toString(), item.email]));
    const userEmailById = new Map(users.map((item) => [item._id.toString(), item.email]));
    const tenantNameById = new Map(tenants.map((item) => [item._id.toString(), item.name]));
    const tenantUserEmailById = new Map(tenantUsers.map((item) => [item._id.toString(), item.email]));
    const projectNameById = new Map(projects.map((item) => [item._id.toString(), item.name]));
    const projectClientNameById = new Map(projects.map((item) => [item._id.toString(), item.clientName]));

    const externalUsersByVmId = new Map<string, string[]>();
    for (const assignment of externalUserAssignments) {
      const vmId = assignment.externalVmId.toString();
      const email = userEmailById.get(assignment.userId.toString());
      if (!email) continue;
      const list = externalUsersByVmId.get(vmId) ?? [];
      list.push(email);
      externalUsersByVmId.set(vmId, list);
    }

    const externalTenantUsersByVmId = new Map<string, string[]>();
    for (const assignment of externalTenantAssignments) {
      const vmId = assignment.externalVmId.toString();
      const email = tenantUserEmailById.get(assignment.tenantUserId.toString());
      if (!email) continue;
      const list = externalTenantUsersByVmId.get(vmId) ?? [];
      list.push(email);
      externalTenantUsersByVmId.set(vmId, list);
    }

    const items: VmInventoryRecord[] = [];

    for (const vm of platformVms) {
      const status = normalizeVmStatus(vm.status);
      const originChannel: InventoryOriginChannel =
        vm.orderId && vm.tenantId
          ? 'vps_tenant_order'
          : vm.isVmClone
            ? 'vps_clone'
            : 'vps_admin_create';
      const ownerScope: InventoryOwnerScope = vm.tenantId ? 'tenant' : 'admin';
      const ownerAdminId = vm.adminId?.toString();
      const ownerTenantId = vm.tenantId?.toString();
      const mappedTenantId = vm.tenantId?.toString();
      const mappedTenantUserId = vm.assignedTenantUserId?.toString();
      const projectId = vm.projectId?.toString();
      const mappedUsers = [
        vm.assignedTo ? userEmailById.get(vm.assignedTo.toString()) : undefined,
        mappedTenantUserId ? tenantUserEmailById.get(mappedTenantUserId) : undefined,
      ].filter((value): value is string => Boolean(value));
      const mappedAssignments: VmInventoryRecord['mappedAssignments'] = [];
      const providerMeta = vm.ipAddress ? providerMetadataByIp.get(normalizeIpAddress(vm.ipAddress)) : undefined;
      const providerPassword = vm.ipAddress
        ? providerPasswordByIp.get(normalizeIpAddress(vm.ipAddress)) ?? null
        : null;
      if (vm.assignedTo) {
        const username = userEmailById.get(vm.assignedTo.toString());
        if (username) {
          mappedAssignments.push({
            username,
            isTenantUser: false,
            tenantName: undefined,
            planDuration: providerMeta?.planDuration ?? null,
            vmUsername: providerMeta?.providerUsername ?? null,
            vmPassword: providerPassword,
            providerStartDate: providerMeta?.providerStartDate ?? null,
            providerEndDate: providerMeta?.providerEndDate ?? null,
            startDate: vm.accessStartDate ?? null,
            endDate: vm.accessEndDate ?? null,
          });
        }
      }
      if (mappedTenantUserId) {
        const username = tenantUserEmailById.get(mappedTenantUserId);
        if (username) {
          mappedAssignments.push({
            username,
            isTenantUser: true,
            tenantName: mappedTenantId ? tenantNameById.get(mappedTenantId) : undefined,
            planDuration: providerMeta?.planDuration ?? null,
            vmUsername: providerMeta?.providerUsername ?? null,
            vmPassword: providerPassword,
            providerStartDate: providerMeta?.providerStartDate ?? null,
            providerEndDate: providerMeta?.providerEndDate ?? null,
            startDate: vm.accessStartDate ?? null,
            endDate: vm.accessEndDate ?? null,
          });
        }
      }
      const assignmentLocation = mappedTenantId
        ? (tenantNameById.get(mappedTenantId) ?? 'Tenant')
        : (ownerAdminId ? adminEmailById.get(ownerAdminId) ?? 'Platform owner' : 'Unassigned');

      items.push({
        inventoryId: `platform_vm:${vm._id.toString()}`,
        resourceType: 'platform_vm',
        sourceCollection: 'vms',
        sourceId: vm._id.toString(),
        name: vm.name,
        ipAddress: vm.ipAddress,
        protocol: vm.consoleProtocol,
        status,
        originServiceKey: 'vm-management',
        originServiceLabel: 'VPS Hosting',
        originChannel,
        providerVmSpec: providerMeta?.vmSpec ?? null,
        ownerScope,
        ownerAdminId,
        ownerAdminEmail: ownerAdminId ? adminEmailById.get(ownerAdminId) : undefined,
        ownerTenantId,
        ownerTenantName: ownerTenantId ? tenantNameById.get(ownerTenantId) : undefined,
        mappedTenantId,
        mappedTenantName: mappedTenantId ? tenantNameById.get(mappedTenantId) : undefined,
        mappedTenantUserId,
        mappedTenantUserEmail: mappedTenantUserId
          ? tenantUserEmailById.get(mappedTenantUserId)
          : undefined,
        mappedAssignments,
        mappedUsers: [...new Set(mappedUsers)],
        assignmentLocation,
        projectId,
        projectName: projectId ? projectNameById.get(projectId) : undefined,
        projectClientName: projectId ? projectClientNameById.get(projectId) : undefined,
        orderId: vm.orderId?.toString(),
        vmid: vm.vmid,
        createdAt: vm.createdAt,
        updatedAt: vm.updatedAt,
      });
    }

    for (const vm of catalogVms) {
      const originChannel: InventoryOriginChannel = vm.autoProvisioned
        ? 'catalog_auto_provision'
        : vm.tenantId
          ? 'catalog_tenant_request'
          : 'catalog_admin_request';
      const ownerScope: InventoryOwnerScope = vm.tenantId ? 'tenant' : 'admin';
      const ownerAdminId = vm.adminId?.toString();
      const ownerTenantId = vm.tenantId?.toString();
      const mappedTenantId = vm.tenantId?.toString();
      const mappedTenantUserId = vm.tenantUserId?.toString();
      const projectId = vm.projectId?.toString();
      const mappedUsers = [
        mappedTenantUserId ? tenantUserEmailById.get(mappedTenantUserId) : undefined,
      ].filter((value): value is string => Boolean(value));
      const mappedAssignments: VmInventoryRecord['mappedAssignments'] = [];
      const catalogVmPassword = (() => {
        if (!vm.password) return null;
        try {
          return decrypt(vm.password);
        } catch {
          return null;
        }
      })();
      const baseProviderMeta = vm.ipAddress
        ? providerMetadataByIp.get(normalizeIpAddress(vm.ipAddress))
        : undefined;
      const baseProviderPassword = vm.ipAddress
        ? providerPasswordByIp.get(normalizeIpAddress(vm.ipAddress)) ?? null
        : null;
      const baseCatalogProviderStart = baseProviderMeta?.providerStartDate ?? null;
      const baseCatalogProviderEnd = baseProviderMeta?.providerEndDate ?? null;
      if (mappedTenantUserId) {
        const username = tenantUserEmailById.get(mappedTenantUserId);
        if (username) {
          mappedAssignments.push({
            username,
            isTenantUser: true,
            tenantName: mappedTenantId ? tenantNameById.get(mappedTenantId) : undefined,
            planDuration: baseProviderMeta?.planDuration ?? null,
            vmUsername: vm.username ?? baseProviderMeta?.providerUsername ?? null,
            vmPassword: catalogVmPassword ?? baseProviderPassword,
            providerStartDate: baseCatalogProviderStart,
            providerEndDate: baseCatalogProviderEnd,
            startDate: null,
            endDate: null,
          });
        }
      }
      const assignmentLocation = mappedTenantId
        ? (tenantNameById.get(mappedTenantId) ?? 'Tenant')
        : (ownerAdminId ? adminEmailById.get(ownerAdminId) ?? 'Platform owner' : 'Unassigned');

      const instanceRows = catalogInstancesByVmId.get(vm._id.toString()) ?? [];
      if (instanceRows.length === 0) {
        const status = normalizeCatalogStatus(vm.status);
        items.push({
          inventoryId: `catalog_vm:${vm._id.toString()}`,
          resourceType: 'catalog_vm',
          sourceCollection: 'catalog_vms',
          sourceId: vm._id.toString(),
          name: vm.hostname || vm.planName,
          ipAddress: vm.ipAddress,
          protocol: vm.protocol,
          status,
          originServiceKey: 'create-vm',
          originServiceLabel: 'VM Catalog',
          originChannel,
          providerVmSpec: baseProviderMeta?.vmSpec ?? null,
          providerPlanDuration: baseProviderMeta?.planDuration ?? null,
          providerUsername: vm.username ?? baseProviderMeta?.providerUsername ?? null,
          providerPassword: catalogVmPassword ?? baseProviderPassword,
          providerStartDate: baseCatalogProviderStart,
          providerEndDate: baseCatalogProviderEnd,
          ownerScope,
          ownerAdminId,
          ownerAdminEmail: ownerAdminId ? adminEmailById.get(ownerAdminId) : undefined,
          ownerTenantId,
          ownerTenantName: ownerTenantId ? tenantNameById.get(ownerTenantId) : undefined,
          mappedTenantId,
          mappedTenantName: mappedTenantId ? tenantNameById.get(mappedTenantId) : undefined,
          mappedTenantUserId,
          mappedTenantUserEmail: mappedTenantUserId
            ? tenantUserEmailById.get(mappedTenantUserId)
            : undefined,
          mappedAssignments,
          mappedUsers: [...new Set(mappedUsers)],
          assignmentLocation,
          projectId,
          projectName: projectId ? projectNameById.get(projectId) : undefined,
          projectClientName: projectId ? projectClientNameById.get(projectId) : undefined,
          createdAt: vm.createdAt,
          updatedAt: vm.updatedAt,
        });
        continue;
      }

      for (const instance of instanceRows) {
        const instanceIp = instance.ipAddress?.trim();
        const instancePassword = (() => {
          if (!instance.password) return null;
          try {
            return decrypt(instance.password);
          } catch {
            return null;
          }
        })();
        const providerMeta = instanceIp
          ? providerMetadataByIp.get(normalizeIpAddress(instanceIp))
          : baseProviderMeta;
        const providerPassword = instanceIp
          ? providerPasswordByIp.get(normalizeIpAddress(instanceIp)) ?? null
          : baseProviderPassword;
        const status = instance.status === 'active'
          ? 'active'
          : normalizeCatalogStatus(vm.status);

        items.push({
          inventoryId: `catalog_vm:${vm._id.toString()}:${instance._id.toString()}`,
          resourceType: 'catalog_vm',
          sourceCollection: 'catalog_vms',
          sourceId: vm._id.toString(),
          name: instance.hostname || vm.hostname || `${vm.planName} #${instance.instanceOrder}`,
          ipAddress: instance.ipAddress || vm.ipAddress,
          protocol: instance.protocol || vm.protocol,
          status,
          originServiceKey: 'create-vm',
          originServiceLabel: 'VM Catalog',
          originChannel,
          providerVmSpec: providerMeta?.vmSpec ?? baseProviderMeta?.vmSpec ?? null,
          providerPlanDuration: providerMeta?.planDuration ?? baseProviderMeta?.planDuration ?? null,
          providerUsername:
            instance.username ?? vm.username ?? providerMeta?.providerUsername ?? baseProviderMeta?.providerUsername ?? null,
          providerPassword: instancePassword ?? catalogVmPassword ?? providerPassword,
          providerStartDate:
            providerMeta?.providerStartDate ?? baseCatalogProviderStart,
          providerEndDate:
            providerMeta?.providerEndDate ?? baseCatalogProviderEnd,
          ownerScope,
          ownerAdminId,
          ownerAdminEmail: ownerAdminId ? adminEmailById.get(ownerAdminId) : undefined,
          ownerTenantId,
          ownerTenantName: ownerTenantId ? tenantNameById.get(ownerTenantId) : undefined,
          mappedTenantId,
          mappedTenantName: mappedTenantId ? tenantNameById.get(mappedTenantId) : undefined,
          mappedTenantUserId,
          mappedTenantUserEmail: mappedTenantUserId
            ? tenantUserEmailById.get(mappedTenantUserId)
            : undefined,
          mappedAssignments: mappedAssignments.map((assignment) => ({
            ...assignment,
            planDuration: providerMeta?.planDuration ?? assignment.planDuration ?? null,
            vmUsername:
              instance.username ?? vm.username ?? providerMeta?.providerUsername ?? assignment.vmUsername ?? null,
            vmPassword: instancePassword ?? catalogVmPassword ?? providerPassword ?? assignment.vmPassword ?? null,
            providerStartDate:
              providerMeta?.providerStartDate ?? assignment.providerStartDate ?? null,
            providerEndDate:
              providerMeta?.providerEndDate ?? assignment.providerEndDate ?? null,
          })),
          mappedUsers: [...new Set(mappedUsers)],
          assignmentLocation,
          projectId,
          projectName: projectId ? projectNameById.get(projectId) : undefined,
          projectClientName: projectId ? projectClientNameById.get(projectId) : undefined,
          createdAt: vm.createdAt,
          updatedAt: instance.updatedAt ?? vm.updatedAt,
        });
      }
    }

    for (const vm of externalVms) {
      const ownerScope: InventoryOwnerScope = vm.tenantId ? 'tenant' : 'admin';
      const ownerAdminId = vm.adminId?.toString();
      const ownerTenantId = vm.tenantId?.toString();
      const mappedTenantId = vm.tenantId?.toString();
      const mappedTenantUserId = vm.assignedTenantUserId?.toString();
      const projectId = vm.projectId?.toString();
      const vmId = vm._id.toString();
      const providerMeta = vm.ipAddress ? providerMetadataByIp.get(normalizeIpAddress(vm.ipAddress)) : undefined;
      const providerPassword = vm.ipAddress
        ? providerPasswordByIp.get(normalizeIpAddress(vm.ipAddress)) ?? null
        : null;
      const mappedUsers = [
        ...(externalUsersByVmId.get(vmId) ?? []),
        ...(externalTenantUsersByVmId.get(vmId) ?? []),
        vm.assignedTo ? userEmailById.get(vm.assignedTo.toString()) : undefined,
        mappedTenantUserId ? tenantUserEmailById.get(mappedTenantUserId) : undefined,
      ].filter((value): value is string => Boolean(value));

      const mappedAssignments: Array<{
        username: string;
        isTenantUser: boolean;
        tenantName?: string;
        planDuration?: ProviderPlanDuration | null;
        vmUsername?: string | null;
        vmPassword?: string | null;
        providerStartDate?: Date | null;
        providerEndDate?: Date | null;
        startDate?: Date | null;
        endDate?: Date | null;
      }> = [];

      for (const assignment of externalUserAssignments) {
        if (assignment.externalVmId.toString() !== vmId) continue;
        const username = userEmailById.get(assignment.userId.toString());
        if (!username) continue;
        mappedAssignments.push({
          username,
          isTenantUser: false,
          tenantName: undefined,
          planDuration: providerMeta?.planDuration ?? null,
          vmUsername: providerMeta?.providerUsername ?? null,
          vmPassword: providerPassword,
          providerStartDate: providerMeta?.providerStartDate ?? null,
          providerEndDate: providerMeta?.providerEndDate ?? null,
          startDate: assignment.schedule?.effectiveFrom ?? vm.accessStartDate ?? null,
          endDate: assignment.schedule?.effectiveTo ?? vm.accessEndDate ?? null,
        });
      }

      for (const assignment of externalTenantAssignments) {
        if (assignment.externalVmId.toString() !== vmId) continue;
        const username = tenantUserEmailById.get(assignment.tenantUserId.toString());
        if (!username) continue;
        mappedAssignments.push({
          username,
          isTenantUser: true,
          tenantName: mappedTenantId ? tenantNameById.get(mappedTenantId) : undefined,
          planDuration: providerMeta?.planDuration ?? null,
          vmUsername: providerMeta?.providerUsername ?? null,
          vmPassword: providerPassword,
          providerStartDate: providerMeta?.providerStartDate ?? null,
          providerEndDate: providerMeta?.providerEndDate ?? null,
          startDate: assignment.schedule?.effectiveFrom ?? vm.accessStartDate ?? null,
          endDate: assignment.schedule?.effectiveTo ?? vm.accessEndDate ?? null,
        });
      }

      if (vm.assignedTo) {
        const username = userEmailById.get(vm.assignedTo.toString());
        if (username) {
          mappedAssignments.push({
            username,
            isTenantUser: false,
            tenantName: undefined,
            planDuration: providerMeta?.planDuration ?? null,
            vmUsername: providerMeta?.providerUsername ?? null,
            vmPassword: providerPassword,
            providerStartDate: providerMeta?.providerStartDate ?? null,
            providerEndDate: providerMeta?.providerEndDate ?? null,
            startDate: vm.accessStartDate ?? null,
            endDate: vm.accessEndDate ?? null,
          });
        }
      }
      if (mappedTenantUserId) {
        const username = tenantUserEmailById.get(mappedTenantUserId);
        if (username) {
          mappedAssignments.push({
            username,
            isTenantUser: true,
            tenantName: mappedTenantId ? tenantNameById.get(mappedTenantId) : undefined,
            planDuration: providerMeta?.planDuration ?? null,
            vmUsername: providerMeta?.providerUsername ?? null,
            vmPassword: providerPassword,
            providerStartDate: providerMeta?.providerStartDate ?? null,
            providerEndDate: providerMeta?.providerEndDate ?? null,
            startDate: vm.accessStartDate ?? null,
            endDate: vm.accessEndDate ?? null,
          });
        }
      }

      const uniqueAssignmentMap = new Map<string, {
        username: string;
        isTenantUser: boolean;
        tenantName?: string;
        planDuration?: ProviderPlanDuration | null;
        vmUsername?: string | null;
        vmPassword?: string | null;
        providerStartDate?: Date | null;
        providerEndDate?: Date | null;
        startDate?: Date | null;
        endDate?: Date | null;
      }>();
      for (const assignment of mappedAssignments) {
        const key = `${assignment.username}:${assignment.isTenantUser ? 'tenant' : 'platform'}`;
        if (!uniqueAssignmentMap.has(key)) {
          uniqueAssignmentMap.set(key, assignment);
        }
      }
      const assignmentLocation = mappedTenantId
        ? (tenantNameById.get(mappedTenantId) ?? 'Tenant')
        : (ownerAdminId ? adminEmailById.get(ownerAdminId) ?? 'Platform owner' : 'Unassigned');

      items.push({
        inventoryId: `external_vm:${vm._id.toString()}`,
        resourceType: 'external_vm',
        sourceCollection: 'external_vms',
        sourceId: vm._id.toString(),
        name: vm.name,
        ipAddress: vm.ipAddress,
        protocol: vm.protocol,
        status: 'active',
        originServiceKey: 'external-vm',
        originServiceLabel: 'External VM Import',
        originChannel: externalSourceToChannel(vm.source),
        providerVmSpec: providerMeta?.vmSpec ?? null,
        providerPlanDuration: providerMeta?.planDuration ?? null,
        providerUsername: providerMeta?.providerUsername ?? null,
        providerPassword,
        providerStartDate: providerMeta?.providerStartDate ?? null,
        providerEndDate: providerMeta?.providerEndDate ?? null,
        ownerScope,
        ownerAdminId,
        ownerAdminEmail: ownerAdminId ? adminEmailById.get(ownerAdminId) : undefined,
        ownerTenantId,
        ownerTenantName: ownerTenantId ? tenantNameById.get(ownerTenantId) : undefined,
        mappedTenantId,
        mappedTenantName: mappedTenantId ? tenantNameById.get(mappedTenantId) : undefined,
        mappedTenantUserId,
        mappedTenantUserEmail: mappedTenantUserId
          ? tenantUserEmailById.get(mappedTenantUserId)
          : undefined,
        mappedAssignments: [...uniqueAssignmentMap.values()],
        mappedUsers: [...new Set(mappedUsers)],
        assignmentLocation,
        projectId,
        projectName: projectId ? projectNameById.get(projectId) : undefined,
        projectClientName: projectId ? projectClientNameById.get(projectId) : undefined,
        createdAt: vm.createdAt,
        updatedAt: vm.updatedAt,
      });
    }

    const ownerSearch = filters.ownerSearch?.trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (filters.originServiceKey && item.originServiceKey !== filters.originServiceKey) {
        return false;
      }
      if (filters.ownerScope && item.ownerScope !== filters.ownerScope) {
        return false;
      }
      if (filters.status && item.status !== filters.status) {
        return false;
      }
      if (ownerSearch) {
        const ownerLabel = effectiveOwnerLabel(item).toLowerCase();
        if (!ownerLabel.includes(ownerSearch)) {
          return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (filters.sortBy === 'owner') {
        const aOwner = effectiveOwnerLabel(a).toLowerCase();
        const bOwner = effectiveOwnerLabel(b).toLowerCase();
        const ownerCompare = aOwner.localeCompare(bOwner);
        if (ownerCompare !== 0) {
          return ownerCompare * sortDirection;
        }
      }

      if (filters.sortBy === 'service') {
        const aService = a.originServiceLabel.toLowerCase();
        const bService = b.originServiceLabel.toLowerCase();
        const serviceCompare = aService.localeCompare(bService);
        if (serviceCompare !== 0) {
          return serviceCompare * sortDirection;
        }
      }

      return (a.createdAt.getTime() - b.createdAt.getTime()) * sortDirection;
    });

    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);
    const ownerCounts = new Map<string, number>();
    for (const item of filtered) {
      const label = effectiveOwnerLabel(item);
      ownerCounts.set(label, (ownerCounts.get(label) ?? 0) + 1);
    }

    return {
      items: paged,
      owners: [...ownerCounts.entries()].map(([label, count]) => ({ label, count })),
      total: filtered.length,
      page,
      limit,
    };
  }

  async listOwners(
    filters: Omit<SuperAdminVmInventoryFilters, 'ownerSearch' | 'page' | 'limit'>
  ): Promise<SuperAdminVmInventoryOwnerOption[]> {
    const result = await this.listInventory({
      ...filters,
      sortBy: 'owner',
      sortDirection: 'asc',
      page: 1,
      limit: 5000,
    });

    const counts = new Map<string, number>();
    for (const item of result.items) {
      const label = effectiveOwnerLabel(item);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    return [...counts.entries()].map(([label, count]) => ({ label, count }));
  }

  async importProviderMetadata(
    rows: VmProviderMetadataImportRow[],
    updatedByUserId: string
  ): Promise<VmProviderMetadataImportResult> {
    let updated = 0;
    let created = 0;

    const normalizedRows = rows
      .map((row) => ({
        ...row,
        ipAddress: normalizeIpAddress(row.ipAddress),
      }))
      .filter((row) => Boolean(row.ipAddress));

    const ipAddresses = [...new Set(normalizedRows.map((row) => row.ipAddress))];

    const [existingPlatformVms, existingCatalogVms, existingExternalVms, existingProviderMetadata] =
      await Promise.all([
      ipAddresses.length > 0
        ? VM.find({ ipAddress: { $in: ipAddresses } }).select('_id ipAddress').lean()
        : Promise.resolve([]),
      ipAddresses.length > 0
        ? CatalogVmModel.find({ ipAddress: { $in: ipAddresses } }).select('_id ipAddress').lean()
        : Promise.resolve([]),
      ExternalVMModel.find({}).select('_id ipAddress').lean(),
      VmProviderMetadataModel.find({}).select('_id ipAddress').lean(),
    ]);

    for (const doc of existingProviderMetadata) {
      const canonical = normalizeIpAddress(doc.ipAddress);
      if (!canonical || canonical === doc.ipAddress) continue;

      const duplicate = await VmProviderMetadataModel.findOne({ ipAddress: canonical }).select('_id').lean();
      if (duplicate) {
        await VmProviderMetadataModel.deleteOne({ _id: doc._id });
      } else {
        await VmProviderMetadataModel.updateOne({ _id: doc._id }, { $set: { ipAddress: canonical } });
      }
    }

    const ipAddressSet = new Set(ipAddresses);
    const existingIpAddresses = new Set<string>();

    for (const vm of existingPlatformVms) {
      if (!vm.ipAddress?.trim()) continue;
      existingIpAddresses.add(normalizeIpAddress(vm.ipAddress));
    }
    for (const vm of existingCatalogVms) {
      if (!vm.ipAddress?.trim()) continue;
      existingIpAddresses.add(normalizeIpAddress(vm.ipAddress));
    }
    for (const vm of existingExternalVms) {
      const canonical = normalizeIpAddress(vm.ipAddress);
      if (canonical && vm.ipAddress !== canonical) {
        await ExternalVMModel.updateOne({ _id: vm._id }, { $set: { ipAddress: canonical } });
      }
      if (ipAddressSet.has(canonical)) {
        existingIpAddresses.add(canonical);
      }
    }

    for (const row of normalizedRows) {
      const ipAddress = row.ipAddress;

      const set: Record<string, unknown> = {
        ipAddress,
        updatedBy: new mongoose.Types.ObjectId(updatedByUserId),
      };
      const vmSpec = row.vmSpec?.trim();
      if (vmSpec) set.vmSpec = vmSpec;
      if (row.planDuration) set.planDuration = row.planDuration;
      const username = row.username?.trim();
      if (username) set.providerUsername = username;
      if (row.password) set.providerPassword = encrypt(row.password);
      const providerStartDate = parseProviderImportDate(row.providerStartDate);
      if (providerStartDate) set.providerStartDate = providerStartDate;
      const providerEndDate = parseProviderImportDate(row.providerEndDate);
      if (providerEndDate) set.providerEndDate = providerEndDate;

      await VmProviderMetadataModel.findOneAndUpdate(
        { ipAddress },
        { $set: set },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      updated += 1;

      if (existingIpAddresses.has(ipAddress)) {
        continue;
      }

      const name = row.name?.trim() || ipAddress;
      const protocol = inferExternalVmProtocol(row);
      const password = row.password?.trim() || row.username?.trim() || ipAddress;

      await ExternalVMModel.create({
        name,
        ipAddress,
        protocol,
        username: row.username?.trim() || undefined,
        password: encrypt(password),
        source: 'superadmin_bulk',
      });
      existingIpAddresses.add(ipAddress);
      created += 1;
    }

    return {
      total: rows.length,
      updated,
      created,
    };
  }

  async updateProviderMetadata(
    row: VmProviderMetadataUpdateRow,
    updatedByUserId: string
  ): Promise<VmProviderMetadataUpdateResult> {
    const ipAddress = normalizeIpAddress(row.ipAddress);
    if (!ipAddress) {
      return { updated: false };
    }

    const set: Record<string, unknown> = {
      updatedBy: new mongoose.Types.ObjectId(updatedByUserId),
    };

    if (row.planDuration !== undefined) set['planDuration'] = row.planDuration ?? null;
    if (row.providerStartDate !== undefined) {
      const parsed = parseProviderImportDate(row.providerStartDate);
      set['providerStartDate'] = parsed ?? null;
    }
    if (row.providerEndDate !== undefined) {
      const parsed = parseProviderImportDate(row.providerEndDate);
      set['providerEndDate'] = parsed ?? null;
    }

    const result = await VmProviderMetadataModel.findOneAndUpdate(
      { ipAddress },
      {
        $set: set,
        $setOnInsert: { ipAddress },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { updated: Boolean(result) };
  }
}

export const superAdminVmInventoryService = new SuperAdminVmInventoryService();
