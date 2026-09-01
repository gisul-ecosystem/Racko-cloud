import mongoose from 'mongoose';
import { VM, type IVM } from '../vm/vm.model';
import { Token } from '../../models/token.model';
import {
  calendarDateInTimezone,
  clockTimeInTimezone,
} from '../vmAutomation/timezoneUtils';
import {
  checkWeeklyAccess,
  type WeeklyScheduleDay,
} from './weeklySchedule';
import { logger } from '../../utils/logger';
import { guacamoleClient } from '../../utils/guacamoleClient';
import {
  isAssignmentAccessAllowedNow,
  hasActiveAssignmentAccessOverride,
  msUntilNextWindowEnd,
  type AssignmentSchedule,
} from '../external-vm/schedule.types';

const DEFAULT_TZ = 'Asia/Kolkata';
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CLEANUP_ATTEMPTS = 3;

export interface AccessScheduleFields {
  accessStartDate?: Date | null;
  accessEndDate?: Date | null;
  accessStartTime?: string | null;
  accessEndTime?: string | null;
  accessOverride?: boolean;
  accessOverrideUntil?: Date | null;
  weeklySchedule?: WeeklyScheduleDay[] | null;
  weeklyScheduleTz?: string | null;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  error?: string;
  nextWindow?: string | null;
}

type ScheduleHandles = {
  timeout?: NodeJS.Timeout;
  cleanup?: NodeJS.Timeout;
  attempts: number;
};

/** In-memory: users blocked after schedule expiry until override / next window. */
const expiredUserIds = new Set<string>();

/** In-memory: per-VM / per-assignment disconnect timers. */
const scheduleMap = new Map<string, ScheduleHandles>();

