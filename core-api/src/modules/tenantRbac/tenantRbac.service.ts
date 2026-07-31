import { TenantUser } from '../../models/tenantUser.model';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
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
      orgId: input.tenantId,
      subjectId: input.subjectId,
    });
    permissionCache.set(key, { keys: perms, expiresAt: Date.now() + CACHE_TTL_MS });
    return perms;
  }

  async listPeople(tenantId: string) {
    await this.ensureTenantRoles(tenantId);
    const people = await TenantUser.find({ tenantId })
      .select('_id email role isActive')
      .sort({ role: 1, email: 1 })
      .lean();

    const subjectIds = people.map((p) => p._id.toString());
    const roleIdsBySubject = await listSubjectRoleIds({
      scope: 'tenant',
      orgId: tenantId,
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
      orgId: tenantId,
      subjectId,
      roleIds,
      assignedBy: actorId,
    });
    this.clearCache(tenantId, subjectId);
    return saved;
  }
}

export const tenantRbacService = new TenantRbacService();
