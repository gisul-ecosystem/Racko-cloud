import crypto from 'crypto';
import mongoose from 'mongoose';
import { ServerModel } from '../../models/server.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import { CredentialAssignmentModel } from '../../models/credentialAssignment.model';
import { ProjectModel } from '../../models/project.model';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { hashPassword } from '../../utils/argon2';
import {
  parseAccessScheduleInput,
  type AccessScheduleInput,
} from '../vmAccessSchedule/accessScheduleParse';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { BulkAssignResult, BulkAssignRowResult } from './vmInventory.types';

/** Hard ceiling per request. Matches the elastic-server bulk assign cap. */
const MAX_ROWS = 250;

/**
 * Numbered emails from a base address: ("labuser@gmail.com", 3) → "labuser3@gmail.com".
 *
 * Deliberately identical to the rule used by the platform and tenant bulk-assign
 * flows — no zero-padding, series starts at 1 — so operators see one behaviour
 * across every bulk screen.
 */
export function buildSeriesEmail(base: string, index: number): string {
  const at = base.lastIndexOf('@');
  return `${base.slice(0, at)}${index}${base.slice(at)}`;
}

/** 12 chars, one of each class, crypto-random. Mirrors managedUsers.service. */
function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const pick = (set: string): string => set[crypto.randomInt(set.length)]!;

  const combined = [
    pick(upper),
    pick(lower),
    pick(digits),
    pick(symbols),
    ...Array.from({ length: 8 }, () => pick(all)),
  ];
  for (let i = combined.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [combined[i], combined[j]] = [combined[j]!, combined[i]!];
  }
  return combined.join('');
}

export interface BulkAssignInput {
  credentialIds: string[];
  targetType: 'admin' | 'tenant';
  targetId: string;
  projectId: string;
  emailPrefix: string;
  passwordMode: 'auto' | 'shared';
  sharedPassword?: string;
  accessSchedule?: AccessScheduleInput | null;
  dryRun: boolean;
  assignedBy: mongoose.Types.ObjectId;
}

class VmInventoryBulkAssignService {
  /**
   * Generate a numbered user per selected login and grant them one-to-one.
   *
   * Ordering is positional and stable: `credentialIds[i]` goes to the user built
   * from index `i + 1`. A row that fails does NOT shift the series, so the
   * mapping an operator saw in the preview always holds.
   *
   * `dryRun` performs every validation and collision check but writes nothing,
   * which matters because there is no rollback: a partially applied batch would
   * otherwise be painful to reconcile.
   */
  async run(input: BulkAssignInput): Promise<BulkAssignResult> {
    const {
      credentialIds,
      targetType,
      targetId,
      projectId,
      emailPrefix,
      passwordMode,
      sharedPassword,
      dryRun,
    } = input;

    if (credentialIds.length === 0) throw new ValidationError('No logins selected.');
    if (credentialIds.length > MAX_ROWS) {
      throw new ValidationError(`Bulk assign is capped at ${MAX_ROWS} logins per request.`);
    }
    if (passwordMode === 'shared' && !sharedPassword) {
      throw new ValidationError('sharedPassword is required when passwordMode is "shared".');
    }
    if (new Set(credentialIds).size !== credentialIds.length) {
      throw new ValidationError('The same login was selected more than once.');
    }

    // ── Target owner ─────────────────────────────────────────────────────
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      throw new ValidationError('Invalid targetId.');
    }
    let adminId: mongoose.Types.ObjectId | null = null;
    let tenantId: mongoose.Types.ObjectId | null = null;

    if (targetType === 'admin') {
      const admin = await User.findOne({ _id: targetId, role: 'admin' }).select('_id').lean();
      if (!admin) throw new NotFoundError('Admin not found.');
      adminId = admin._id;
    } else {
      const tenant = await Tenant.findById(targetId).select('_id').lean();
      if (!tenant) throw new NotFoundError('Tenant not found.');
      tenantId = tenant._id;
    }

