import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../../utils/errors';
import { generateSecureToken, hashToken } from '../../utils/crypto';
import { sendStaffInviteEmail } from '../../utils/email/sender';
import {
  PLATFORM_PERMISSION_CATALOG,
  PLATFORM_ALL_PERMISSION_KEYS,
  PLATFORM_SYSTEM_ROLE_SEEDS,
  isPlatformPermission,
} from './platformPermissions.catalog';
import {
  ensureSystemRoles,
  listOrgRoles,
  createOrgRole,
  updateOrgRole,
  getSubjectPermissionSet,
  setSubjectRoles,
  listSubjectRoleIds,
} from '../orgRbac/orgRbac.helpers';

const permissionCache = new Map<string, { keys: Set<string>; expiresAt: number; orgId: string }>();
const CACHE_TTL_MS = 30_000;

function assertPlatformPermissions(keys: string[]): string[] {
  const invalid = keys.filter((k) => !isPlatformPermission(k));
  if (invalid.length > 0) {
    throw new ValidationError(`Unknown permission(s): ${invalid.join(', ')}`);
  }
  return [...new Set(keys)];
}

function cacheKey(orgId: string, subjectId: string): string {
  return `platform:${orgId}:${subjectId}`;
}

export function resolvePlatformOrgOwnerId(user: {
  _id?: mongoose.Types.ObjectId | string;
  id?: string;
  role?: string;
  orgOwnerId?: mongoose.Types.ObjectId | string | null;
}): string | null {
  if (user.role !== 'admin') return null;
  if (user.orgOwnerId) return String(user.orgOwnerId);
  return String(user._id || user.id || '');
}

class PlatformRbacService {
  clearCache(orgId?: string, subjectId?: string): void {
    if (orgId && subjectId) {
      permissionCache.delete(cacheKey(orgId, subjectId));
      return;
    }
    if (orgId) {
      for (const key of permissionCache.keys()) {
        if (key.startsWith(`platform:${orgId}:`)) permissionCache.delete(key);
      }
      return;
    }
    permissionCache.clear();
  }

  listPermissionCatalog() {
    return PLATFORM_PERMISSION_CATALOG;
  }

  async ensureOrgRoles(orgId: string): Promise<void> {
    await ensureSystemRoles({
      scope: 'platform',
      orgId,
      seeds: PLATFORM_SYSTEM_ROLE_SEEDS,
    });
  }

  async listRoles(orgId: string) {
    await this.ensureOrgRoles(orgId);
    return listOrgRoles('platform', orgId);
  }

  async createRole(
    orgId: string,
    input: { name: string; description?: string; permissions: string[] },
    actorId: string
  ) {
    return createOrgRole({
      scope: 'platform',
      orgId,
      name: input.name,
      description: input.description,
      permissions: input.permissions,
      createdBy: actorId,
      assertPermissions: assertPlatformPermissions,
    });
  }

  async updateRole(
    orgId: string,
    roleId: string,
    input: { name?: string; description?: string; permissions?: string[]; isActive?: boolean }
  ) {
    const updated = await updateOrgRole({
      scope: 'platform',
      orgId,
      roleId,
      ...input,
      assertPermissions: assertPlatformPermissions,
    });
    this.clearCache(orgId);
    return updated;
  }

  /**
   * Org owner gets all permissions. Org operators / managed users get assigned roles.
   */
  async getEffectivePermissions(input: {
    subjectId: string;
    orgId: string;
    isOrgOwner: boolean;
  }): Promise<Set<string>> {
    if (input.isOrgOwner) {
      return new Set(PLATFORM_ALL_PERMISSION_KEYS);
    }

    const key = cacheKey(input.orgId, input.subjectId);
    const cached = permissionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return new Set(cached.keys);
    }

