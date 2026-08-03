import mongoose from 'mongoose';
import { RbacRoleModel, type IRbacRole } from '../../models/rbacRole.model';
import { RbacAssignmentModel } from '../../models/rbacAssignment.model';
import { RbacAuditModel, type RbacAuditAction } from '../../models/rbacAudit.model';
import { User } from '../../models/user.model';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import { generateSecureToken, hashToken } from '../../utils/crypto';
import { config } from '../../config';
import { sendStaffInviteEmail } from '../../utils/email/sender';
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLE_SEEDS,
  isKnownPermission,
  ALL_PERMISSION_KEYS,
} from './permissions.catalog';

const permissionCache = new Map<string, { keys: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

function normalizePermissions(keys: string[]): string[] {
  const invalid = keys.filter((k) => !isKnownPermission(k));
  if (invalid.length > 0) {
    throw new ValidationError(`Unknown permission(s): ${invalid.join(', ')}`);
  }
  return [...new Set(keys)];
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
}

function rolePublic(doc: IRbacRole) {
  return {
    _id: doc._id.toString(),
    slug: doc.slug,
    name: doc.name,
    description: doc.description || '',
    permissions: doc.permissions || [],
    isSystem: Boolean(doc.isSystem),
    isActive: Boolean(doc.isActive),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function writeAudit(input: {
  actorId: string;
  action: RbacAuditAction;
  targetType: 'role' | 'user';
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}): Promise<void> {
  await RbacAuditModel.create({
    actorId: new mongoose.Types.ObjectId(input.actorId),
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    ...(input.before ? { before: input.before } : {}),
    ...(input.after ? { after: input.after } : {}),
  });
}

class RbacService {
  clearPermissionCache(userId?: string): void {
    if (userId) permissionCache.delete(userId);
    else permissionCache.clear();
  }

  async ensureSystemRoles(): Promise<void> {
    for (const seed of SYSTEM_ROLE_SEEDS) {
      await RbacRoleModel.findOneAndUpdate(
        { slug: seed.slug },
        {
          $setOnInsert: {
            slug: seed.slug,
            name: seed.name,
            description: seed.description,
            permissions: seed.permissions,
            isSystem: true,
            isActive: true,
          },
        },
        { upsert: true, new: true }
      );
    }
  }

  listPermissionCatalog() {
    return PERMISSION_CATALOG;
  }

  async listRoles(): Promise<ReturnType<typeof rolePublic>[]> {
    await this.ensureSystemRoles();
    const docs = await RbacRoleModel.find().sort({ isSystem: -1, name: 1 });
    return docs.map(rolePublic);
  }

  async createRole(
    input: { name: string; description?: string; permissions: string[] },
    actorId: string
  ) {
    const permissions = normalizePermissions(input.permissions);
    const baseSlug = slugify(input.name) || `role_${Date.now()}`;
    let slug = baseSlug;
    let n = 1;
    while (await RbacRoleModel.exists({ slug })) {
      slug = `${baseSlug}_${n++}`;
    }

    const doc = await RbacRoleModel.create({
      slug,
      name: input.name.trim(),
      description: (input.description || '').trim(),
      permissions,
      isSystem: false,
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(actorId),
    });

    await writeAudit({
      actorId,
      action: 'role_created',
      targetType: 'role',
      targetId: doc._id.toString(),
      after: rolePublic(doc),
    });

    return rolePublic(doc);
  }

  async updateRole(
    id: string,
    input: { name?: string; description?: string; permissions?: string[]; isActive?: boolean },
    actorId: string
  ) {
    const doc = await RbacRoleModel.findById(id);
    if (!doc) throw new NotFoundError('Role not found.');

    const before = rolePublic(doc);

    if (doc.isSystem) {
      // System roles: permissions & active flag only (name/description locked)
      if (input.permissions !== undefined) {
        doc.permissions = normalizePermissions(input.permissions);
      }
      if (input.isActive !== undefined) {
        doc.isActive = input.isActive;
      }
    } else {
      if (input.name !== undefined) doc.name = input.name.trim();
      if (input.description !== undefined) doc.description = input.description.trim();
      if (input.permissions !== undefined) {
        doc.permissions = normalizePermissions(input.permissions);
      }
      if (input.isActive !== undefined) doc.isActive = input.isActive;
    }

    await doc.save();
    this.clearPermissionCache();

    const after = rolePublic(doc);
    await writeAudit({
      actorId,
      action: input.isActive === false ? 'role_deactivated' : 'role_updated',
      targetType: 'role',
      targetId: doc._id.toString(),
      before,
      after,
    });

    return after;
  }

  async getEffectivePermissions(userId: string): Promise<Set<string>> {
    const cached = permissionCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return new Set(cached.keys);
    }

    const user = await User.findById(userId).select('role isActive').lean();
    if (!user || !user.isActive) {
      const empty = new Set<string>();
      permissionCache.set(userId, { keys: empty, expiresAt: Date.now() + CACHE_TTL_MS });
      return empty;
    }

    if (user.role === 'super_admin') {
      const all = new Set(ALL_PERMISSION_KEYS);
      permissionCache.set(userId, { keys: all, expiresAt: Date.now() + CACHE_TTL_MS });
      return all;
    }

    if (user.role !== 'staff') {
      const empty = new Set<string>();
      permissionCache.set(userId, { keys: empty, expiresAt: Date.now() + CACHE_TTL_MS });
      return empty;
    }

    const assignments = await RbacAssignmentModel.find({
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (assignments.length === 0) {
      const empty = new Set<string>();
      permissionCache.set(userId, { keys: empty, expiresAt: Date.now() + CACHE_TTL_MS });
      return empty;
    }

    const roles = await RbacRoleModel.find({
      _id: { $in: assignments.map((a) => a.roleId) },
      isActive: true,
    }).lean();

    const keys = new Set<string>();
    for (const role of roles) {
      for (const p of role.permissions || []) keys.add(p);
    }

    permissionCache.set(userId, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
    return keys;
  }

  async userHasPermission(userId: string, permission: string): Promise<boolean> {
    const user = await User.findById(userId).select('role isActive').lean();
    if (!user || !user.isActive) return false;
    if (user.role === 'super_admin') return true;
    const keys = await this.getEffectivePermissions(userId);
    return keys.has(permission);
  }

  async listStaffPeople(): Promise<
    Array<{
      _id: string;
      email: string;
      role: string;
      isActive: boolean;
      roleIds: string[];
      roleNames: string[];
      permissions: string[];
    }>
  > {
    await this.ensureSystemRoles();
    const users = await User.find({ role: { $in: ['staff', 'super_admin'] } })
      .select('email role isActive')
      .sort({ role: 1, email: 1 })
      .lean();

    const userIds = users.map((u) => u._id);
    const assignments = await RbacAssignmentModel.find({ userId: { $in: userIds } }).lean();
    const roleIds = [...new Set(assignments.map((a) => a.roleId.toString()))];
    const roles = await RbacRoleModel.find({
      _id: { $in: roleIds.map((id) => new mongoose.Types.ObjectId(id)) },
    }).lean();
    const roleById = new Map(roles.map((r) => [r._id.toString(), r]));

    const assignByUser = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const key = a.userId.toString();
      const list = assignByUser.get(key) || [];
      list.push(a);
      assignByUser.set(key, list);
    }

    return Promise.all(
      users.map(async (u) => {
        const uid = u._id.toString();
        if (u.role === 'super_admin') {
          return {
            _id: uid,
            email: u.email,
            role: u.role,
            isActive: Boolean(u.isActive),
            roleIds: [],
            roleNames: ['Super Admin (full access)'],
            permissions: [...ALL_PERMISSION_KEYS],
          };
        }
        const myAssign = assignByUser.get(uid) || [];
        const myRoles = myAssign
          .map((a) => roleById.get(a.roleId.toString()))
          .filter((r): r is NonNullable<typeof r> => Boolean(r?.isActive));
        const permissions = new Set<string>();
        for (const r of myRoles) for (const p of r.permissions || []) permissions.add(p);
        return {
          _id: uid,
          email: u.email,
          role: u.role,
          isActive: Boolean(u.isActive),
          roleIds: myRoles.map((r) => r._id.toString()),
          roleNames: myRoles.map((r) => r.name),
          permissions: [...permissions].sort(),
        };
      })
    );
  }

  async setUserRoles(userId: string, roleIds: string[], actorId: string) {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found.');
    if (user.role === 'super_admin') {
      throw new ValidationError('Super admin always has full access; do not assign RBAC roles.');
    }
    if (user.role !== 'staff') {
      throw new ValidationError('RBAC roles can only be assigned to staff users.');
    }

    // Safety: actor cannot strip their own rbac.assign if they are the only one with it
    if (actorId === userId) {
      const nextRoles = await RbacRoleModel.find({
        _id: { $in: roleIds.map((id) => new mongoose.Types.ObjectId(id)) },
        isActive: true,
      }).lean();
      const nextPerms = new Set<string>();
      for (const r of nextRoles) for (const p of r.permissions || []) nextPerms.add(p);
      if (!nextPerms.has('rbac.assign')) {
        const others = await this.countUsersWithPermission('rbac.assign', userId);
        if (others === 0) {
          // Super admin can still do this; only block staff from locking themselves out
          const actor = await User.findById(actorId).select('role').lean();
          if (actor?.role !== 'super_admin') {
            throw new ForbiddenError('Cannot remove your own role-assignment permission.');
          }
        }
      }
    }

    const validRoles = await RbacRoleModel.find({
      _id: { $in: roleIds.map((id) => new mongoose.Types.ObjectId(id)) },
      isActive: true,
    }).lean();

    if (validRoles.length !== roleIds.length) {
      throw new ValidationError('One or more roles are invalid or inactive.');
    }

    const beforeAssign = await RbacAssignmentModel.find({
      userId: user._id,
    }).lean();
    const beforeRoleIds = beforeAssign.map((a) => a.roleId.toString());

    await RbacAssignmentModel.deleteMany({ userId: user._id });
    if (validRoles.length > 0) {
      await RbacAssignmentModel.insertMany(
        validRoles.map((r) => ({
          userId: user._id,
          roleId: r._id,
          assignedBy: new mongoose.Types.ObjectId(actorId),
        }))
      );
    }

    this.clearPermissionCache(userId);

    await writeAudit({
      actorId,
      action: 'assignment_set',
      targetType: 'user',
      targetId: userId,
      before: { roleIds: beforeRoleIds },
      after: { roleIds: validRoles.map((r) => r._id.toString()) },
    });

    const people = await this.listStaffPeople();
    return people.find((p) => p._id === userId)!;
  }

  private async countUsersWithPermission(permission: string, excludeUserId?: string): Promise<number> {
    const roles = await RbacRoleModel.find({
      isActive: true,
      permissions: permission,
    })
      .select('_id')
      .lean();
    if (roles.length === 0) return 0;
    const filter: Record<string, unknown> = {
      roleId: { $in: roles.map((r) => r._id) },
    };
    if (excludeUserId) {
      filter.userId = { $ne: new mongoose.Types.ObjectId(excludeUserId) };
    }
    const userIds = await RbacAssignmentModel.distinct('userId', filter);
    return userIds.length;
  }

  async createStaffUser(
    input: { email: string; tempPassword: string; roleIds?: string[] },
    actorId: string
  ) {
    const email = input.email.trim().toLowerCase();
    const existing = await User.findOne({ email });
    if (existing && existing.isEmailVerified) {
      throw new ValidationError('Email is already registered.');
    }

    const rawVerifyToken = generateSecureToken(32);
    const rawResetToken = generateSecureToken(32);
    const verifyExpiresAt = new Date(
      Date.now() + config.EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000
    );
    const resetExpiresAt = new Date(
      Date.now() + config.EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000
    );

    let user;
    if (existing) {
      existing.password = input.tempPassword;
      existing.role = 'staff';
      existing.isActive = true;
      existing.isEmailVerified = false;
      existing.emailVerificationToken = hashToken(rawVerifyToken);
      existing.emailVerificationExpires = verifyExpiresAt;
      existing.passwordResetToken = hashToken(rawResetToken);
      existing.passwordResetExpires = resetExpiresAt;
      existing.mustSetPassword = true;
      existing.createdBy = new mongoose.Types.ObjectId(actorId);
      user = await existing.save();
    } else {
      user = await User.create({
        email,
        password: input.tempPassword,
        role: 'staff',
        isEmailVerified: false,
        isActive: true,
        emailVerificationToken: hashToken(rawVerifyToken),
        emailVerificationExpires: verifyExpiresAt,
        passwordResetToken: hashToken(rawResetToken),
        passwordResetExpires: resetExpiresAt,
        mustSetPassword: true,
        createdBy: new mongoose.Types.ObjectId(actorId),
      });
    }

    await sendStaffInviteEmail({
      to: email,
      email,
      tempPassword: input.tempPassword,
      verifyToken: rawVerifyToken,
      resetToken: rawResetToken,
    });

    await writeAudit({
      actorId,
      action: 'staff_created',
      targetType: 'user',
      targetId: user._id.toString(),
      after: { email, role: 'staff', invited: true },
    });

    if (input.roleIds && input.roleIds.length > 0) {
      return this.setUserRoles(user._id.toString(), input.roleIds, actorId);
    }

    return {
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      isActive: true,
      roleIds: [] as string[],
      roleNames: [] as string[],
      permissions: [] as string[],
    };
  }

  async listAudit(limit = 50) {
    const docs = await RbacAuditModel.find()
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .lean();
    return docs.map((d) => ({
      _id: d._id.toString(),
      actorId: d.actorId.toString(),
      action: d.action,
      targetType: d.targetType,
      targetId: d.targetId,
      before: d.before,
      after: d.after,
      createdAt: d.createdAt.toISOString(),
    }));
  }
}

export const rbacService = new RbacService();
