import mongoose from 'mongoose';
import { VM } from '../vm/vm.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
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

export class SuperAdminVmInventoryService {
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
            '_id hostname planName ipAddress protocol status adminId tenantId tenantUserId projectId autoProvisioned attachedAt expiresAt createdAt updatedAt'
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
          .select('_id name')
          .lean()
        : Promise.resolve([]),
    ]);

    const adminEmailById = new Map(admins.map((item) => [item._id.toString(), item.email]));
    const userEmailById = new Map(users.map((item) => [item._id.toString(), item.email]));
    const tenantNameById = new Map(tenants.map((item) => [item._id.toString(), item.name]));
    const tenantUserEmailById = new Map(tenantUsers.map((item) => [item._id.toString(), item.email]));
    const projectNameById = new Map(projects.map((item) => [item._id.toString(), item.name]));

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
        orderId: vm.orderId?.toString(),
        vmid: vm.vmid,
        createdAt: vm.createdAt,
        updatedAt: vm.updatedAt,
      });
    }

    for (const vm of catalogVms) {
      const status = normalizeCatalogStatus(vm.status);
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
      const providerMeta = vm.ipAddress ? providerMetadataByIp.get(normalizeIpAddress(vm.ipAddress)) : undefined;
      const providerPassword = vm.ipAddress
        ? providerPasswordByIp.get(normalizeIpAddress(vm.ipAddress)) ?? null
        : null;
      const catalogProviderStart = providerMeta?.providerStartDate ?? null;
      const catalogProviderEnd = providerMeta?.providerEndDate ?? null;
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
            providerStartDate: catalogProviderStart,
            providerEndDate: catalogProviderEnd,
            startDate: null,
            endDate: null,
          });
        }
      }
      const assignmentLocation = mappedTenantId
        ? (tenantNameById.get(mappedTenantId) ?? 'Tenant')
        : (ownerAdminId ? adminEmailById.get(ownerAdminId) ?? 'Platform owner' : 'Unassigned');

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
        createdAt: vm.createdAt,
        updatedAt: vm.updatedAt,
      });
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
        const ownerLabel = (item.ownerTenantName || item.ownerAdminEmail || 'unknown owner').toLowerCase();
        if (!ownerLabel.includes(ownerSearch)) {
          return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (filters.sortBy === 'owner') {
        const aOwner = (a.ownerTenantName || a.ownerAdminEmail || 'Unknown owner').toLowerCase();
        const bOwner = (b.ownerTenantName || b.ownerAdminEmail || 'Unknown owner').toLowerCase();
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
      const label = item.ownerTenantName || item.ownerAdminEmail || 'Unknown owner';
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
