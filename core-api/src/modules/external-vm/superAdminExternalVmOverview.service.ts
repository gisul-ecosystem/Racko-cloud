import mongoose from 'mongoose';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { VmProviderMetadataModel, type ProviderPlanDuration } from '../../models/vmProviderMetadata.model';
import { decrypt } from '../../utils/crypto';
import { normalizeCanonicalIpv4 } from '../vm/helpers/ipCidr';
import { ValidationError } from '../../utils/errors';
import { ProjectModel } from '../../models/project.model';
import { ExternalVMModel } from './external-vm.model';
import type { AssignmentSchedule } from './schedule.types';

export interface SuperAdminExternalVmAssigneeView {
  assignmentId: string;
  stack: 'platform' | 'tenant';
  userId?: string;
  tenantUserId?: string;
  email: string | null;
  username: string | null;
  status: string;
  schedule: {
    effectiveFrom: string;
    effectiveTo: string | null;
    daysOfWeek: number[];
    dailyStart: string;
    dailyEnd: string;
    timezone: string;
  } | null;
  accessOverride?: boolean;
  accessOverrideUntil?: string | null;
}

export interface SuperAdminExternalVmOverviewRow {
  externalVmId: string;
  name: string;
  ipAddress: string;
  protocol: string;
  username: string;
  /** Decrypted — super_admin overview only. */
  password: string;
  providerPlanDuration?: ProviderPlanDuration | null;
  providerVmSpec?: string | null;
  providerUsername?: string | null;
  providerStartDate?: string | null;
  providerEndDate?: string | null;
  source: string;
  stack: 'platform' | 'tenant' | 'free';
  adminId: string | null;
  adminEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  projectId: string | null;
  projectName: string | null;
  projectClientName: string | null;
  assignedTo: string | null;
  assignedTenantUserId: string | null;
  assignments: SuperAdminExternalVmAssigneeView[];
  inventoryLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SuperAdminExternalVmOverviewResult {
  rows: SuperAdminExternalVmOverviewRow[];
  total: number;
}

export interface SuperAdminAssigneeOption {
  id: string;
  email: string;
  username: string | null;
  role: string;
  isActive: boolean;
}

export interface SuperAdminTargetOption {
  id: string;
  label: string;
  email?: string | null;
  username?: string | null;
  slug?: string | null;
  name?: string | null;
}

function scheduleView(
  raw: AssignmentSchedule | null | undefined
): {
  effectiveFrom: string;
  effectiveTo: string | null;
  daysOfWeek: number[];
  dailyStart: string;
  dailyEnd: string;
  timezone: string;
} | null {
  if (!raw) return null;
  return {
    effectiveFrom: new Date(raw.effectiveFrom).toISOString(),
    effectiveTo: raw.effectiveTo ? new Date(raw.effectiveTo).toISOString() : null,
    daysOfWeek: raw.daysOfWeek ?? [],
    dailyStart: raw.dailyStart,
    dailyEnd: raw.dailyEnd,
    timezone: raw.timezone || 'Asia/Kolkata',
  };
}

function normalizeIpAddress(ipAddress: string): string {
  return normalizeCanonicalIpv4(ipAddress);
}

function toIsoDateOrNull(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

class SuperAdminExternalVmOverviewService {
  async getOverview(): Promise<SuperAdminExternalVmOverviewResult> {
    const docs = await ExternalVMModel.find({}).sort({ createdAt: -1 }).lean();
    if (docs.length === 0) {
      return { rows: [], total: 0 };
    }

    const providerMetadata = await VmProviderMetadataModel.find({})
      .select('ipAddress vmSpec planDuration providerUsername providerStartDate providerEndDate')
      .lean();
    const providerByIp = new Map(
      providerMetadata.map((item) => [normalizeIpAddress(item.ipAddress), item])
    );

    const vmIds = docs.map((d) => d._id);
    const adminIds = [
      ...new Set(docs.filter((d) => d.adminId).map((d) => d.adminId!.toString())),
    ].map((id) => new mongoose.Types.ObjectId(id));
    const tenantIds = [
      ...new Set(docs.filter((d) => d.tenantId).map((d) => d.tenantId!.toString())),
    ].map((id) => new mongoose.Types.ObjectId(id));
    const projectIds = [
      ...new Set(docs.filter((d) => d.projectId).map((d) => d.projectId!.toString())),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const [platformAssigns, tenantAssigns, admins, tenants, projects] = await Promise.all([
      ExternalVmUserAssignmentModel.find({ externalVmId: { $in: vmIds } }).lean(),
      ExternalVmTenantAssignmentModel.find({ externalVmId: { $in: vmIds } }).lean(),
      adminIds.length
        ? User.find({ _id: { $in: adminIds } }).select('_id email username').lean()
        : Promise.resolve([]),
      tenantIds.length
        ? Tenant.find({ _id: { $in: tenantIds } }).select('_id name slug').lean()
        : Promise.resolve([]),
      projectIds.length
        ? ProjectModel.find({ _id: { $in: projectIds } }).select('_id name clientName').lean()
        : Promise.resolve([]),
    ]);

    const platformUserIds = [
      ...new Set(platformAssigns.map((a) => a.userId.toString())),
    ].map((id) => new mongoose.Types.ObjectId(id));
    const tenantUserIds = [
      ...new Set(tenantAssigns.map((a) => a.tenantUserId.toString())),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const [platformUsers, tenantUsers] = await Promise.all([
      platformUserIds.length
        ? User.find({ _id: { $in: platformUserIds } }).select('_id email username').lean()
        : Promise.resolve([]),
      tenantUserIds.length
        ? TenantUser.find({ _id: { $in: tenantUserIds } }).select('_id email username').lean()
        : Promise.resolve([]),
    ]);

    const adminById = new Map(admins.map((a) => [a._id.toString(), a]));
    const tenantById = new Map(tenants.map((t) => [t._id.toString(), t]));
    const projectById = new Map(projects.map((p) => [p._id.toString(), p]));
    const platformUserById = new Map(platformUsers.map((u) => [u._id.toString(), u]));
    const tenantUserById = new Map(tenantUsers.map((u) => [u._id.toString(), u]));

    const platformByVm = new Map<string, typeof platformAssigns>();
    for (const a of platformAssigns) {
      const key = a.externalVmId.toString();
      const list = platformByVm.get(key) ?? [];
      list.push(a);
      platformByVm.set(key, list);
    }
    const tenantByVm = new Map<string, typeof tenantAssigns>();
    for (const a of tenantAssigns) {
      const key = a.externalVmId.toString();
      const list = tenantByVm.get(key) ?? [];
      list.push(a);
      tenantByVm.set(key, list);
    }

    const rows: SuperAdminExternalVmOverviewRow[] = docs.map((doc) => {
      const isTenant = Boolean(doc.tenantId);
      const isFree = !doc.tenantId && !doc.adminId;
      const admin = doc.adminId ? adminById.get(doc.adminId.toString()) : undefined;
      const tenant = doc.tenantId ? tenantById.get(doc.tenantId.toString()) : undefined;
      const project = doc.projectId ? projectById.get(doc.projectId.toString()) : undefined;
      const provider = providerByIp.get(normalizeIpAddress(doc.ipAddress));

      let password = '';
      try {
        password = decrypt(doc.password);
      } catch {
        password = '';
      }

      const assignments: SuperAdminExternalVmAssigneeView[] = [];

      for (const a of tenantByVm.get(doc._id.toString()) ?? []) {
        const u = tenantUserById.get(a.tenantUserId.toString());
        assignments.push({
          assignmentId: a._id.toString(),
          stack: 'tenant',
          tenantUserId: a.tenantUserId.toString(),
          email: u?.email ?? null,
          username: u?.username ?? null,
          status: a.status ?? 'active',
          schedule: scheduleView(a.schedule),
          accessOverride: Boolean(a.accessOverride),
          accessOverrideUntil: a.accessOverrideUntil
            ? new Date(a.accessOverrideUntil).toISOString()
            : null,
        });
      }

      for (const a of platformByVm.get(doc._id.toString()) ?? []) {
        const u = platformUserById.get(a.userId.toString());
        assignments.push({
          assignmentId: a._id.toString(),
          stack: 'platform',
          userId: a.userId.toString(),
          email: u?.email ?? null,
          username: u?.username ?? null,
          status: a.status ?? 'active',
          schedule: scheduleView(a.schedule),
          accessOverride: Boolean(a.accessOverride),
          accessOverrideUntil: a.accessOverrideUntil
            ? new Date(a.accessOverrideUntil).toISOString()
            : null,
        });
      }

      if (
        assignments.length === 0 &&
        doc.assignedTenantUserId &&
        tenantUserById.has(doc.assignedTenantUserId.toString())
      ) {
        const u = tenantUserById.get(doc.assignedTenantUserId.toString())!;
        assignments.push({
          assignmentId: `legacy-tenant:${doc._id.toString()}`,
          stack: 'tenant',
          tenantUserId: doc.assignedTenantUserId.toString(),
          email: u.email ?? null,
          username: u.username ?? null,
          status: 'active',
          schedule: null,
        });
      } else if (assignments.length === 0 && doc.assignedTenantUserId) {
        assignments.push({
          assignmentId: `legacy-tenant:${doc._id.toString()}`,
          stack: 'tenant',
          tenantUserId: doc.assignedTenantUserId.toString(),
          email: null,
          username: null,
          status: 'active',
          schedule: null,
        });
      }

      if (
        assignments.length === 0 &&
        doc.assignedTo &&
        platformUserById.has(doc.assignedTo.toString())
      ) {
        const u = platformUserById.get(doc.assignedTo.toString())!;
        assignments.push({
          assignmentId: `legacy:${doc._id.toString()}`,
          stack: 'platform',
          userId: doc.assignedTo.toString(),
          email: u.email ?? null,
          username: u.username ?? null,
          status: 'active',
          schedule: null,
        });
      } else if (assignments.length === 0 && doc.assignedTo) {
        assignments.push({
          assignmentId: `legacy:${doc._id.toString()}`,
          stack: 'platform',
          userId: doc.assignedTo.toString(),
          email: null,
          username: null,
          status: 'active',
          schedule: null,
        });
      }

      return {
        externalVmId: doc._id.toString(),
        name: doc.name,
        ipAddress: doc.ipAddress,
        protocol: doc.protocol,
        username: doc.username,
        password,
        providerPlanDuration: provider?.planDuration ?? null,
        providerVmSpec: provider?.vmSpec ?? null,
        providerUsername: provider?.providerUsername ?? null,
        providerStartDate: toIsoDateOrNull(provider?.providerStartDate),
        providerEndDate: toIsoDateOrNull(provider?.providerEndDate),
        source: doc.source ?? 'admin_import',
        stack: isFree ? 'free' : isTenant ? 'tenant' : 'platform',
        adminId: doc.adminId?.toString() ?? null,
        adminEmail: admin?.email ?? null,
        tenantId: doc.tenantId?.toString() ?? null,
        tenantName: tenant?.name ?? null,
        tenantSlug: tenant?.slug ?? null,
        projectId: doc.projectId?.toString() ?? null,
        projectName: project?.name ?? null,
        projectClientName: project?.clientName ?? null,
        assignedTo: doc.assignedTo?.toString() ?? null,
        assignedTenantUserId: doc.assignedTenantUserId?.toString() ?? null,
        assignments,
        inventoryLocked: Boolean(doc.inventoryLocked),
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
      };
    });

    // Hydrate legacy assignedTo emails that weren't in assignment query
    const missingLegacyIds = rows
      .flatMap((r) => r.assignments)
      .filter((a) => a.assignmentId.startsWith('legacy:') && !a.email && a.userId)
      .map((a) => a.userId!);
    if (missingLegacyIds.length > 0) {
      const users = await User.find({
        _id: { $in: missingLegacyIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select('_id email username')
        .lean();
      const byId = new Map(users.map((u) => [u._id.toString(), u]));
      for (const row of rows) {
        for (const a of row.assignments) {
          if (a.userId && !a.email) {
            const u = byId.get(a.userId);
            if (u) {
              a.email = u.email ?? null;
              a.username = u.username ?? null;
            }
          }
        }
      }
    }

    return { rows, total: rows.length };
  }

  async getOverviewRow(
    externalVmId: mongoose.Types.ObjectId
  ): Promise<SuperAdminExternalVmOverviewRow | null> {
    const { rows } = await this.getOverview();
    return rows.find((r) => r.externalVmId === externalVmId.toString()) ?? null;
  }

  async listAssigneeOptions(query: {
    adminId?: string;
    tenantId?: string;
  }): Promise<{ assignees: SuperAdminAssigneeOption[] }> {
    const hasAdmin = Boolean(query.adminId);
    const hasTenant = Boolean(query.tenantId);
    if (hasAdmin === hasTenant) {
      throw new ValidationError('Provide exactly one of adminId or tenantId.');
    }

    if (query.adminId) {
      if (!mongoose.Types.ObjectId.isValid(query.adminId)) {
        throw new ValidationError('Invalid adminId.');
      }
      const admin = await User.findById(query.adminId).select('_id role').lean();
      if (!admin || admin.role !== 'admin') {
        throw new ValidationError('adminId must reference an admin user.');
      }
      const users = await User.find({
        createdBy: admin._id,
        role: 'user',
      })
        .select('_id email username role isActive')
        .sort({ email: 1 })
        .lean();

      return {
        assignees: users.map((u) => ({
          id: u._id.toString(),
          email: u.email,
          username: u.username ?? null,
          role: u.role,
          isActive: u.isActive,
        })),
      };
    }

    if (!mongoose.Types.ObjectId.isValid(query.tenantId!)) {
      throw new ValidationError('Invalid tenantId.');
    }
    const tenant = await Tenant.findById(query.tenantId).select('_id').lean();
    if (!tenant) {
      throw new ValidationError('Tenant not found.');
    }
    const users = await TenantUser.find({ tenantId: tenant._id })
      .select('_id email username role isActive')
      .sort({ email: 1 })
      .lean();

    return {
      assignees: users.map((u) => ({
        id: u._id.toString(),
        email: u.email,
        username: u.username ?? null,
        role: u.role,
        isActive: u.isActive,
      })),
    };
  }

  async listTargetOptions(): Promise<{
    admins: SuperAdminTargetOption[];
    tenants: SuperAdminTargetOption[];
  }> {
    const [admins, tenants] = await Promise.all([
      User.find({ role: 'admin' })
        .select('_id email username')
        .sort({ email: 1 })
        .lean(),
      Tenant.find({})
        .select('_id name slug')
        .sort({ name: 1, slug: 1 })
        .lean(),
    ]);

    return {
      admins: admins.map((admin) => ({
        id: admin._id.toString(),
        label: admin.username ? `${admin.username} (${admin.email})` : admin.email,
        email: admin.email,
        username: admin.username ?? null,
      })),
      tenants: tenants.map((tenant) => ({
        id: tenant._id.toString(),
        label: `${tenant.name} (${tenant.slug})`,
        name: tenant.name,
        slug: tenant.slug,
      })),
    };
  }
}

export const superAdminExternalVmOverviewService = new SuperAdminExternalVmOverviewService();