function vmIdStr(vm: { _id?: mongoose.Types.ObjectId | string } | string): string {
  if (typeof vm === 'string') return vm;
  return vm._id?.toString() ?? '';
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function platformAssignmentTimerKey(assignmentId: string): string {
  return `ext-user-assign:${assignmentId}`;
}

function tenantAssignmentTimerKey(assignmentId: string): string {
  return `ext-tenant-assign:${assignmentId}`;
}

function guacConnectionNameForPlatformVm(vmId: string): string {
  return `vm-${vmId}`;
}

function guacConnectionNameForExternalVm(externalVmId: string): string {
  return `externalvm-${externalVmId}`;
}

/**
 * Kill live Guacamole tunnels for a named connection.
 * Matches activeConnections by connectionIdentifier (and optional Guac username).
 */
async function killGuacamoleSessionsForConnection(
  connectionName: string,
  options?: { username?: string }
): Promise<void> {
  try {
    const connectionIdentifier =
      await guacamoleClient.getConnectionIdentifierByName(connectionName);
    if (!connectionIdentifier) {
      logger.info('[accessSchedule] no Guacamole connection to kill', { connectionName });
      return;
    }

    const active = await guacamoleClient.listActiveConnections();
    const username = options?.username?.trim();
    const ids = active
      .filter((a) => a.connectionIdentifier === connectionIdentifier)
      .filter((a) => !username || a.username === username)
      .map((a) => a.identifier);

    if (ids.length === 0) {
      logger.info('[accessSchedule] no active Guacamole tunnels', {
        connectionName,
        connectionIdentifier,
      });
      return;
    }

    await guacamoleClient.killActiveConnections(ids);
    logger.info('[accessSchedule] Guacamole tunnels killed', {
      connectionName,
      connectionIdentifier,
      killed: ids.length,
    });
  } catch (err) {
    // Don't fail the disconnect path if Guac is down — JWT expiry still applied.
    logger.error('[accessSchedule] Guacamole kill failed', {
      connectionName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function hasScheduleRestriction(vm: AccessScheduleFields): boolean {
  if (Array.isArray(vm.weeklySchedule) && vm.weeklySchedule.length > 0) return true;
  return Boolean(
    vm.accessStartDate ||
      vm.accessEndDate ||
      vm.accessStartTime ||
      vm.accessEndTime
  );
}

export function hasActiveAccessOverride(
  vm: AccessScheduleFields,
  now: Date = new Date()
): boolean {
  if (!vm.accessOverride) return false;
  if (!vm.accessOverrideUntil) return true;
  return new Date(vm.accessOverrideUntil).getTime() > now.getTime();
}

function checkLegacyIstAccess(
  vm: AccessScheduleFields,
  now: Date = new Date()
): AccessCheckResult {
  const tz = DEFAULT_TZ;
  const today = calendarDateInTimezone(now, tz);
  const nowTime = clockTimeInTimezone(now, tz);

  if (vm.accessStartDate) {
    const start = calendarDateInTimezone(new Date(vm.accessStartDate), tz);
    if (today < start) {
      return {
        allowed: false,
        reason: 'before_start_date',
        error: `Access denied: before start date ${start}.`,
        nextWindow: `${start}${vm.accessStartTime ? ` ${vm.accessStartTime}` : ''}`,
      };
    }
  }

  if (vm.accessEndDate) {
    const end = calendarDateInTimezone(new Date(vm.accessEndDate), tz);
    if (today > end) {
      return {
        allowed: false,
        reason: 'after_end_date',
        error: `Access denied: after end date ${end}.`,
        nextWindow: null,
      };
    }
  }

  if (vm.accessStartTime && nowTime < vm.accessStartTime) {
    return {
      allowed: false,
      reason: 'before_start_time',
      error: `Access denied: before daily start ${vm.accessStartTime}.`,
      nextWindow: `today ${vm.accessStartTime}–${vm.accessEndTime || '23:59'}`,
    };
  }

  if (vm.accessEndTime && nowTime >= vm.accessEndTime) {
    return {
      allowed: false,
      reason: 'after_end_time',
      error: `Access denied: after daily end ${vm.accessEndTime}.`,
      nextWindow: null,
    };
  }

  return { allowed: true, reason: 'legacy_window' };
}

/**
 * Evaluate whether a VM is accessible right now.
 * Priority: active override → weekly schedule → legacy IST columns → unrestricted.
 */
export function checkAccessWindow(
  vm: AccessScheduleFields,
  now: Date = new Date()
): AccessCheckResult {
  if (hasActiveAccessOverride(vm, now)) {
    return {
      allowed: true,
      reason: vm.accessOverrideUntil ? 'override_until' : 'override_permanent',
    };
  }

  if (Array.isArray(vm.weeklySchedule) && vm.weeklySchedule.length > 0) {
    const weekly = checkWeeklyAccess(
      vm.weeklySchedule,
      vm.weeklyScheduleTz || DEFAULT_TZ,
      now
    );
    return {
      allowed: weekly.allowed,
      reason: weekly.reason,
      error: weekly.error,
      nextWindow: weekly.nextWindow ?? null,
    };
  }

  if (
    vm.accessStartDate ||
    vm.accessEndDate ||
    vm.accessStartTime ||
    vm.accessEndTime
  ) {
    return checkLegacyIstAccess(vm, now);
  }

  return { allowed: true, reason: 'no_restrictions' };
}

export function blockUserSession(userId: string): void {
  if (!userId) return;
  expiredUserIds.add(userId);
  logger.info('[accessSchedule] blockUserSession', { userId, reason: 'schedule_expired' });
}

export function unblockUserSession(userId: string): void {
  if (!userId) return;
  expiredUserIds.delete(userId);
  logger.info('[accessSchedule] unblockUserSession', { userId });
}

export function isUserSessionBlocked(userId: string): boolean {
  return expiredUserIds.has(userId);
}

/** Revoke all refresh tokens so portal sessions expire. */
export async function expirePortalSessions(userId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;
  await Token.updateMany(
    { userId: new mongoose.Types.ObjectId(userId), isRevoked: false },
    { $set: { isRevoked: true } }
  );
  logger.info('[accessSchedule] portal sessions expired', {
    userId,
    reason: 'schedule_expired',
  });
}

export function cancelSchedule(vmId: string): void {
  const handles = scheduleMap.get(vmId);
  if (!handles) return;
  if (handles.timeout) clearTimeout(handles.timeout);
  if (handles.cleanup) clearInterval(handles.cleanup);
  scheduleMap.delete(vmId);
}

/** Cancel a window-end timer for an ExternalVM assignment row. */
export function cancelExternalAssignmentTimer(
  assignmentId: string,
  kind: 'platform' | 'tenant'
): void {
  const key =
    kind === 'platform'
      ? platformAssignmentTimerKey(assignmentId)
      : tenantAssignmentTimerKey(assignmentId);
  cancelSchedule(key);
}

async function forceDisconnectForVm(vm: IVM, attempt: number): Promise<void> {
  const userId = vm.assignedTo?.toString();
  if (!userId) return;

  blockUserSession(userId);
  await expirePortalSessions(userId);
  await killGuacamoleSessionsForConnection(guacConnectionNameForPlatformVm(vm._id.toString()));

  logger.info('[accessSchedule] disconnect', {
    vmId: vm._id.toString(),
    userId,
    attempt,
    reason: 'schedule_expired',
  });
}

async function forceDisconnectForExternalAssignment(input: {
  timerKey: string;
  assigneeUserId: string;
  externalVmId: string;
  attempt: number;
  kind: 'platform' | 'tenant';
}): Promise<void> {
  blockUserSession(input.assigneeUserId);
  await expirePortalSessions(input.assigneeUserId);
  await killGuacamoleSessionsForConnection(
    guacConnectionNameForExternalVm(input.externalVmId)
  );

  logger.info('[accessSchedule] external assignment disconnect', {
    timerKey: input.timerKey,
    externalVmId: input.externalVmId,
    assigneeUserId: input.assigneeUserId,
    kind: input.kind,
    attempt: input.attempt,
    reason: 'assignment_schedule_expired',
  });
}

/**
 * Arm legacy end-of-day disconnect timer.
 * Only when accessEndTime exists AND weeklySchedule is null/empty.
 * Skips active overrides.
 */
export function scheduleDisconnect(vm: IVM): void {
  const id = vmIdStr(vm);
  cancelSchedule(id);

  if (hasActiveAccessOverride(vm)) return;
  if (Array.isArray(vm.weeklySchedule) && vm.weeklySchedule.length > 0) return;
  if (!vm.accessEndTime) return;

  const tz = DEFAULT_TZ;
  const now = new Date();
  const nowMins = minutesOfDay(clockTimeInTimezone(now, tz));
  const endMins = minutesOfDay(vm.accessEndTime);
  let delayMs = (endMins - nowMins) * 60 * 1000;

  // If already past today's end, schedule for next calendar day (+24h from midnight diff)
  if (delayMs <= 0) {
    delayMs += 24 * 60 * 60 * 1000;
  }

  const handles: ScheduleHandles = { attempts: 0 };

  handles.timeout = setTimeout(() => {
    void (async () => {
      try {
        const fresh = await VM.findById(vm._id);
        if (!fresh?.assignedTo) return;
        if (hasActiveAccessOverride(fresh)) return;
        // Re-check window — weekly may have been set
        if (Array.isArray(fresh.weeklySchedule) && fresh.weeklySchedule.length > 0) return;

        const check = checkAccessWindow(fresh);
        if (check.allowed) return;

        await forceDisconnectForVm(fresh, 1);

        handles.attempts = 1;
        handles.cleanup = setInterval(() => {
          void (async () => {
            handles.attempts += 1;
            const again = await VM.findById(vm._id);
            if (!again?.assignedTo || hasActiveAccessOverride(again)) {
              cancelSchedule(id);
              return;
            }
            const stillDenied = !checkAccessWindow(again).allowed;
            if (!stillDenied) {
              cancelSchedule(id);
              return;
            }
            await forceDisconnectForVm(again, handles.attempts);
            if (handles.attempts >= MAX_CLEANUP_ATTEMPTS) {
              cancelSchedule(id);
            }
          })();
        }, CLEANUP_INTERVAL_MS);
        scheduleMap.set(id, handles);
      } catch (err) {
        logger.error('[accessSchedule] scheduleDisconnect handler failed', {
          vmId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, delayMs);

  scheduleMap.set(id, handles);
  logger.info('[accessSchedule] scheduleDisconnect armed', {
    vmId: id,
    delayMs,
    accessEndTime: vm.accessEndTime,
  });
}

type ExternalAssignmentArmInput = {
  assignmentId: string;
  externalVmId: string;
  assigneeUserId: string;
  schedule: AssignmentSchedule;
  kind: 'platform' | 'tenant';
};

/**
 * Arm a window-end disconnect timer for one ExternalVM assignment row.
 */
export function scheduleExternalAssignmentDisconnect(input: ExternalAssignmentArmInput): void {
  const timerKey =
    input.kind === 'platform'
      ? platformAssignmentTimerKey(input.assignmentId)
      : tenantAssignmentTimerKey(input.assignmentId);

  cancelSchedule(timerKey);

  void (async () => {
    const overrideActive = await loadAssignmentOverrideActive(input.kind, input.assignmentId);
    if (overrideActive) {
      logger.info('[accessSchedule] assignment disconnect skipped (override active)', {
        timerKey,
        externalVmId: input.externalVmId,
      });
      return;
    }
    armExternalAssignmentDisconnectTimer(input, timerKey);
  })();
}

function armExternalAssignmentDisconnectTimer(
  input: ExternalAssignmentArmInput,
  timerKey: string
): void {
  const { assignmentId, externalVmId, assigneeUserId, kind, schedule } = input;
  const delayMs = msUntilNextWindowEnd(schedule);
  if (delayMs == null || delayMs <= 0) {
    logger.info('[accessSchedule] assignment disconnect not armed (no upcoming window end)', {
      timerKey,
      externalVmId,
    });
    return;
  }

  const handles: ScheduleHandles = { attempts: 0 };

  handles.timeout = setTimeout(() => {
    void (async () => {
      try {
        const stillAllowed = await loadAssignmentStillAllowed(kind, assignmentId);
        if (stillAllowed === null) {
          cancelSchedule(timerKey);
          return;
        }
        if (stillAllowed) {
          // Window still open (clock skew / schedule edit) — re-arm.
          const fresh = await loadAssignmentSchedule(kind, assignmentId);
          if (fresh) {
            scheduleExternalAssignmentDisconnect({
              assignmentId,
              externalVmId,
              assigneeUserId,
              schedule: fresh,
              kind,
            });
          }
          return;
        }

        await forceDisconnectForExternalAssignment({
          timerKey,
          assigneeUserId,
          externalVmId,
          attempt: 1,
          kind,
        });

        handles.attempts = 1;
        handles.cleanup = setInterval(() => {
          void (async () => {
            handles.attempts += 1;
            const allowed = await loadAssignmentStillAllowed(kind, assignmentId);
            if (allowed === null || allowed) {
              cancelSchedule(timerKey);
              if (allowed) {
                const fresh = await loadAssignmentSchedule(kind, assignmentId);
                if (fresh) {
                  scheduleExternalAssignmentDisconnect({
                    assignmentId,
                    externalVmId,
                    assigneeUserId,
                    schedule: fresh,
                    kind,
                  });
                }
              }
              return;
            }
            await forceDisconnectForExternalAssignment({
              timerKey,
              assigneeUserId,
              externalVmId,
              attempt: handles.attempts,
              kind,
            });
            if (handles.attempts >= MAX_CLEANUP_ATTEMPTS) {
              cancelSchedule(timerKey);
              const fresh = await loadAssignmentSchedule(kind, assignmentId);
              if (fresh) {
                scheduleExternalAssignmentDisconnect({
                  assignmentId,
                  externalVmId,
                  assigneeUserId,
                  schedule: fresh,
                  kind,
                });
              }
            }
          })();
        }, CLEANUP_INTERVAL_MS);
        scheduleMap.set(timerKey, handles);
      } catch (err) {
        logger.error('[accessSchedule] assignment disconnect handler failed', {
          timerKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, delayMs);

  scheduleMap.set(timerKey, handles);
  logger.info('[accessSchedule] assignment disconnect armed', {
    timerKey,
    externalVmId,
    assigneeUserId,
    kind,
    delayMs,
  });
}

async function loadAssignmentOverrideActive(
  kind: 'platform' | 'tenant',
  assignmentId: string
): Promise<boolean> {
  if (kind === 'platform') {
    const { ExternalVmUserAssignmentModel } = await import(
      '../../models/externalVmUserAssignment.model'
    );
    const row = await ExternalVmUserAssignmentModel.findById(assignmentId)
      .select('accessOverride accessOverrideUntil status')
      .lean();
    if (!row || (row.status != null && row.status !== 'active')) return false;
    return hasActiveAssignmentAccessOverride(row);
  }

  const { ExternalVmTenantAssignmentModel } = await import(
    '../../models/externalVmTenantAssignment.model'
  );
  const row = await ExternalVmTenantAssignmentModel.findById(assignmentId)
    .select('accessOverride accessOverrideUntil status')
    .lean();
  if (!row || (row.status != null && row.status !== 'active')) return false;
  return hasActiveAssignmentAccessOverride(row);
}

async function loadAssignmentSchedule(
  kind: 'platform' | 'tenant',
  assignmentId: string
): Promise<AssignmentSchedule | null> {
  if (kind === 'platform') {
    const { ExternalVmUserAssignmentModel } = await import(
      '../../models/externalVmUserAssignment.model'
    );
    const row = await ExternalVmUserAssignmentModel.findById(assignmentId)
      .select('schedule status')
      .lean();
    if (!row || (row.status != null && row.status !== 'active')) return null;
    return (row.schedule as AssignmentSchedule | null | undefined) ?? null;
  }

  const { ExternalVmTenantAssignmentModel } = await import(
    '../../models/externalVmTenantAssignment.model'
  );
  const row = await ExternalVmTenantAssignmentModel.findById(assignmentId)
    .select('schedule status')
    .lean();
  if (!row || (row.status != null && row.status !== 'active')) return null;
  return (row.schedule as AssignmentSchedule | null | undefined) ?? null;
}

/** true = still allowed, false = denied, null = assignment gone / inactive */
async function loadAssignmentStillAllowed(
  kind: 'platform' | 'tenant',
  assignmentId: string
): Promise<boolean | null> {
  if (kind === 'platform') {
    const { ExternalVmUserAssignmentModel } = await import(
      '../../models/externalVmUserAssignment.model'
    );
    const row = await ExternalVmUserAssignmentModel.findById(assignmentId)
      .select('schedule status accessOverride accessOverrideUntil')
      .lean();
    if (!row || (row.status != null && row.status !== 'active')) return null;
    return isAssignmentAccessAllowedNow(row) ? true : false;
  }

  const { ExternalVmTenantAssignmentModel } = await import(
    '../../models/externalVmTenantAssignment.model'
  );
  const row = await ExternalVmTenantAssignmentModel.findById(assignmentId)
    .select('schedule status accessOverride accessOverrideUntil')
    .lean();
  if (!row || (row.status != null && row.status !== 'active')) return null;
  return isAssignmentAccessAllowedNow(row) ? true : false;
}

/**
 * Boot / recovery: re-arm disconnect timers for assigned user VMs with legacy endTime,
 * plus ExternalVmUserAssignment / ExternalVmTenantAssignment schedule window ends.
 */
export async function rescheduleFromDb(): Promise<void> {
  const vms = await VM.find({
    assignedTo: { $ne: null },
    accessEndTime: { $ne: null, $exists: true },
    $or: [
      { weeklySchedule: null },
      { weeklySchedule: { $exists: false } },
      { weeklySchedule: { $size: 0 } },
    ],
  });

  let armed = 0;
  for (const vm of vms) {
    if (hasActiveAccessOverride(vm)) continue;
    scheduleDisconnect(vm);
    armed += 1;
  }

  const { ExternalVmUserAssignmentModel } = await import(
    '../../models/externalVmUserAssignment.model'
  );
  const { ExternalVmTenantAssignmentModel } = await import(
    '../../models/externalVmTenantAssignment.model'
  );

  const platformAssignments = await ExternalVmUserAssignmentModel.find({
    schedule: { $ne: null, $exists: true },
    $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
  })
    .select('_id externalVmId userId schedule accessOverride accessOverrideUntil')
    .lean();

  let platformArmed = 0;
  for (const row of platformAssignments) {
    if (!row.schedule) continue;
    if (hasActiveAssignmentAccessOverride(row)) continue;
    scheduleExternalAssignmentDisconnect({
      assignmentId: row._id.toString(),
      externalVmId: row.externalVmId.toString(),
      assigneeUserId: row.userId.toString(),
      schedule: row.schedule,
      kind: 'platform',
    });
    platformArmed += 1;
  }

  const tenantAssignments = await ExternalVmTenantAssignmentModel.find({
    schedule: { $ne: null, $exists: true },
    $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
  })
    .select('_id externalVmId tenantUserId schedule accessOverride accessOverrideUntil')
    .lean();

  let tenantArmed = 0;
  for (const row of tenantAssignments) {
    if (!row.schedule) continue;
    if (hasActiveAssignmentAccessOverride(row)) continue;
    scheduleExternalAssignmentDisconnect({
      assignmentId: row._id.toString(),
      externalVmId: row.externalVmId.toString(),
      assigneeUserId: row.tenantUserId.toString(),
      schedule: row.schedule,
      kind: 'tenant',
    });
    tenantArmed += 1;
  }

  logger.info('[accessSchedule] rescheduleFromDb complete', {
    scanned: vms.length,
    armed,
    platformAssignments: platformAssignments.length,
    platformArmed,
    tenantAssignments: tenantAssignments.length,
    tenantArmed,
  });
}

/**
 * Login / console gate for platform role=user: every restricted assigned VM must pass.
 * Also checks ExternalVmUserAssignment schedules for elastic servers.
 */
export async function assertUserAssignedVmsAccessible(
  userId: string
): Promise<AccessCheckResult> {
  const userOid = new mongoose.Types.ObjectId(userId);
  const vms = await VM.find({ assignedTo: userOid }).lean();
  for (const vm of vms) {
    if (!hasScheduleRestriction(vm) && !vm.accessOverride) continue;
    const result = checkAccessWindow(vm);
    if (!result.allowed) return result;
  }

  const { ExternalVmUserAssignmentModel } = await import(
    '../../models/externalVmUserAssignment.model'
  );
  const { isAssignmentAccessAllowedNow, getNextAllowedAccessHint } = await import(
    '../external-vm/schedule.types'
  );
  const assignments = await ExternalVmUserAssignmentModel.find({
    userId: userOid,
    $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
  })
    .select('schedule accessOverride accessOverrideUntil')
    .lean();

  for (const row of assignments) {
    if (isAssignmentAccessAllowedNow(row)) continue;
    const next = getNextAllowedAccessHint(row.schedule ?? null);
    return {
      allowed: false,
      reason: 'outside_assignment_window',
      error: next
        ? `Access denied: outside your access window. Next allowed: ${next}.`
        : 'Access denied: outside your access window.',
      nextWindow: next,
    };
  }

  return { allowed: true, reason: 'all_vms_ok' };
}

/**
 * Login / session gate for tenant_user: every restricted assigned tenant VM
 * and elastic server must pass.
 * Elastic servers use ExternalVmTenantAssignment.schedule (not ExternalVM fields).
 */
export async function assertTenantUserAssignedVmsAccessible(
  tenantUserId: string
): Promise<AccessCheckResult> {
  const tenantUserOid = new mongoose.Types.ObjectId(tenantUserId);
  const vms = await VM.find({
    assignedTenantUserId: tenantUserOid,
  }).lean();
  for (const vm of vms) {
    if (!hasScheduleRestriction(vm) && !vm.accessOverride) continue;
    const result = checkAccessWindow(vm);
    if (!result.allowed) return result;
  }

  const { ExternalVmTenantAssignmentModel } = await import(
    '../../models/externalVmTenantAssignment.model'
  );
  const { isAssignmentAccessAllowedNow, getNextAllowedAccessHint } = await import(
    '../external-vm/schedule.types'
  );
  const assignments = await ExternalVmTenantAssignmentModel.find({
    tenantUserId: tenantUserOid,
    $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
  })
    .select('schedule accessOverride accessOverrideUntil')
    .lean();

  for (const row of assignments) {
    if (isAssignmentAccessAllowedNow(row)) continue;
    const next = getNextAllowedAccessHint(row.schedule ?? null);
    return {
      allowed: false,
      reason: 'outside_assignment_window',
      error: next
        ? `Access denied: outside your access window. Next allowed: ${next}.`
        : 'Access denied: outside your access window.',
      nextWindow: next,
    };
  }

  return { allowed: true, reason: 'all_vms_ok' };
}

/**
 * Session poll: if user blocked AND no active override on any assigned VM → deny.
 */
export async function assertUserSessionNotExpired(userId: string): Promise<boolean> {
  if (!isUserSessionBlocked(userId)) return true;

  const vms = await VM.find({ assignedTo: new mongoose.Types.ObjectId(userId) }).lean();
  const anyOverride = vms.some((vm) => hasActiveAccessOverride(vm));
  if (anyOverride) {
    unblockUserSession(userId);
    return true;
  }

  const { ExternalVmUserAssignmentModel } = await import(
    '../../models/externalVmUserAssignment.model'
  );
  const platformAssignments = await ExternalVmUserAssignmentModel.find({
    userId: new mongoose.Types.ObjectId(userId),
    accessOverride: true,
    $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
  })
    .select('accessOverride accessOverrideUntil')
    .lean();
  if (platformAssignments.some((row) => hasActiveAssignmentAccessOverride(row))) {
    unblockUserSession(userId);
    return true;
  }

  const { ExternalVmTenantAssignmentModel } = await import(
    '../../models/externalVmTenantAssignment.model'
  );
  const tenantAssignments = await ExternalVmTenantAssignmentModel.find({
    tenantUserId: new mongoose.Types.ObjectId(userId),
    accessOverride: true,
    $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
  })
    .select('accessOverride accessOverrideUntil')
    .lean();
  if (tenantAssignments.some((row) => hasActiveAssignmentAccessOverride(row))) {
    unblockUserSession(userId);
    return true;
  }

  return false;
}

export async function assertVmAccessibleForUser(
  vm: AccessScheduleFields & { assignedTo?: mongoose.Types.ObjectId | null },
  userId: string,
  role: string
): Promise<AccessCheckResult> {
  if (role !== 'user') return { allowed: true, reason: 'admin_bypass' };
  if (vm.assignedTo && vm.assignedTo.toString() !== userId) {
    return { allowed: false, error: 'VM not assigned to this user.' };
  }
  if (isUserSessionBlocked(userId) && !hasActiveAccessOverride(vm)) {
    const stillOk = await assertUserSessionNotExpired(userId);
    if (!stillOk) {
      return {
        allowed: false,
        reason: 'session_blocked',
        error: 'Session blocked: access window expired.',
        nextWindow: checkAccessWindow(vm).nextWindow ?? null,
      };
    }
  }
  return checkAccessWindow(vm);
}
