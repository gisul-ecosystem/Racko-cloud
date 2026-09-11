/**
 * Projects super-admin inventory grants into the elastic-server (ExternalVM)
 * collections that the end-user portals actually read.
 *
 * The inventory keeps machines in `servers` + `server_credentials` and grants in
 * `credential_assignments`. No tenant- or user-facing endpoint reads those, so a
 * grant is invisible to the person it was made for until it is mirrored here.
 * Mirroring — rather than teaching those portals a second data model — reuses
 * the list, console, login gate and per-row access checks unchanged.
 *
 * One mirror VM per login, not per machine: ExternalVM carries its username and
 * password inline, so a box with three logins mirrors as three records, which is
 * how the elastic-server import has always represented multi-login machines.
 */
import mongoose from 'mongoose';
import { ExternalVMModel } from '../external-vm/external-vm.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import {
  DEFAULT_ASSIGNMENT_TIMEZONE,
  type AssignmentSchedule,
} from '../external-vm/schedule.types';
import { CredentialAssignmentModel } from '../../models/credentialAssignment.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import { ServerModel } from '../../models/server.model';
import { ProjectModel } from '../../models/project.model';
import { WEEKDAY_NAMES, type WeeklyScheduleDay } from '../vmAccessSchedule/weeklySchedule';
import { logger } from '../../utils/logger';

const MIRROR_SOURCE = 'superadmin_bulk' as const;

const FULL_DAY_START = '00:00';
const FULL_DAY_END = '23:59';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Collapse a weekly schedule into the single daily window the elastic-server
 * assignment model supports.
 *
 * `AssignmentSchedule` holds one window applied to a set of days, while the
 * inventory editor allows different windows per day. The mirror therefore takes
 * the widest window across the enabled days, which can only ever grant more time
 * than intended — never less. `isWeeklyScheduleLossy` reports when that happens
 * so the operator is told rather than silently over-granted.
 */
function collapseWeekly(
  weekly: WeeklyScheduleDay[]
): { daysOfWeek: number[]; dailyStart: string; dailyEnd: string } | null {
  const daysOfWeek: number[] = [];
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const day of weekly) {
    if (!day?.enabled || !Array.isArray(day.windows) || day.windows.length === 0) continue;
    const index = (WEEKDAY_NAMES as readonly string[]).indexOf(day.day);
    if (index === -1) continue;
    daysOfWeek.push(index);

    for (const w of day.windows) {
      if (!w?.start || !w?.end) continue;
      if (earliest === null || minutesOfDay(w.start) < minutesOfDay(earliest)) earliest = w.start;
      if (latest === null || minutesOfDay(w.end) > minutesOfDay(latest)) latest = w.end;
    }
  }

  if (daysOfWeek.length === 0 || earliest === null || latest === null) return null;
  return { daysOfWeek, dailyStart: earliest, dailyEnd: latest };
}

/**
 * True when collapsing the weekly schedule widens it — more than one window on
 * any day, or days that don't share identical hours.
 */
export function isWeeklyScheduleLossy(weekly: unknown): boolean {
  if (!Array.isArray(weekly)) return false;
  const active = (weekly as WeeklyScheduleDay[]).filter(
    (d) => d?.enabled && Array.isArray(d.windows) && d.windows.length > 0
  );
  if (active.length === 0) return false;
  if (active.some((d) => d.windows.length > 1)) return true;

  const first = active[0]!.windows[0]!;
  return active.some((d) => d.windows[0]!.start !== first.start || d.windows[0]!.end !== first.end);
}

interface AssignmentScheduleSource {
  accessStartDate?: Date | null;
  accessEndDate?: Date | null;
  accessStartTime?: string | null;
  accessEndTime?: string | null;
  weeklySchedule?: unknown[] | null;
  weeklyScheduleTz?: string | null;
}

/**
 * Build the portal-side access window for one grant.
 *
 * The effective dates come from the project, which is what the inventory means
 * by "client start/end date" — so a mirror stops allowing access when the
 * engagement ends, with no extra bookkeeping. Missing hours means all day.
 */
function toAssignmentSchedule(
  assignment: AssignmentScheduleSource,
  project: { startDate?: Date | null; endDate?: Date | null }
): AssignmentSchedule | null {
  const effectiveFrom = assignment.accessStartDate ?? project.startDate ?? null;
  const effectiveTo = assignment.accessEndDate ?? project.endDate ?? null;
  // effectiveFrom is required by the schema; without it the window is unbounded.
  if (!effectiveFrom) return null;

  const weekly = Array.isArray(assignment.weeklySchedule)
    ? collapseWeekly(assignment.weeklySchedule as WeeklyScheduleDay[])
    : null;

  return {
    effectiveFrom,
    effectiveTo,
    daysOfWeek: weekly?.daysOfWeek ?? ALL_DAYS,
    dailyStart: weekly?.dailyStart ?? assignment.accessStartTime ?? FULL_DAY_START,
    dailyEnd: weekly?.dailyEnd ?? assignment.accessEndTime ?? FULL_DAY_END,
    timezone: assignment.weeklyScheduleTz || DEFAULT_ASSIGNMENT_TIMEZONE,
  };
}

