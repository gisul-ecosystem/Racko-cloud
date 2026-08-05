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
import { generateSecureToken, hashToken } from '../../utils/crypto';
import { sendTenantOperatorInviteEmail } from '../../utils/email/sender';
import { TenantServiceConfig } from '../../models/tenantServiceConfig.model';
import type { ServiceKey } from '../../constants/serviceCatalog';
import {
  TENANT_ALL_PERMISSION_KEYS,
  TENANT_SYSTEM_ROLE_SEEDS,
  isTenantPermission,
  tenantPermissionCatalogFor,
  tenantPermissionKeysFor,
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

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

const permissionCache = new Map<string, { keys: Set<string>; expiresAt: number }>();
const allowedKeysCache = new Map<string, { keys: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;
const CONSOLE_INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function assertTenantPermissions(keys: string[]): string[] {
  const invalid = keys.filter((k) => !isTenantPermission(k));
  if (invalid.length > 0) {
    throw new ValidationError(`Unknown permission(s): ${invalid.join(', ')}`);
  }
  return [...new Set(keys)];
}

/** Reject permissions for services the platform has not assigned to this tenant. */
function assertPermissionsFor(allowed: ReadonlySet<string>) {
  return (keys: string[]): string[] => {
    const unique = assertTenantPermissions(keys);
    const unavailable = unique.filter((k) => !allowed.has(k));
    if (unavailable.length > 0) {
      throw new ValidationError(
        `Permission(s) not available for this tenant's services: ${unavailable.join(', ')}`
      );
    }
    return unique;
  };
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
      allowedKeysCache.delete(String(tenantId));
      for (const key of permissionCache.keys()) {
        if (key.startsWith(`tenant:${tenantId}:`)) permissionCache.delete(key);
      }
      return;
    }
    allowedKeysCache.clear();
    permissionCache.clear();
  }

  /** Service keys the platform has assigned to this tenant and left active. */
  async getActiveServiceKeys(tenantId: string): Promise<Set<ServiceKey>> {
    const configs = await TenantServiceConfig.find({
      tenantId: new mongoose.Types.ObjectId(String(tenantId)),
      status: 'active',
    })
      .select('serviceKey')
      .lean();
    return new Set(configs.map((c) => c.serviceKey));
  }

  /** Permission keys this tenant may grant, given its active services. */
  async getAllowedPermissionKeys(tenantId: string): Promise<Set<string>> {
    const key = String(tenantId);
    const cached = allowedKeysCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return new Set(cached.keys);
    }

    const active = await this.getActiveServiceKeys(tenantId);
    const keys = new Set(tenantPermissionKeysFor(active));
    allowedKeysCache.set(key, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
    return new Set(keys);
  }

  async listPermissionCatalog(tenantId: string) {
    const active = await this.getActiveServiceKeys(tenantId);
    return tenantPermissionCatalogFor(active);
  }

  async ensureTenantRoles(tenantId: string): Promise<void> {
    const allowed = await this.getAllowedPermissionKeys(tenantId);
    await ensureSystemRoles({
      scope: 'tenant',
      orgId: tenantId,
      // Built-in roles must not hand out services the tenant does not have.
      seeds: TENANT_SYSTEM_ROLE_SEEDS.map((seed) => ({
        ...seed,
        permissions: seed.permissions.filter((p) => allowed.has(p)),
      })),
    });
  }

  async listRoles(tenantId: string) {
    await this.ensureTenantRoles(tenantId);
    const [roles, allowed] = await Promise.all([
      listOrgRoles('tenant', tenantId),
      this.getAllowedPermissionKeys(tenantId),
    ]);
    // Hide permissions belonging to services this tenant no longer has.
    return roles.map((role) => ({
      ...role,
      permissions: role.permissions.filter((p) => allowed.has(p)),
    }));
  }

  async createRole(
    tenantId: string,
    input: { name: string; description?: string; permissions: string[] },
    actorId: string
  ) {
    const allowed = await this.getAllowedPermissionKeys(tenantId);
    return createOrgRole({
      scope: 'tenant',
      orgId: tenantId,
      name: input.name,
      description: input.description,
      permissions: input.permissions,
      createdBy: actorId,
      assertPermissions: assertPermissionsFor(allowed),
    });
  }

  async updateRole(
    tenantId: string,
    roleId: string,
    input: { name?: string; description?: string; permissions?: string[]; isActive?: boolean }
  ) {
    const allowed = await this.getAllowedPermissionKeys(tenantId);
    const updated = await updateOrgRole({
      scope: 'tenant',
      orgId: tenantId,
      roleId,
      ...input,
      assertPermissions: assertPermissionsFor(allowed),
    });
    this.clearCache(tenantId);
    return updated;
  }

  async getEffectivePermissions(input: {
    tenantId: string;
    subjectId: string;
    isTenantAdmin: boolean;
  }): Promise<Set<string>> {
    const allowed = await this.getAllowedPermissionKeys(input.tenantId);

    if (input.isTenantAdmin) {
      return allowed;
    }

    const key = cacheKey(input.tenantId, input.subjectId);
    const cached = permissionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return new Set([...cached.keys].filter((k) => allowed.has(k)));
    }

    const granted = await getSubjectPermissionSet({
      scope: 'tenant',
      orgId: String(input.tenantId),
      subjectId: String(input.subjectId),
    });
    // A suspended / removed service revokes its permissions immediately, even
    // if roles still list them.
    const perms = new Set([...granted].filter((k) => allowed.has(k)));
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
    const allowed = await this.getAllowedPermissionKeys(tenantId);

    return people.map((p) => {
      const id = p._id.toString();
      const isAdmin = p.role === 'tenant_admin';
      const roleIds = isAdmin ? [] : roleIdsBySubject.get(id) || [];
      const permissions = (
        isAdmin
          ? [...TENANT_ALL_PERMISSION_KEYS]
          : roles.filter((r) => roleIds.includes(r._id)).flatMap((r) => r.permissions)
      ).filter((k) => allowed.has(k));

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

    const rawVerifyToken = generateSecureToken(32);
    const rawResetToken = generateSecureToken(32);
    const inviteExpiresAt = new Date(Date.now() + CONSOLE_INVITE_TOKEN_TTL_MS);

    const user = await TenantUser.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      email,
      passwordHash: await hashPassword(input.temporaryPassword),
      role: 'tenant_user',
      isConsoleOperator: true,
      isActive: true,
      isEmailVerified: false,
      mustSetPassword: true,
      emailVerificationTokenHash: hashToken(rawVerifyToken),
      emailVerificationExpiresAt: inviteExpiresAt,
      resetTokenHash: hashToken(rawResetToken),
      resetTokenExpiresAt: inviteExpiresAt,
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
          verifyToken: rawVerifyToken,
          resetToken: rawResetToken,
          inviteKind: 'operator',
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

  /**
   * Removes a console operator: clears RBAC assignments and deletes the user.
   * Tenant admins cannot be deleted here (managed from Super Admin).
   */
  async deleteOperator(
    tenantId: string,
    userId: string,
    actorId: string
  ): Promise<{ email: string }> {
    if (!isValidObjectId(userId)) {
      throw new ValidationError('Invalid user id.');
    }
    if (userId === actorId) {
      throw new ValidationError('You cannot delete your own account.');
    }

    const user = await TenantUser.findOne({ _id: userId, tenantId });
    if (!user) throw new NotFoundError('Operator not found.');
    if (user.role === 'tenant_admin') {
      throw new ValidationError(
        'Tenant admin accounts cannot be deleted from Access control.'
      );
    }
    if (!user.isConsoleOperator) {
      throw new ValidationError('Only console operators can be deleted from Access control.');
    }

    const email = user.email;
    await OrgRbacAssignmentModel.deleteMany({
      scope: 'tenant',
      orgId: String(tenantId),
      subjectId: userId,
    });
    await TenantUser.deleteOne({ _id: user._id, tenantId });
    this.clearCache(tenantId, userId);

    return { email };
  }
}

export const tenantRbacService = new TenantRbacService();