    const perms = await getSubjectPermissionSet({
      scope: 'platform',
      orgId: input.orgId,
      subjectId: input.subjectId,
    });
    permissionCache.set(key, {
      keys: perms,
      expiresAt: Date.now() + CACHE_TTL_MS,
      orgId: input.orgId,
    });
    return perms;
  }

  async listPeople(orgId: string) {
    await this.ensureOrgRoles(orgId);
    const oid = new mongoose.Types.ObjectId(orgId);

    // Access control is for console operators only — not managed end-users (role=user).
    const people = await User.find({
      $or: [
        { _id: oid, role: 'admin' },
        { orgOwnerId: oid, role: 'admin' },
      ],
    })
      .select('_id email role isActive orgOwnerId createdBy')
      .sort({ role: 1, email: 1 })
      .lean();

    const subjectIds = people.map((p) => p._id.toString());
    const roleIdsBySubject = await listSubjectRoleIds({
      scope: 'platform',
      orgId,
      subjectIds,
    });
    const roles = await this.listRoles(orgId);
    const roleNameById = new Map(roles.map((r) => [r._id, r.name]));

    return people.map((p) => {
      const id = p._id.toString();
      const isOwner = id === orgId && p.role === 'admin' && !p.orgOwnerId;
      const roleIds = isOwner ? roles.map((r) => r._id) : roleIdsBySubject.get(id) || [];
      const permissions = isOwner
        ? [...PLATFORM_ALL_PERMISSION_KEYS]
        : roles
            .filter((r) => roleIds.includes(r._id))
            .flatMap((r) => r.permissions);

      return {
        _id: id,
        email: p.email,
        role: p.role,
        isActive: Boolean(p.isActive),
        isOrgOwner: isOwner,
        roleIds: isOwner ? [] : roleIds,
        roleNames: isOwner
          ? ['Org owner']
          : roleIds.map((rid) => roleNameById.get(rid) || rid),
        permissions: [...new Set(permissions)],
      };
    });
  }

  async setUserRoles(orgId: string, subjectId: string, roleIds: string[], actorId: string) {
    if (subjectId === orgId) {
      throw new ForbiddenError('Cannot change roles for the organization owner.');
    }

    const subject = await User.findById(subjectId).select('role orgOwnerId createdBy').lean();
    if (!subject) throw new NotFoundError('User not found.');

    const belongs = subject.role === 'admin' && String(subject.orgOwnerId || '') === orgId;
    if (!belongs) {
      throw new ForbiddenError('User is not an operator in this organization.');
    }

    const saved = await setSubjectRoles({
      scope: 'platform',
      orgId,
      subjectId,
      roleIds,
      assignedBy: actorId,
    });
    this.clearCache(orgId, subjectId);
    return saved;
  }

  async inviteOperator(
    orgId: string,
    input: { email: string; temporaryPassword: string; roleIds: string[] },
    actorId: string
  ) {
    const email = input.email.toLowerCase().trim();
    const existing = await User.findOne({ email });
    if (existing) throw new ConflictError('Email already in use.');

    if (!input.temporaryPassword || input.temporaryPassword.length < 8) {
      throw new ValidationError('Temporary password must be at least 8 characters.');
    }

    await this.ensureOrgRoles(orgId);

    const verifyToken = generateSecureToken(32);
    const resetToken = generateSecureToken(32);
    const user = await User.create({
      email,
      password: input.temporaryPassword,
      role: 'admin',
      accountType: 'legacy',
      onboardingStatus: 'active',
      isEmailVerified: false,
      isActive: true,
      mustSetPassword: true,
      orgOwnerId: new mongoose.Types.ObjectId(orgId),
      createdBy: new mongoose.Types.ObjectId(actorId),
      emailVerificationToken: hashToken(verifyToken),
      emailVerificationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      passwordResetToken: hashToken(resetToken),
      passwordResetExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    if (input.roleIds.length > 0) {
      await this.setUserRoles(orgId, user._id.toString(), input.roleIds, actorId);
    }

    try {
      await sendStaffInviteEmail({
        to: email,
        email,
        tempPassword: input.temporaryPassword,
        verifyToken,
        resetToken,
      });
    } catch {
      // Invite email is best-effort; account still created.
    }

    return {
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
    };
  }
}

export const platformRbacService = new PlatformRbacService();

