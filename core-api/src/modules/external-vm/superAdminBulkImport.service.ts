import mongoose from 'mongoose';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { hashPassword } from '../../utils/argon2';
import { encrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { ExternalVMModel } from './external-vm.model';
import { syncLegacyAssignedTenantUserId } from './externalVmTenantAssignment.service';
import {
  schedulesOverlap,
  type AssignmentSchedule,
} from './schedule.types';
import type {
  SuperAdminBulkImportAssignment,
  SuperAdminBulkImportExternalVmInput,
  SuperAdminBulkImportInlineUser,
  SuperAdminBulkImportRow,
} from './superAdminBulkImport.validation';

export interface SuperAdminBulkImportAssignmentResult {
  index: number;
  success: boolean;
  userId?: string;
  tenantUserId?: string;
  assignmentId?: string;
  error?: string;
}

export interface SuperAdminBulkImportRowResult {
  index: number;
  success: boolean;
  name?: string;
  ipAddress?: string;
  externalVmId?: string;
  tenantId?: string;
  tenantName?: string;
  /** Tenant-user id (extended flow). */
  userId?: string;
  userCreated?: boolean;
  userReused?: boolean;
  assignmentId?: string;
  error?: string;
  assignments: SuperAdminBulkImportAssignmentResult[];
}

export interface SuperAdminBulkImportResult {
  results: SuperAdminBulkImportRowResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

type ResolvedTarget =
  | { kind: 'tenant'; tenantId: mongoose.Types.ObjectId; label: string }
  | { kind: 'admin'; adminId: mongoose.Types.ObjectId };

type ResolvedTenant =
  | { tenantId: mongoose.Types.ObjectId; name: string; slug: string }
  | { error: string };

type UpsertTenantUserResult =
  | {
      tenantUserId: mongoose.Types.ObjectId;
      userCreated: boolean;
      userReused: boolean;
    }
  | { error: string };

function toSchedule(
  input: NonNullable<SuperAdminBulkImportAssignment['schedule']> | AssignmentSchedule
): AssignmentSchedule {
  return {
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    daysOfWeek: input.daysOfWeek,
    dailyStart: input.dailyStart,
    dailyEnd: input.dailyEnd,
    timezone: input.timezone || 'Asia/Kolkata',
  };
}

function findScheduleConflict(
  candidate: AssignmentSchedule | null | undefined,
  accepted: Array<{ index: number; schedule: AssignmentSchedule | null }>
): string | null {
  if (!candidate) return null;
  for (const prev of accepted) {
    if (!prev.schedule) continue;
    if (schedulesOverlap(candidate, prev.schedule)) {
      return `Schedule overlaps with assignment at index ${prev.index}`;
    }
  }
  return null;
}

class SuperAdminBulkImportService {
  async bulkImportAndAssign(
    input: SuperAdminBulkImportExternalVmInput,
    superAdminUserId: mongoose.Types.ObjectId
  ): Promise<SuperAdminBulkImportResult> {
    const results: SuperAdminBulkImportRowResult[] = [];

    for (let i = 0; i < input.vms.length; i++) {
      const row = input.vms[i]!;
      results.push(await this.processRow(i, row, superAdminUserId));
    }

    const succeeded = results.filter((r) => r.success).length;
    return {
      results,
      summary: {
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
      },
    };
  }

  private async processRow(
    index: number,
    row: SuperAdminBulkImportRow,
    superAdminUserId: mongoose.Types.ObjectId
  ): Promise<SuperAdminBulkImportRowResult> {
    const base: SuperAdminBulkImportRowResult = {
      index,
      success: false,
      name: row.name,
      ipAddress: row.ipAddress,
      assignments: [],
    };

    if (row.mode === 'extended') {
      return this.processExtendedRow(index, row, base, superAdminUserId);
    }

    return this.processLegacyRow(index, row, base, superAdminUserId);
  }

  private async processExtendedRow(
    index: number,
    row: Extract<SuperAdminBulkImportRow, { mode: 'extended' }>,
    base: SuperAdminBulkImportRowResult,
    superAdminUserId: mongoose.Types.ObjectId
  ): Promise<SuperAdminBulkImportRowResult> {
    try {
      const tenantResolved = await this.resolveTenantByName(row.tenantName);
      if ('error' in tenantResolved) {
        return { ...base, error: tenantResolved.error };
      }

      const { tenantId, name: tenantLabel, slug } = tenantResolved;
      let tenantUserId: mongoose.Types.ObjectId | undefined;
      let userCreated = false;
      let userReused = false;

      if (row.user) {
        const upsert = await this.upsertInlineTenantUser(
          tenantId,
          row.user,
          superAdminUserId
        );
        if ('error' in upsert) {
          return {
            ...base,
            tenantId: tenantId.toString(),
            tenantName: `${tenantLabel} (${slug})`,
            error: upsert.error,
          };
        }
        tenantUserId = upsert.tenantUserId;
        userCreated = upsert.userCreated;
        userReused = upsert.userReused;
      }

      const doc = await ExternalVMModel.create({
        name: row.name,
        ipAddress: row.ipAddress,
        protocol: row.protocol,
        username: row.username,
        password: encrypt(row.password),
        source: 'superadmin_bulk',
        tenantId,
      });

      let assignmentId: string | undefined;

      if (tenantUserId) {
        const schedule = row.schedule ? toSchedule(row.schedule) : null;
        try {
          const created = await ExternalVmTenantAssignmentModel.create({
            tenantId,
            externalVmId: doc._id,
            tenantUserId,
            schedule,
            status: 'active',
          });
          assignmentId = created._id.toString();
          if (schedule) {
            const { scheduleExternalAssignmentDisconnect } = await import(
              '../vmAccessSchedule/scheduleManager'
            );
            scheduleExternalAssignmentDisconnect({
              assignmentId: created._id.toString(),
              externalVmId: doc._id.toString(),
              assigneeUserId: tenantUserId.toString(),
              schedule,
              kind: 'tenant',
            });
          }
        } catch (err) {
          const message =
            err instanceof Error && (err as { code?: number }).code === 11000
              ? 'Assignment already exists for this tenant user'
              : err instanceof Error
                ? err.message
                : 'Failed to create tenant assignment';
          return {
            ...base,
            tenantId: tenantId.toString(),
            tenantName: `${tenantLabel} (${slug})`,
            userId: tenantUserId.toString(),
            userCreated,
            userReused,
            externalVmId: doc._id.toString(),
            error: message,
          };
        }

        await syncLegacyAssignedTenantUserId(tenantId, doc._id);
      }

      logger.info('[ExternalVM] Super-admin bulk import (extended tenant)', {
        index,
        externalVmId: doc._id.toString(),
        tenantId: tenantId.toString(),
        tenantName: tenantLabel,
        tenantUserId: tenantUserId?.toString(),
        userCreated,
        userReused,
        assignmentId,
        superAdminUserId: superAdminUserId.toString(),
      });

      return {
        ...base,
        success: true,
        externalVmId: doc._id.toString(),
        tenantId: tenantId.toString(),
        tenantName: `${tenantLabel} (${slug})`,
        ...(tenantUserId
          ? {
              userId: tenantUserId.toString(),
              userCreated,
              userReused,
              assignmentId,
            }
          : {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error creating external VM';
      logger.error('[ExternalVM] Super-admin extended bulk import row failed', {
        index,
        name: row.name,
        tenantName: row.tenantName,
        error: message,
      });
      return { ...base, error: message };
    }
  }

  private async processLegacyRow(
    index: number,
    row: Extract<SuperAdminBulkImportRow, { mode: 'legacy' }>,
    base: SuperAdminBulkImportRowResult,
    superAdminUserId: mongoose.Types.ObjectId
  ): Promise<SuperAdminBulkImportRowResult> {
    try {
      const resolvedTarget = await this.resolveTarget(row.target);
      if ('error' in resolvedTarget) {
        return { ...base, error: resolvedTarget.error };
      }

      if (resolvedTarget.kind === 'tenant') {
        const tenantId = resolvedTarget.tenantId;
        const doc = await ExternalVMModel.create({
          name: row.name,
          ipAddress: row.ipAddress,
          protocol: row.protocol,
          username: row.username,
          password: encrypt(row.password),
          source: 'superadmin_bulk',
          tenantId,
        });

        const assignmentResults = await this.applyTenantAssignments({
          externalVmId: doc._id,
          tenantId,
          assignments: row.assignments,
        });

        await syncLegacyAssignedTenantUserId(tenantId, doc._id);

        logger.info('[ExternalVM] Super-admin bulk import (tenant)', {
          externalVmId: doc._id.toString(),
          tenantId: tenantId.toString(),
          superAdminUserId: superAdminUserId.toString(),
          assignmentCount: assignmentResults.filter((a) => a.success).length,
        });

        return {
          ...base,
          success: true,
          externalVmId: doc._id.toString(),
          tenantId: tenantId.toString(),
          assignments: assignmentResults,
        };
      }

      const adminId = resolvedTarget.adminId;

      const doc = await ExternalVMModel.create({
        name: row.name,
        ipAddress: row.ipAddress,
        protocol: row.protocol,
        username: row.username,
        password: encrypt(row.password),
        source: 'superadmin_bulk',
        adminId,
      });

      const assignmentResults = await this.applyPlatformAssignments({
        externalVmId: doc._id,
        adminId,
        assignedBy: superAdminUserId,
        assignments: row.assignments,
      });

      const firstActive = assignmentResults.find((a) => a.success && a.userId);
      if (firstActive?.userId) {
        await ExternalVMModel.updateOne(
          { _id: doc._id },
          { $set: { assignedTo: new mongoose.Types.ObjectId(firstActive.userId) } }
        );
      }

      logger.info('[ExternalVM] Super-admin bulk import (platform)', {
        externalVmId: doc._id.toString(),
        adminId: adminId.toString(),
        superAdminUserId: superAdminUserId.toString(),
        assignmentCount: assignmentResults.filter((a) => a.success).length,
      });

      return {
        ...base,
        success: true,
        externalVmId: doc._id.toString(),
        assignments: assignmentResults,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error creating external VM';
      logger.error('[ExternalVM] Super-admin bulk import row failed', {
        index,
        name: row.name,
        error: message,
      });
      return { ...base, error: message };
    }
  }

  private async resolveTenantByName(tenantName: string): Promise<ResolvedTenant> {
    const needle = tenantName.trim();
    const byName = await Tenant.find({
      name: { $regex: new RegExp(`^${escapeRegex(needle)}$`, 'i') },
    })
      .select('_id name slug')
      .lean();

    if (byName.length === 1) {
      const t = byName[0]!;
      return { tenantId: t._id, name: t.name, slug: t.slug };
    }

    const slugNeedle = needle.toLowerCase();
    const bySlug = await Tenant.find({ slug: slugNeedle }).select('_id name slug').lean();

    if (bySlug.length === 1) {
      const t = bySlug[0]!;
      return { tenantId: t._id, name: t.name, slug: t.slug };
    }

    if (byName.length === 0 && bySlug.length === 0) {
      return { error: `Tenant not found: ${tenantName}` };
    }

    return { error: `Tenant ambiguous or not found: ${tenantName}` };
  }

  private async upsertInlineTenantUser(
    tenantId: mongoose.Types.ObjectId,
    user: SuperAdminBulkImportInlineUser,
    createdBy: mongoose.Types.ObjectId
  ): Promise<UpsertTenantUserResult> {
    const email = user.email.trim().toLowerCase();
    const username = user.username.trim().toLowerCase();

    const [byEmail, byUsername] = await Promise.all([
      TenantUser.findOne({ tenantId, email }).select('_id email username').lean(),
      TenantUser.findOne({ tenantId, username }).select('_id email username').lean(),
    ]);

    if (byEmail && byUsername && byEmail._id.toString() !== byUsername._id.toString()) {
      return {
        error: `Email ${email} and username ${username} belong to different tenant users`,
      };
    }

    const existing = byEmail ?? byUsername;
    if (existing) {
      const existingUsername = existing.username?.toLowerCase() ?? null;
      if (byEmail && existingUsername && existingUsername !== username) {
        return {
          error: `Email ${email} already exists in this tenant with username ${existing.username}`,
        };
      }
      if (byUsername && existing.email.toLowerCase() !== email) {
        return {
          error: `Username ${username} already exists in this tenant with email ${existing.email}`,
        };
      }
      return {
        tenantUserId: existing._id,
        userCreated: false,
        userReused: true,
      };
    }

    const usernameTaken = await TenantUser.findOne({ tenantId, username })
      .select('_id')
      .lean();
    if (usernameTaken) {
      return { error: `Username ${username} already exists in this tenant` };
    }

    const emailTaken = await TenantUser.findOne({ tenantId, email }).select('_id').lean();
    if (emailTaken) {
      return { error: `Email ${email} already exists in this tenant` };
    }

    try {
      const created = await TenantUser.create({
        tenantId,
        email,
        username,
        passwordHash: await hashPassword(user.password),
        role: 'tenant_user',
        isActive: true,
        isEmailVerified: true,
        mustSetPassword: false,
        createdBy,
      });
      return {
        tenantUserId: created._id,
        userCreated: true,
        userReused: false,
      };
    } catch (err) {
      if (err instanceof Error && (err as { code?: number }).code === 11000) {
        return {
          error: 'Tenant user email or username conflict in this tenant',
        };
      }
      throw err;
    }
  }

  private async resolveTarget(
    target: Extract<SuperAdminBulkImportRow, { mode: 'legacy' }>['target']
  ): Promise<ResolvedTarget | { error: string }> {
    if (target.tenantId) {
      const tenant = await Tenant.findById(target.tenantId).select('_id slug name').lean();
      if (!tenant) {
        return { error: `Tenant not found: ${target.tenantId}` };
      }
      return {
        kind: 'tenant',
        tenantId: tenant._id,
        label: tenant.name,
      };
    }

    if (target.tenantSlug) {
      const slug = target.tenantSlug.trim().toLowerCase();
      const tenant = await Tenant.findOne({ slug }).select('_id slug name').lean();
      if (!tenant) {
        return { error: `Tenant not found for slug: ${target.tenantSlug}` };
      }
      return {
        kind: 'tenant',
        tenantId: tenant._id,
        label: tenant.name,
      };
    }

    if (target.adminId) {
      const admin = await User.findById(target.adminId).select('_id role email').lean();
      if (!admin) {
        return { error: `Admin not found: ${target.adminId}` };
      }
      if (admin.role !== 'admin') {
        return { error: `Target adminId must be role=admin (got ${admin.role})` };
      }
      return {
        kind: 'admin',
        adminId: admin._id,
      };
    }

    if (target.adminEmail) {
      const email = target.adminEmail.trim().toLowerCase();
      const admin = await User.findOne({ email, role: 'admin' }).select('_id email').lean();
      if (!admin) {
        return { error: `Admin not found for email: ${target.adminEmail}` };
      }
      return {
        kind: 'admin',
        adminId: admin._id,
      };
    }

    return { error: 'Target is required.' };
  }

  private async applyTenantAssignments(input: {
    externalVmId: mongoose.Types.ObjectId;
    tenantId: mongoose.Types.ObjectId;
    assignments: SuperAdminBulkImportAssignment[];
  }): Promise<SuperAdminBulkImportAssignmentResult[]> {
    const results: SuperAdminBulkImportAssignmentResult[] = [];
    const accepted: Array<{ index: number; schedule: AssignmentSchedule | null }> = [];

    for (let i = 0; i < input.assignments.length; i++) {
      const a = input.assignments[i]!;
      const schedule = a.schedule ? toSchedule(a.schedule) : null;

      const conflict = findScheduleConflict(schedule, accepted);
      if (conflict) {
        results.push({
          index: i,
          success: false,
          tenantUserId: a.tenantUserId,
          error: conflict,
        });
        continue;
      }

      const tenantUser = await this.resolveTenantAssignmentUser(input.tenantId, a);

      if (!tenantUser) {
        results.push({
          index: i,
          success: false,
          tenantUserId: a.tenantUserId,
          error: this.describeTenantAssignmentNotFound(a),
        });
        continue;
      }

      try {
        const created = await ExternalVmTenantAssignmentModel.create({
          tenantId: input.tenantId,
          externalVmId: input.externalVmId,
          tenantUserId: tenantUser._id,
          schedule,
          status: 'active',
        });
        if (schedule) {
          const { scheduleExternalAssignmentDisconnect } = await import(
            '../vmAccessSchedule/scheduleManager'
          );
          scheduleExternalAssignmentDisconnect({
            assignmentId: created._id.toString(),
            externalVmId: input.externalVmId.toString(),
            assigneeUserId: tenantUser._id.toString(),
            schedule,
            kind: 'tenant',
          });
        }
        accepted.push({ index: i, schedule });
        results.push({
          index: i,
          success: true,
          tenantUserId: tenantUser._id.toString(),
          assignmentId: created._id.toString(),
        });
      } catch (err) {
        const message =
          err instanceof Error && (err as { code?: number }).code === 11000
            ? `Assignment already exists for tenant user ${tenantUser._id.toString()}`
            : err instanceof Error
              ? err.message
              : 'Failed to create tenant assignment';
        results.push({
          index: i,
          success: false,
          tenantUserId: tenantUser._id.toString(),
          error: message,
        });
      }
    }

    return results;
  }

  private async applyPlatformAssignments(input: {
    externalVmId: mongoose.Types.ObjectId;
    adminId: mongoose.Types.ObjectId;
    assignedBy: mongoose.Types.ObjectId;
    assignments: SuperAdminBulkImportAssignment[];
  }): Promise<SuperAdminBulkImportAssignmentResult[]> {
    const results: SuperAdminBulkImportAssignmentResult[] = [];
    const accepted: Array<{ index: number; schedule: AssignmentSchedule | null }> = [];

    for (let i = 0; i < input.assignments.length; i++) {
      const a = input.assignments[i]!;
      const schedule = a.schedule ? toSchedule(a.schedule) : null;

      const conflict = findScheduleConflict(schedule, accepted);
      if (conflict) {
        results.push({ index: i, success: false, userId: a.userId, error: conflict });
        continue;
      }

      const user = await this.resolvePlatformAssignmentUser(input.adminId, a);

      if (!user) {
        results.push({
          index: i,
          success: false,
          userId: a.userId,
          error: this.describePlatformAssignmentNotFound(a),
        });
        continue;
      }

      try {
        const created = await ExternalVmUserAssignmentModel.create({
          externalVmId: input.externalVmId,
          userId: user._id,
          adminId: input.adminId,
          schedule,
          status: 'active',
          assignedBy: input.assignedBy,
        });
        if (schedule) {
          const { scheduleExternalAssignmentDisconnect } = await import(
            '../vmAccessSchedule/scheduleManager'
          );
          scheduleExternalAssignmentDisconnect({
            assignmentId: created._id.toString(),
            externalVmId: input.externalVmId.toString(),
            assigneeUserId: user._id.toString(),
            schedule,
            kind: 'platform',
          });
        }
        accepted.push({ index: i, schedule });
        results.push({
          index: i,
          success: true,
          userId: user._id.toString(),
          assignmentId: created._id.toString(),
        });
      } catch (err) {
        const message =
          err instanceof Error && (err as { code?: number }).code === 11000
            ? `Assignment already exists for user ${user._id.toString()}`
            : err instanceof Error
              ? err.message
              : 'Failed to create user assignment';
        results.push({
          index: i,
          success: false,
          userId: user._id.toString(),
          error: message,
        });
      }
    }

    return results;
  }

  private async resolveTenantAssignmentUser(
    tenantId: mongoose.Types.ObjectId,
    assignment: SuperAdminBulkImportAssignment
  ) {
    if (assignment.tenantUserId) {
      return TenantUser.findOne({
        _id: new mongoose.Types.ObjectId(assignment.tenantUserId),
        tenantId,
      })
        .select('_id')
        .lean();
    }

    if (assignment.tenantUserEmail) {
      return TenantUser.findOne({
        tenantId,
        email: assignment.tenantUserEmail.trim().toLowerCase(),
      })
        .select('_id')
        .lean();
    }

    return null;
  }

  private async resolvePlatformAssignmentUser(
    adminId: mongoose.Types.ObjectId,
    assignment: SuperAdminBulkImportAssignment
  ) {
    if (assignment.userId) {
      return User.findOne({
        _id: new mongoose.Types.ObjectId(assignment.userId),
        createdBy: adminId,
        role: 'user',
      })
        .select('_id')
        .lean();
    }

    if (assignment.userEmail) {
      return User.findOne({
        createdBy: adminId,
        role: 'user',
        email: assignment.userEmail.trim().toLowerCase(),
      })
        .select('_id')
        .lean();
    }

    if (assignment.userUsername) {
      return User.findOne({
        createdBy: adminId,
        role: 'user',
        username: assignment.userUsername.trim().toLowerCase(),
      })
        .select('_id')
        .lean();
    }

    return null;
  }

  private describeTenantAssignmentNotFound(assignment: SuperAdminBulkImportAssignment): string {
    if (assignment.tenantUserEmail) {
      return `Tenant user not found for email: ${assignment.tenantUserEmail}`;
    }
    if (assignment.tenantUserId) {
      return `Tenant user not found in this tenant: ${assignment.tenantUserId}`;
    }
    return 'Tenant user identifier did not match any user in this tenant.';
  }

  private describePlatformAssignmentNotFound(assignment: SuperAdminBulkImportAssignment): string {
    if (assignment.userEmail) {
      return `Managed user not found for email: ${assignment.userEmail}`;
    }
    if (assignment.userUsername) {
      return `Managed user not found for username: ${assignment.userUsername}`;
    }
    if (assignment.userId) {
      return `Managed user not found under this admin: ${assignment.userId}`;
    }
    return 'Managed user identifier did not match any user under this admin.';
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const superAdminBulkImportService = new SuperAdminBulkImportService();