    // ── Project (drives the client start/end dates shown in the inventory) ─
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      throw new ValidationError('Invalid projectId.');
    }
    const project = await ProjectModel.findById(projectId)
      .select('_id name status startDate endDate tenantId orgId')
      .lean();
    if (!project) throw new NotFoundError('Project not found.');
    if (project.status !== 'active') {
      throw new ValidationError('Project is archived and cannot accept new assignments.');
    }
    if (!project.startDate || !project.endDate) {
      throw new ValidationError(
        'Project has no start/end date. Set both on the project before assigning VMs to it.'
      );
    }

    // Schedule is validated up front so a bad window fails before any writes.
    const schedulePatch = parseAccessScheduleInput(input.accessSchedule ?? undefined);

    // ── Load the selected logins and their servers ───────────────────────
    const credObjectIds = credentialIds.map((id) => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError(`Invalid credentialId "${id}".`);
      }
      return new mongoose.Types.ObjectId(id);
    });

    const credentials = await ServerCredentialModel.find({ _id: { $in: credObjectIds } })
      .select('_id serverId username status')
      .lean();
    const credById = new Map(credentials.map((c) => [c._id.toString(), c]));

    const servers = await ServerModel.find({
      _id: { $in: [...new Set(credentials.map((c) => c.serverId.toString()))] },
    })
      .select('_id ipAddress adminId tenantId')
      .lean();
    const serverById = new Map(servers.map((s) => [s._id.toString(), s]));

    // ── Plan every row before touching the database ──────────────────────
    const rows: BulkAssignRowResult[] = [];
    /** Rows that passed planning and are ready to write, in series order. */
    const planned: Array<{
      rowIndex: number;
      credentialId: mongoose.Types.ObjectId;
      serverId: mongoose.Types.ObjectId;
      email: string;
      password: string;
    }> = [];

    const emails = credentialIds.map((_, i) => buildSeriesEmail(emailPrefix, i + 1).toLowerCase());

    // Collision checks in bulk rather than per row.
    const existingEmails = new Set(
      targetType === 'admin'
        ? (await User.find({ email: { $in: emails } }).select('email').lean()).map((u) =>
            u.email.toLowerCase()
          )
        : (
            await TenantUser.find({ tenantId, email: { $in: emails } })
              .select('email')
              .lean()
          ).map((u) => u.email.toLowerCase())
    );

    const alreadyAssigned = new Set(
      (
        await CredentialAssignmentModel.find({
          credentialId: { $in: credObjectIds },
          status: 'active',
        })
          .select('credentialId')
          .lean()
      ).map((a) => a.credentialId.toString())
    );

    for (let i = 0; i < credentialIds.length; i += 1) {
      const credentialId = credentialIds[i]!;
      const email = emails[i]!;
      const cred = credById.get(credentialId);

      const fail = (error: string, ipAddress: string | null, username: string | null): void => {
        rows.push({
          index: i,
          credentialId,
          ipAddress,
          username,
          email,
          password: null,
          status: 'failed',
          error,
        });
      };

      if (!cred) {
        fail('Login no longer exists.', null, null);
        continue;
      }
      const server = serverById.get(cred.serverId.toString());
      if (!server) {
        fail('Server no longer exists.', null, cred.username);
        continue;
      }
      if (cred.status !== 'active') {
        fail('Login is disabled.', server.ipAddress, cred.username);
        continue;
      }
      if (alreadyAssigned.has(credentialId)) {
        fail('Login is already assigned to someone.', server.ipAddress, cred.username);
        continue;
      }
      if (existingEmails.has(email)) {
        fail(`${email} already exists.`, server.ipAddress, cred.username);
        continue;
      }
      // Ownership must not straddle: a server already held by one owner cannot
      // be handed to another through a bulk run.
      if (targetType === 'tenant' && server.adminId) {
        fail('Server is owned by a platform admin.', server.ipAddress, cred.username);
        continue;
      }
      if (targetType === 'admin' && server.tenantId) {
        fail('Server is owned by a tenant.', server.ipAddress, cred.username);
        continue;
      }
      if (targetType === 'tenant' && server.tenantId && !server.tenantId.equals(tenantId!)) {
        fail('Server belongs to a different tenant.', server.ipAddress, cred.username);
        continue;
      }
      if (targetType === 'admin' && server.adminId && !server.adminId.equals(adminId!)) {
        fail('Server belongs to a different admin.', server.ipAddress, cred.username);
        continue;
      }

      const password = passwordMode === 'shared' ? sharedPassword! : generateSecurePassword();

      rows.push({
        index: i,
        credentialId,
        ipAddress: server.ipAddress,
        username: cred.username,
        email,
        password,
        status: dryRun ? 'ready' : 'assigned',
      });
      planned.push({
        rowIndex: rows.length - 1,
        credentialId: cred._id,
        serverId: server._id,
        email,
        password,
      });
    }

    const summary = (): BulkAssignResult['summary'] => ({
      total: credentialIds.length,
      assigned: rows.filter((r) => r.status === 'assigned').length,
      ready: rows.filter((r) => r.status === 'ready').length,
      failed: rows.filter((r) => r.status === 'failed').length,
    });

    if (dryRun || planned.length === 0) {
      return { rows, summary: summary(), projectName: project.name, dryRun };
    }

    // ── Apply ────────────────────────────────────────────────────────────
    // Users first, so an assignment never points at a user that failed to save.
    const createdUserIds = new Map<string, mongoose.Types.ObjectId>();

    if (targetType === 'admin') {
      const docs = await User.create(
        planned.map((p) => ({
          email: p.email,
          password: p.password, // hashed by the User pre('save') hook
          role: 'user',
          isEmailVerified: true,
          isActive: true,
          createdBy: adminId,
        }))
      );
      docs.forEach((d) => createdUserIds.set(d.email.toLowerCase(), d._id));
    } else {
      const docs = await TenantUser.insertMany(
        await Promise.all(
          planned.map(async (p) => ({
            tenantId,
            email: p.email,
            passwordHash: await hashPassword(p.password),
            role: 'tenant_user',
            isActive: true,
            isEmailVerified: true,
            createdBy: input.assignedBy,
          }))
        )
      );
      docs.forEach((d) => createdUserIds.set(d.email.toLowerCase(), d._id));
    }

    await CredentialAssignmentModel.insertMany(
      planned.map((p) => ({
        credentialId: p.credentialId,
        serverId: p.serverId,
        assigneeType: targetType === 'admin' ? 'platform_user' : 'tenant_user',
        assigneeId: createdUserIds.get(p.email)!,
        adminId,
        tenantId,
        projectId: new mongoose.Types.ObjectId(projectId),
        status: 'active',
        assignedBy: input.assignedBy,
        ...schedulePatch,
      }))
    );

    // Adopt ownership on the servers that were still in the free pool.
    const serverIds = [...new Set(planned.map((p) => p.serverId.toString()))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    await ServerModel.updateMany(
      { _id: { $in: serverIds }, adminId: null, tenantId: null },
      { $set: { adminId, tenantId } }
    );

    return { rows, summary: summary(), projectName: project.name, dryRun };
  }
}

export const vmInventoryBulkAssignService = new VmInventoryBulkAssignService();
