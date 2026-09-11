import { config } from '../../config';
import { logger } from '../../utils/logger';
import { ServerModel } from '../../models/server.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import { CredentialAssignmentModel } from '../../models/credentialAssignment.model';
import { ProjectModel } from '../../models/project.model';
import { getVmInventorySettings, resolveProviderExpiryWarningDays } from '../../models/vmInventorySettings.model';
import { sendProviderExpiryWarningEmail } from '../../utils/email/sender';
import { resolvePlatformEmailBrand } from '../../utils/email/templates/emailBrand';
import type { ProviderExpiryResourceRow } from '../../utils/email/templates/providerExpiryWarning';
import {
  addUtcDays,
  formatProjectDateLabel as formatDateLabel,
  isSameUtcDay,
  startOfUtcDay,
} from '../projects/projectExpiryDates';
import { calendarDateInTimezone, parseDateOnlyUtc } from '../vmAutomation/timezoneUtils';

/** Operators pick calendar dates in India; "today" follows that, not UTC. */
const ALERT_TIMEZONE = 'Asia/Kolkata';
const UNASSIGNED_KEY = 'unassigned';

let tickInProgress = false;

function daysUntil(endDate: Date, now: Date): number {
  const ms = startOfUtcDay(endDate).getTime() - startOfUtcDay(now).getTime();
  return Math.round(ms / 86_400_000);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

interface ProjectExpiryGroup {
  key: string;
  projectName: string;
  clientName: string | null;
  resources: ProviderExpiryResourceRow[];
  serverIds: string[];
  soonestEnd: Date;
}

/**
 * Alerts the configured recipients, one email per project: the project name
 * and the inventory resources on it whose provider contract is ending.
 *
 * Each VM is mailed once for a given end date. Changing the lead-time
 * schedule can send immediately, but never for a contract already reported.
 */
export async function runProviderExpiryCheck(options?: { force?: boolean }): Promise<void> {
  const force = Boolean(options?.force);
  const now = new Date();
  const settings = await getVmInventorySettings();
  const warningDays = resolveProviderExpiryWarningDays(settings.warningDays);

  const todayYmd = calendarDateInTimezone(now, ALERT_TIMEZONE);
  const from = parseDateOnlyUtc(todayYmd);
  const until = addUtcDays(from, warningDays + 1);
  const overdueFrom = addUtcDays(from, -30);

  if (!force && settings.lastProviderExpiryAlertOn === todayYmd) {
    logger.info('[ProviderExpiry] Already sent today', { today: todayYmd });
    return;
  }

  const expiring = await ServerModel.find({
    providerEndDate: { $gte: overdueFrom, $lt: until },
  })
    .select(
      'ipAddress vmSpec planDuration providerEndDate providerExpiryAlertSentFor projectId'
    )
    .lean();

  const due = expiring.filter(
    (s) =>
      s.providerEndDate &&
      (!s.providerExpiryAlertSentFor ||
        !isSameUtcDay(s.providerExpiryAlertSentFor, s.providerEndDate))
  );
  if (due.length === 0) {
    if (expiring.length > 0) {
      logger.info('[ProviderExpiry] Window has contracts already alerted', {
        warningDays,
        today: todayYmd,
        scanned: expiring.length,
        force,
      });
    }
    return;
  }

  const recipients = [
    ...new Set(settings.providerExpiryRecipients.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (recipients.length === 0) {
    logger.warn('[ProviderExpiry] Contracts are expiring but no recipients are configured', {
      vms: due.length,
    });
    return;
  }

  const dueIds = due.map((s) => s._id);
  const [assignments, credentials] = await Promise.all([
    CredentialAssignmentModel.find({
      serverId: { $in: dueIds },
      status: 'active',
    })
      .select('serverId credentialId projectId')
      .lean(),
    ServerCredentialModel.find({ serverId: { $in: dueIds } })
      .select('_id serverId username')
      .lean(),
  ]);

  const credById = new Map(credentials.map((c) => [c._id.toString(), c]));
  const credsByServer = new Map<string, typeof credentials>();
  for (const cred of credentials) {
    const key = cred.serverId.toString();
    const list = credsByServer.get(key) ?? [];
    list.push(cred);
    credsByServer.set(key, list);
  }

  const asgsByServer = new Map<string, typeof assignments>();
  const projectIds = new Set<string>();
  for (const asg of assignments) {
    const key = asg.serverId.toString();
    const list = asgsByServer.get(key) ?? [];
    list.push(asg);
    asgsByServer.set(key, list);
    projectIds.add(asg.projectId.toString());
  }
  for (const server of due) {
    if (server.projectId) projectIds.add(server.projectId.toString());
  }

  const projects = projectIds.size
    ? await ProjectModel.find({ _id: { $in: [...projectIds] } })
        .select('name clientName')
        .lean()
    : [];
  const projectById = new Map(projects.map((p) => [p._id.toString(), p]));

  const groups = new Map<string, ProjectExpiryGroup>();

  const addResource = (
    key: string,
    projectName: string,
    clientName: string | null,
    server: (typeof due)[number],
    username: string
  ): void => {
    const existing = groups.get(key);
    const resource: ProviderExpiryResourceRow = {
      ipAddress: server.ipAddress,
      username,
      vmSpec: server.vmSpec ?? '',
      planDuration: server.planDuration ?? '',
      expiryDate: isoDate(server.providerEndDate!),
    };
    if (!existing) {
      groups.set(key, {
        key,
        projectName,
        clientName,
        resources: [resource],
        serverIds: [server._id.toString()],
        soonestEnd: server.providerEndDate!,
      });
      return;
    }
    existing.resources.push(resource);
    if (!existing.serverIds.includes(server._id.toString())) {
      existing.serverIds.push(server._id.toString());
    }
    if (server.providerEndDate! < existing.soonestEnd) {
      existing.soonestEnd = server.providerEndDate!;
    }
  };

  for (const server of due) {
    const serverKey = server._id.toString();
    const asgs = asgsByServer.get(serverKey) ?? [];
    if (asgs.length > 0) {
      for (const asg of asgs) {
        const project = projectById.get(asg.projectId.toString());
        const cred = credById.get(asg.credentialId.toString());
        addResource(
          asg.projectId.toString(),
          project?.name ?? 'Unknown project',
          project?.clientName ?? null,
          server,
          cred?.username ?? ''
        );
      }
      continue;
    }

    const fallbackId = server.projectId?.toString();
    const project = fallbackId ? projectById.get(fallbackId) : undefined;
    const groupKey = fallbackId && project ? fallbackId : UNASSIGNED_KEY;
    const logins = credsByServer.get(serverKey) ?? [];
    const usernames = logins.length > 0 ? logins.map((c) => c.username) : [''];
    for (const username of usernames) {
      addResource(
        groupKey,
        project?.name ?? 'Unassigned',
        project?.clientName ?? null,
        server,
        username
      );
    }
  }

  const inventoryUrl = `${config.FRONTEND_URL.replace(/\/$/, '')}/super-admin-console/vm-inventory`;
  const brand = resolvePlatformEmailBrand();
  const markedIds = new Set<string>();
  let anySent = false;

  for (const group of groups.values()) {
    const sent = await Promise.all(
      recipients.map((to) =>
        sendProviderExpiryWarningEmail({
          to,
          projectName: group.projectName,
          clientName: group.clientName,
          resources: group.resources,
          soonestDays: daysUntil(group.soonestEnd, now),
          soonestDateLabel: formatDateLabel(group.soonestEnd),
          inventoryUrl,
          brand,
        })
          .then(() => true)
          .catch((err: unknown) => {
            logger.warn('[ProviderExpiry] Email send failed', {
              to,
              project: group.projectName,
              error: err instanceof Error ? err.message : String(err),
            });
            return false;
          })
      )
    );

    if (!sent.some(Boolean)) continue;
    anySent = true;
    for (const id of group.serverIds) markedIds.add(id);
  }

  if (!anySent) return;

  const dueById = new Map(due.map((s) => [s._id.toString(), s]));
  await ServerModel.bulkWrite(
    [...markedIds].flatMap((id) => {
      const server = dueById.get(id);
      if (!server?.providerEndDate) return [];
      return [
        {
          updateOne: {
            filter: { _id: server._id },
            update: { $set: { providerExpiryAlertSentFor: server.providerEndDate } },
          },
        },
      ];
    })
  );

  settings.lastProviderExpiryAlertOn = todayYmd;
  await settings.save();

  logger.info('[ProviderExpiry] Sent contract expiry alerts', {
    projects: groups.size,
    vmsMarked: markedIds.size,
    recipients: recipients.length,
    warningDays,
    today: todayYmd,
    force,
  });
}

export function triggerProviderExpiryCheck(
  reason: string,
  options?: { force?: boolean }
): void {
  if (tickInProgress) {
    logger.info('[ProviderExpiry] Check already running', { reason });
    return;
  }
  tickInProgress = true;
  void runProviderExpiryCheck(options)
    .catch((err: unknown) => {
      logger.error('[ProviderExpiry] Scheduler tick failed', {
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      tickInProgress = false;
    });
}

export function startProviderExpiryScheduler(): void {
  const intervalMs = config.INVENTORY_PROVIDER_EXPIRY_CHECK_INTERVAL_MS;

  triggerProviderExpiryCheck('startup');
  setInterval(() => triggerProviderExpiryCheck('interval'), intervalMs);

  logger.info('[ProviderExpiry] Scheduler started', {
    intervalMs,
    timezone: ALERT_TIMEZONE,
  });
}
