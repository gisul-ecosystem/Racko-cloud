import mongoose from 'mongoose';
import { OrgRbacRoleModel, type IOrgRbacRole, type OrgRbacScope } from '../../models/orgRbacRole.model';
import { OrgRbacAssignmentModel } from '../../models/orgRbacAssignment.model';
import { NotFoundError, ValidationError } from '../../utils/errors';

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
}

export function rolePublic(doc: IOrgRbacRole) {
  return {
    _id: doc._id.toString(),
    scope: doc.scope,
    orgId: doc.orgId,
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

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000);
}

export async function ensureSystemRoles(input: {
  scope: OrgRbacScope;
  orgId: string;
  seeds: Array<{ slug: string; name: string; description: string; permissions: string[] }>;
}): Promise<void> {
  // Always string — ObjectId orgId would bypass the unique index and create duplicates.
  const orgId = String(input.orgId);

  for (const seed of input.seeds) {
    const filter = { scope: input.scope, orgId, slug: seed.slug };
    const existing = await OrgRbacRoleModel.findOne(filter)
      .select('seededPermissions')
      .lean();

    if (!existing) {
      try {
        await OrgRbacRoleModel.updateOne(
          filter,
          {
            $setOnInsert: {
              scope: input.scope,
              orgId,
              slug: seed.slug,
              name: seed.name,
              description: seed.description,
              permissions: seed.permissions,
              seededPermissions: seed.permissions,
              isSystem: true,
              isActive: true,
            },
          },
          { upsert: true }
        );
      } catch (err) {
        // Concurrent upserts can race on the unique (scope, orgId, slug) index.
        if (!isDuplicateKeyError(err)) throw err;
      }
      continue;
    }

    // Roles predating seed tracking adopt the current seed as their baseline, so
    // permissions an admin deliberately removed are not silently re-granted.
    const seenBefore = existing.seededPermissions;
    const alreadySeeded = new Set(seenBefore ?? seed.permissions);
    const newlySeeded = seed.permissions.filter((p) => !alreadySeeded.has(p));

    const addToSet: Record<string, { $each: string[] }> = {
      seededPermissions: { $each: seed.permissions },
    };
    // Only permissions new to the catalog merge into existing system roles.
    if (newlySeeded.length > 0) {
      addToSet['permissions'] = { $each: newlySeeded };
    }

    await OrgRbacRoleModel.updateOne(filter, { $addToSet: addToSet });
  }
}

export async function listOrgRoles(scope: OrgRbacScope, orgId: string) {
  const docs = await OrgRbacRoleModel.find({ scope, orgId }).sort({ isSystem: -1, name: 1 });
  return docs.map(rolePublic);
}

export async function createOrgRole(input: {
  scope: OrgRbacScope;
  orgId: string;
  name: string;
  description?: string;
  permissions: string[];
  createdBy: string;
  assertPermissions: (keys: string[]) => string[];
}) {
  const permissions = input.assertPermissions(input.permissions);
  const baseSlug = slugify(input.name) || `role_${Date.now()}`;
  let slug = baseSlug;
  let n = 1;
  while (await OrgRbacRoleModel.exists({ scope: input.scope, orgId: input.orgId, slug })) {
    slug = `${baseSlug}_${n++}`;
  }

  const doc = await OrgRbacRoleModel.create({
    scope: input.scope,
    orgId: input.orgId,
    slug,
    name: input.name.trim(),
    description: (input.description || '').trim(),
    permissions,
    isSystem: false,
    isActive: true,
    createdBy: input.createdBy,
  });

  return rolePublic(doc);
}

export async function updateOrgRole(input: {
  scope: OrgRbacScope;
  orgId: string;
  roleId: string;
  name?: string;
  description?: string;
  permissions?: string[];
  isActive?: boolean;
  assertPermissions: (keys: string[]) => string[];
}) {
  const doc = await OrgRbacRoleModel.findOne({
    _id: input.roleId,
    scope: input.scope,
    orgId: input.orgId,
  });
  if (!doc) throw new NotFoundError('Role not found.');

  if (doc.isSystem) {
    if (input.permissions !== undefined) {
      doc.permissions = input.assertPermissions(input.permissions);
    }
    if (input.isActive !== undefined) doc.isActive = input.isActive;
  } else {
    if (input.name !== undefined) doc.name = input.name.trim();
    if (input.description !== undefined) doc.description = input.description.trim();
    if (input.permissions !== undefined) {
      doc.permissions = input.assertPermissions(input.permissions);
    }
    if (input.isActive !== undefined) doc.isActive = input.isActive;
  }

  await doc.save();
  return rolePublic(doc);
}

export async function getSubjectPermissionSet(input: {
  scope: OrgRbacScope;
  orgId: string;
  subjectId: string;
}): Promise<Set<string>> {
  const assignments = await OrgRbacAssignmentModel.find({
    scope: input.scope,
    orgId: input.orgId,
    subjectId: input.subjectId,
  }).lean();

  if (assignments.length === 0) return new Set();

  const roleIds = assignments.map((a) => a.roleId);
  const roles = await OrgRbacRoleModel.find({
    _id: { $in: roleIds },
    scope: input.scope,
    orgId: input.orgId,
    isActive: true,
  }).lean();

  const keys = new Set<string>();
  for (const role of roles) {
    for (const p of role.permissions || []) keys.add(p);
  }
  return keys;
}

export async function setSubjectRoles(input: {
  scope: OrgRbacScope;
  orgId: string;
  subjectId: string;
  roleIds: string[];
  assignedBy: string;
}): Promise<string[]> {
  const uniqueRoleIds = [...new Set(input.roleIds)];
  if (uniqueRoleIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new ValidationError('Invalid role id.');
  }

  const roles = await OrgRbacRoleModel.find({
    _id: { $in: uniqueRoleIds },
    scope: input.scope,
    orgId: input.orgId,
    isActive: true,
  });
  if (roles.length !== uniqueRoleIds.length) {
    throw new ValidationError('One or more roles are invalid for this organization.');
  }

  await OrgRbacAssignmentModel.deleteMany({
    scope: input.scope,
    orgId: input.orgId,
    subjectId: input.subjectId,
  });

  if (uniqueRoleIds.length > 0) {
    await OrgRbacAssignmentModel.insertMany(
      uniqueRoleIds.map((roleId) => ({
        scope: input.scope,
        orgId: input.orgId,
        subjectId: input.subjectId,
        roleId: new mongoose.Types.ObjectId(roleId),
        assignedBy: input.assignedBy,
      }))
    );
  }

  return uniqueRoleIds;
}

export async function listSubjectRoleIds(input: {
  scope: OrgRbacScope;
  orgId: string;
  subjectIds: string[];
}): Promise<Map<string, string[]>> {
  const rows = await OrgRbacAssignmentModel.find({
    scope: input.scope,
    orgId: input.orgId,
    subjectId: { $in: input.subjectIds },
  }).lean();

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.subjectId) || [];
    list.push(row.roleId.toString());
    map.set(row.subjectId, list);
  }
  return map;
}
