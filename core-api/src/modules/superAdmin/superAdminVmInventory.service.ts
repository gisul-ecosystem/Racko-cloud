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
  protocol?: 'rdp' | 'ssh';
  status: InventoryStatus;
  originServiceKey: 'vm-management' | 'create-vm' | 'external-vm';
  originServiceLabel: 'VPS Hosting' | 'VM Catalog' | 'External VM Import';
  originChannel: InventoryOriginChannel;
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
  protocol?: 'rdp' | 'ssh';
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

function normalizeIpAddress(ipAddress: string): string {
  return ipAddress.trim();
}

function inferExternalVmProtocol(row: VmProviderMetadataImportRow): 'rdp' | 'ssh' {
  if (row.protocol === 'rdp' || row.protocol === 'ssh') {
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

  async deleteAssignedUser(
    input: SuperAdminVmInventoryClearAssignmentInput
  ): Promise<SuperAdminVmInventoryDeleteAssignedUserResult> {
    const sourceObjectId = toObjectId(input.sourceId);
    if (!sourceObjectId) {
      return { updated: false, deletedPlatformUsers: 0, deletedTenantUsers: 0 };
    }

    const resolved = await this.resolveAssignedUsersForInventoryRow(input);
    if (!resolved.found) {
      return { updated: false, deletedPlatformUsers: 0, deletedTenantUsers: 0 };
    }

    let deletedPlatformUsers = 0;
    let deletedTenantUsers = 0;

    for (const userId of resolved.platformUserIds) {
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

    for (const tenantUserId of resolved.tenantUserIds) {
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

    const updated = deletedPlatformUsers > 0 || deletedTenantUsers > 0;
    return { updated, deletedPlatformUsers, deletedTenantUsers };
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
    const sourceObjectId = toObjectId(input.sourceId);
    if (!sourceObjectId) {
      return { updated: false };
    }

    const affectedPlatformUserIds: string[] = [];
    const affectedTenantUserIds: string[] = [];

    if (input.resourceType === 'platform_vm') {
      const vm = await VM.findById(sourceObjectId);
      if (!vm) return { updated: false };

      const hasAssignment = Boolean(vm.assignedTo || vm.assignedTenantUserId);
      if (!hasAssignment) return { updated: false };

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

      const [deletedPlatformUsers, deletedTenantUsers] = await Promise.all([
        this.deletePlatformUsersIfDetached(affectedPlatformUserIds),
        this.deleteTenantUsersIfDetached(affectedTenantUserIds),
      ]);

      return { updated: true, deletedPlatformUsers, deletedTenantUsers };
    }

    if (input.resourceType === 'catalog_vm') {
      const vm = await CatalogVmModel.findById(sourceObjectId);
      if (!vm) return { updated: false };
      if (!vm.tenantUserId) return { updated: false };

      affectedTenantUserIds.push(vm.tenantUserId.toString());

      vm.tenantUserId = undefined;
      await vm.save();

      const deletedTenantUsers = await this.deleteTenantUsersIfDetached(affectedTenantUserIds);
      return { updated: true, deletedPlatformUsers: 0, deletedTenantUsers };
    }

    const externalVm = await ExternalVMModel.findById(sourceObjectId);
    if (!externalVm) return { updated: false };

    if (externalVm.assignedTo) affectedPlatformUserIds.push(externalVm.assignedTo.toString());
    if (externalVm.assignedTenantUserId) {
      affectedTenantUserIds.push(externalVm.assignedTenantUserId.toString());
    }

    const [linkedPlatformAssignments, linkedTenantAssignments] = await Promise.all([
      ExternalVmUserAssignmentModel.find({ externalVmId: sourceObjectId }).select('userId').lean(),
      ExternalVmTenantAssignmentModel.find({ externalVmId: sourceObjectId }).select('tenantUserId').lean(),
    ]);
    for (const assignment of linkedPlatformAssignments) {
      affectedPlatformUserIds.push(assignment.userId.toString());
    }
    for (const assignment of linkedTenantAssignments) {
      affectedTenantUserIds.push(assignment.tenantUserId.toString());
    }

    const [platformAssignments, tenantAssignments] = await Promise.all([
      ExternalVmUserAssignmentModel.deleteMany({ externalVmId: sourceObjectId }),
      ExternalVmTenantAssignmentModel.deleteMany({ externalVmId: sourceObjectId }),
    ]);

    const hadLegacyAssignment = Boolean(externalVm.assignedTo || externalVm.assignedTenantUserId);
    const hadAssignments =
      hadLegacyAssignment || platformAssignments.deletedCount > 0 || tenantAssignments.deletedCount > 0;

    if (!hadAssignments) return { updated: false };

    externalVm.assignedTo = undefined;
    externalVm.assignedTenantUserId = undefined;
    externalVm.accessStartDate = null;
    externalVm.accessEndDate = null;
    externalVm.accessStartTime = null;
    externalVm.accessEndTime = null;
    externalVm.weeklySchedule = null;
    await externalVm.save();

    const [deletedPlatformUsers, deletedTenantUsers] = await Promise.all([
      this.deletePlatformUsersIfDetached(affectedPlatformUserIds),
      this.deleteTenantUsersIfDetached(affectedTenantUserIds),
    ]);

    return { updated: true, deletedPlatformUsers, deletedTenantUsers };
  }

  async listInventory(filters: SuperAdminVmInventoryFilters): Promise<SuperAdminVmInventoryListResult> {
    const page = Math.max(1, Number(filters.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(filters.limit ?? 25)));
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
        .select('ipAddress planDuration providerUsername providerPassword providerStartDate providerEndDate')
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

    return {
      items: paged,
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

    const [existingPlatformVms, existingCatalogVms, existingExternalVms] = await Promise.all([
      ipAddresses.length > 0
        ? VM.find({ ipAddress: { $in: ipAddresses } }).select('_id ipAddress').lean()
        : Promise.resolve([]),
      ipAddresses.length > 0
        ? CatalogVmModel.find({ ipAddress: { $in: ipAddresses } }).select('_id ipAddress').lean()
        : Promise.resolve([]),
      ipAddresses.length > 0
        ? ExternalVMModel.find({ ipAddress: { $in: ipAddresses } }).select('_id ipAddress').lean()
        : Promise.resolve([]),
    ]);

    const existingIpAddresses = new Set<string>([
      ...existingPlatformVms
        .map((vm) => vm.ipAddress)
        .filter((ip): ip is string => Boolean(ip?.trim()))
        .map((ip) => normalizeIpAddress(ip)),
      ...existingCatalogVms
        .map((vm) => vm.ipAddress)
        .filter((ip): ip is string => Boolean(ip?.trim()))
        .map((ip) => normalizeIpAddress(ip)),
      ...existingExternalVms.map((vm) => normalizeIpAddress(vm.ipAddress)),
    ]);

    for (const row of normalizedRows) {
      const ipAddress = row.ipAddress;

      await VmProviderMetadataModel.findOneAndUpdate(
        { ipAddress },
        {
          $set: {
            ipAddress,
            planDuration: row.planDuration ?? null,
            providerUsername: row.username?.trim() || null,
            providerPassword: row.password ? encrypt(row.password) : null,
            providerStartDate: row.providerStartDate ? new Date(row.providerStartDate) : null,
            providerEndDate: row.providerEndDate ? new Date(row.providerEndDate) : null,
            updatedBy: new mongoose.Types.ObjectId(updatedByUserId),
          },
        },
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
        adminId: new mongoose.Types.ObjectId(updatedByUserId),
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
      set['providerStartDate'] = row.providerStartDate ? new Date(row.providerStartDate) : null;
    }
    if (row.providerEndDate !== undefined) {
      set['providerEndDate'] = row.providerEndDate ? new Date(row.providerEndDate) : null;
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