/** Owner filter for a mirror record. Exactly one of the two is ever set. */
function ownerFilter(assignment: {
  adminId?: mongoose.Types.ObjectId | null;
  tenantId?: mongoose.Types.ObjectId | null;
}): Record<string, unknown> {
  return assignment.tenantId
    ? { tenantId: assignment.tenantId }
    : { adminId: assignment.adminId };
}

class InventoryExternalVmMirrorService {
  /**
   * Create or refresh the portal-visible records for the given inventory
   * assignments. Safe to call repeatedly: every write is an upsert keyed by
   * owner + IP + username, so a re-run reconciles instead of duplicating.
   */
  async syncAssignments(assignmentIds: mongoose.Types.ObjectId[]): Promise<void> {
    if (assignmentIds.length === 0) return;

    const assignments = await CredentialAssignmentModel.find({
      _id: { $in: assignmentIds },
      status: 'active',
    }).lean();
    if (assignments.length === 0) return;

    const [credentials, servers, projects] = await Promise.all([
      ServerCredentialModel.find({ _id: { $in: assignments.map((a) => a.credentialId) } })
        .select('_id username password')
        .lean(),
      ServerModel.find({ _id: { $in: assignments.map((a) => a.serverId) } })
        .select('_id ipAddress vmType')
        .lean(),
      ProjectModel.find({ _id: { $in: assignments.map((a) => a.projectId) } })
        .select('_id startDate endDate')
        .lean(),
    ]);

    const credById = new Map(credentials.map((c) => [c._id.toString(), c]));
    const serverById = new Map(servers.map((s) => [s._id.toString(), s]));
    const projectById = new Map(projects.map((p) => [p._id.toString(), p]));

    const failures: string[] = [];
    for (const assignment of assignments) {
      try {
        const cred = credById.get(assignment.credentialId.toString());
        const server = serverById.get(assignment.serverId.toString());
        if (!cred || !server) {
          failures.push(assignment._id.toString());
          logger.warn('[InventoryMirror] Missing credential or server for assignment', {
            assignmentId: assignment._id.toString(),
            credentialId: assignment.credentialId.toString(),
            serverId: assignment.serverId.toString(),
          });
          continue;
        }

        if (assignment.assigneeType === 'platform_user' && !assignment.adminId) {
          // ExternalVmUserAssignment requires an owning admin; without one the
          // platform "my assigned" query has nothing to scope by.
          logger.warn('[InventoryMirror] Skipped platform grant with no owning admin', {
            assignmentId: assignment._id.toString(),
          });
          continue;
        }
        if (assignment.assigneeType === 'tenant_user' && !assignment.tenantId) {
          logger.warn('[InventoryMirror] Skipped tenant grant with no tenantId', {
            assignmentId: assignment._id.toString(),
          });
          continue;
        }

        const project = projectById.get(assignment.projectId.toString());
        const schedule = toAssignmentSchedule(assignment, project ?? {});
        const protocol =
          server.vmType === 'rdp' || server.vmType === 'ssh' || server.vmType === 'vnc'
            ? server.vmType
            : 'rdp';

        const mirror = await ExternalVMModel.findOneAndUpdate(
          {
            source: MIRROR_SOURCE,
            ipAddress: server.ipAddress,
            username: cred.username,
            ...ownerFilter(assignment),
          },
          {
            $set: {
              name: `${cred.username}@${server.ipAddress}`,
              protocol,
              // Already AES-encrypted by the inventory with the same key, so the
              // ciphertext moves across as-is rather than being re-encrypted.
              password: cred.password,
              projectId: assignment.projectId,
              ...(assignment.assigneeType === 'tenant_user'
                ? { assignedTenantUserId: assignment.assigneeId }
                : { assignedTo: assignment.assigneeId }),
              updatedAt: new Date(),
            },
            $setOnInsert: {
              source: MIRROR_SOURCE,
              ipAddress: server.ipAddress,
              username: cred.username,
              ...ownerFilter(assignment),
            },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
        );

        if (!mirror) {
          failures.push(assignment._id.toString());
          continue;
        }

        const grant = {
          schedule,
          status: 'active' as const,
          accessOverride: Boolean(assignment.accessOverride),
          accessOverrideUntil: assignment.accessOverride
            ? assignment.accessOverrideUntil ?? null
            : null,
        };

        if (assignment.assigneeType === 'tenant_user') {
          await ExternalVmTenantAssignmentModel.updateOne(
            {
              tenantId: assignment.tenantId,
              externalVmId: mirror._id,
              tenantUserId: assignment.assigneeId,
            },
            { $set: grant, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
          );
        } else {
          await ExternalVmUserAssignmentModel.updateOne(
            { externalVmId: mirror._id, userId: assignment.assigneeId },
            {
              $set: { ...grant, adminId: assignment.adminId },
              $setOnInsert: {
                createdAt: new Date(),
                assignedBy: assignment.assignedBy ?? assignment.assigneeId,
              },
            },
            { upsert: true }
          );
        }
      } catch (err) {
        failures.push(assignment._id.toString());
        logger.error('[InventoryMirror] Failed to publish assignment to portal', {
          assignmentId: assignment._id.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (failures.length > 0 && failures.length === assignments.length) {
      throw new Error(
        `Portal mirror failed for all ${failures.length} assignment(s).`
      );
    }
  }

  /**
   * Withdraw portal access for one revoked grant.
   *
   * Access must never outlive the inventory grant, so the mirror row goes with
   * it, and the mirror VM itself is removed once nobody holds it — otherwise it
   * would linger as an unassigned elastic server in the owner's console.
   */
  async dropAssignment(assignment: {
    credentialId: mongoose.Types.ObjectId;
    serverId: mongoose.Types.ObjectId;
    assigneeType: 'platform_user' | 'tenant_user';
    assigneeId: mongoose.Types.ObjectId;
    adminId?: mongoose.Types.ObjectId | null;
    tenantId?: mongoose.Types.ObjectId | null;
  }): Promise<void> {
    const [cred, server] = await Promise.all([
      ServerCredentialModel.findById(assignment.credentialId).select('username').lean(),
      ServerModel.findById(assignment.serverId).select('ipAddress').lean(),
    ]);
    if (!cred || !server) return;

    const mirror = await ExternalVMModel.findOne({
      source: MIRROR_SOURCE,
      ipAddress: server.ipAddress,
      username: cred.username,
      ...ownerFilter(assignment),
    })
      .select('_id')
      .lean();
    if (!mirror) return;

    if (assignment.assigneeType === 'tenant_user') {
      await ExternalVmTenantAssignmentModel.deleteOne({
        externalVmId: mirror._id,
        tenantUserId: assignment.assigneeId,
      });
    } else {
      await ExternalVmUserAssignmentModel.deleteOne({
        externalVmId: mirror._id,
        userId: assignment.assigneeId,
      });
    }

    await this.dropOrphanMirror(mirror._id);
  }

  /**
   * Remove every mirror for machines leaving the inventory. Takes IPs because
   * the callers delete servers in bulk and already hold them.
   */
  async dropServersByIp(ipAddresses: string[]): Promise<void> {
    if (ipAddresses.length === 0) return;

    const mirrors = await ExternalVMModel.find({
      source: MIRROR_SOURCE,
      ipAddress: { $in: ipAddresses },
    })
      .select('_id')
      .lean();
    if (mirrors.length === 0) return;

    const ids = mirrors.map((m) => m._id);
    await Promise.all([
      ExternalVmTenantAssignmentModel.deleteMany({ externalVmId: { $in: ids } }),
      ExternalVmUserAssignmentModel.deleteMany({ externalVmId: { $in: ids } }),
      ExternalVMModel.deleteMany({ _id: { $in: ids } }),
    ]);
  }

  /**
   * Push an inventory login edit through to its mirrors. `previousUsername` is
   * required when the username changed, since mirrors are keyed by it.
   */
  async syncCredential(
    credentialId: mongoose.Types.ObjectId,
    previousUsername?: string
  ): Promise<void> {
    const cred = await ServerCredentialModel.findById(credentialId)
      .select('serverId username password')
      .lean();
    if (!cred) return;
    const server = await ServerModel.findById(cred.serverId).select('ipAddress').lean();
    if (!server) return;

    await ExternalVMModel.updateMany(
      {
        source: MIRROR_SOURCE,
        ipAddress: server.ipAddress,
        username: previousUsername ?? cred.username,
      },
      {
        $set: {
          username: cred.username,
          name: `${cred.username}@${server.ipAddress}`,
          password: cred.password,
          updatedAt: new Date(),
        },
      }
    );
  }

  /** Drop a mirror VM that no longer has any grant pointing at it. */
  private async dropOrphanMirror(mirrorId: mongoose.Types.ObjectId): Promise<void> {
    const [tenantGrants, userGrants] = await Promise.all([
      ExternalVmTenantAssignmentModel.countDocuments({ externalVmId: mirrorId }),
      ExternalVmUserAssignmentModel.countDocuments({ externalVmId: mirrorId }),
    ]);
    if (tenantGrants + userGrants > 0) return;
    await ExternalVMModel.deleteOne({ _id: mirrorId, source: MIRROR_SOURCE });
  }
}

export const inventoryExternalVmMirrorService = new InventoryExternalVmMirrorService();
