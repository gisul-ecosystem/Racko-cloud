import mongoose from 'mongoose';
import { TenantUser } from '../../models/tenantUser.model';
import { Tenant } from '../../models/tenant.model';
import { OrgRbacAssignmentModel } from '../../models/orgRbacAssignment.model';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../utils/errors';
import { hashPassword } from '../../utils/argon2';
import { sendTenantOperatorInviteEmail } from '../../utils/email/sender';
import {
  TENANT_PERMISSION_CATALOG,
  TENANT_ALL_PERMISSION_KEYS,
  TENANT_SYSTEM_ROLE_SEEDS,
  isTenantPermission,
} from './tenantPermissions.catalog';
import {
  ensureSystemRoles,
  listOrgRoles,
  createOrgRole,
  updateOrgRole,
  getSubjectPermissionSet,
  setSubjectRoles,
  listSubjectRoleIds,
} from '../orgRbac/orgRbac.helpers';

const permissionCache = new Map<string, { keys: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

function assertTenantPermissions(keys: string[]): string[] {
  const invalid = keys.filter((k) => !isTenantPermission(k));
  if (invalid.length > 0) {
    throw new ValidationError(`Unknown permission(s): ${invalid.join(', ')}`);
  }
  return [...new Set(keys)];
}

function cacheKey(tenantId: string, subjectId: string): string {
  return `tenant:${tenantId}:${subjectId}`;
}

class TenantRbacService {
  clearCache(tenantId?: string, subjectId?: string): void {
    if (tenantId && subjectId) {
      permissionCache.delete(cacheKey(tenantId, subjectId));
      return;
    }
    if (tenantId) {
      for (const key of permissionCache.keys()) {
        if (key.startsWith(`tenant:${tenantId}:`)) permissionCache.delete(key);
      }
      return;
    }
    permissionCache.clear();
  }

  listPermissionCatalog() {
    return TENANT_PERMISSION_CATALOG;
  }

  async ensureTenantRoles(tenantId: string): Promise<void> {
    await ensureSystemRoles({
      scope: 'tenant',
      orgId: tenantId,
      seeds: TENANT_SYSTEM_ROLE_SEEDS,
    });
  }

  async listRoles(tenantId: string) {
    await this.ensureTenantRoles(tenantId);
    return listOrgRoles('tenant', tenantId);
  }

  async createRole(
    tenantId: string,
    input: { name: string; description?: string; permissions: string[] },
    actorId: string
  ) {
    return createOrgRole({
      scope: 'tenant',
      orgId: tenantId,
      name: input.name,
      description: input.description,
      permissions: input.permissions,
      createdBy: actorId,
      assertPermissions: assertTenantPermissions,
    });
  }

  async updateRole(
    tenantId: string,
    roleId: string,
    input: { name?: string; description?: string; permissions?: string[]; isActive?: boolean }
  ) {
    const updated = await updateOrgRole({
      scope: 'tenant',
      orgId: tenantId,
      roleId,
      ...input,
      assertPermissions: assertTenantPermissions,
    });
    this.clearCache(tenantId);
    return updated;
  }

  async getEffectivePermissions(input: {
    tenantId: string;
    subjectId: string;
    isTenantAdmin: boolean;
  }): Promise<Set<string>> {
    if (input.isTenantAdmin) {
      return new Set(TENANT_ALL_PERMISSION_KEYS);
    }

    const key = cacheKey(input.tenantId, input.subjectId);
    const cached = permissionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return new Set(cached.keys);
    }

    const perms = await getSubjectPermissionSet({
      scope: 'tenant',
      orgId: String(input.tenantId),
      subjectId: String(input.subjectId),
    });
    // Console operators always retain console.access so they can reach the hub
    // even if all roles were cleared (admin can re-assign from Access control).
    const subject = await TenantUser.findOne({
      _id: input.subjectId,
      tenantId: input.tenantId,
    })
      .select('isConsoleOperator')
      .lean();
    if (subject?.isConsoleOperator) {
      perms.add('console.access');
    }
    permissionCache.set(key, { keys: perms, expiresAt: Date.now() + CACHE_TTL_MS });
    return perms;
  }

  async getSubjectFlags(tenantId: string, subjectId: string): Promise<{
    isConsoleOperator: boolean;
  }> {
    const subject = await TenantUser.findOne({ _id: subjectId, tenantId })
      .select('role isConsoleOperator')
      .lean();
    if (!subject) return { isConsoleOperator: false };
    if (subject.role === 'tenant_admin') return { isConsoleOperator: true };
    if (subject.isConsoleOperator) return { isConsoleOperator: true };

    // Backfill older invited operators that only have RBAC assignments.
    const hasAssignment = await OrgRbacAssignmentModel.exists({
      scope: 'tenant',
      orgId: String(tenantId),
      subjectId: String(subjectId),
    });
    if (hasAssignment) {
      await TenantUser.updateOne(
        { _id: subjectId, tenantId },
        { $set: { isConsoleOperator: true } }
      );
      return { isConsoleOperator: true };
    }
    return { isConsoleOperator: false };
  }

  async listPeople(tenantId: string) {
    await this.ensureTenantRoles(tenantId);

    // Backfill: anyone with RBAC assignments is a console operator.
    const assignedSubjectIds = await OrgRbacAssignmentModel.distinct('subjectId', {
      scope: 'tenant',
      orgId: String(tenantId),
    });
    const assignedObjectIds = assignedSubjectIds
      .map((id) => String(id))
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (assignedObjectIds.length > 0) {
      await TenantUser.updateMany(
        {
          tenantId,
          role: 'tenant_user',
          _id: { $in: assignedObjectIds },
          isConsoleOperator: { $ne: true },
        },
        { $set: { isConsoleOperator: true } }
      );
    }

    // Access control people = tenant admins + console operators (not elastic end-users).
    const people = await TenantUser.find({
      tenantId,
      $or: [{ role: 'tenant_admin' }, { isConsoleOperator: true }],
    })
      .select('_id email role isActive isConsoleOperator')
      .sort({ role: 1, email: 1 })
      .lean();

    const subjectIds = people.map((p) => p._id.toString());
    const roleIdsBySubject = await listSubjectRoleIds({
      scope: 'tenant',
      orgId: String(tenantId),
      subjectIds,
    });
    const roles = await this.listRoles(tenantId);
    const roleNameById = new Map(roles.map((r) => [r._id, r.name]));

    return people.map((p) => {
      const id = p._id.toString();
      const isAdmin = p.role === 'tenant_admin';
      const roleIds = isAdmin ? [] : roleIdsBySubject.get(id) || [];
      const permissions = isAdmin
        ? [...TENANT_ALL_PERMISSION_KEYS]
        : roles.filter((r) => roleIds.includes(r._id)).flatMap((r) => r.permissions);

      return {
        _id: id,
        email: p.email,
        role: p.role,
        isActive: Boolean(p.isActive),
        isTenantAdmin: isAdmin,
        isConsoleOperator: isAdmin || Boolean(p.isConsoleOperator),
        roleIds,
        roleNames: isAdmin
          ? ['Tenant admin']
          : roleIds.map((rid) => roleNameById.get(rid) || rid),
        permissions: [...new Set(permissions)],
      };
    });
  }

  async setUserRoles(
    tenantId: string,
    subjectId: string,
    roleIds: string[],
    actorId: string
  ) {
    const subject = await TenantUser.findOne({ _id: subjectId, tenantId })
      .select('role')
      .lean();
    if (!subject) throw new NotFoundError('Tenant user not found.');
    if (subject.role === 'tenant_admin') {
      throw new ForbiddenError('Cannot change roles for a tenant admin.');
    }

    const saved = await setSubjectRoles({
      scope: 'tenant',
      orgId: String(tenantId),
      subjectId: String(subjectId),
      roleIds,
      assignedBy: actorId,
    });
    if (roleIds.length > 0) {
      await TenantUser.updateOne(
        { _id: subjectId, tenantId },
        { $set: { isConsoleOperator: true } }
      );
    }
    this.clearCache(tenantId, subjectId);
    return saved;
  }

  async inviteOperator(
    tenantId: string,
    input: { email: string; temporaryPassword: string; roleIds: string[] },
    actorId: string
  ) {
    const email = input.email.toLowerCase().trim();
    const existing = await TenantUser.findOne({ tenantId, email }).select('_id').lean();
    if (existing) throw new ConflictError('Email already in use.');

    if (!input.temporaryPassword || input.temporaryPassword.length < 8) {
      throw new ValidationError('Temporary password must be at least 8 characters.');
    }
    if (!input.roleIds?.length) {
      throw new ValidationError('Select at least one role for the operator.');
    }

    await this.ensureTenantRoles(tenantId);

    const user = await TenantUser.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      email,
      passwordHash: await hashPassword(input.temporaryPassword),
      role: 'tenant_user',
      isConsoleOperator: true,
      isActive: true,
      isEmailVerified: true,
      createdBy: new mongoose.Types.ObjectId(actorId),
    });

    await this.setUserRoles(tenantId, user._id.toString(), input.roleIds, actorId);

    const tenant = await Tenant.findById(tenantId).select('name domain branding').lean();
    if (tenant) {
      try {
        await sendTenantOperatorInviteEmail({
          to: email,
          email,
          tempPassword: input.temporaryPassword,
          tenant: {
            name: tenant.name,
            domain: tenant.domain,
            branding: tenant.branding,
          },
        });
      } catch {
        // Invite email is best-effort; account still created.
      }
    }

    return {
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
    };
  }
}

export const tenantRbacService = new TenantRbacService();
