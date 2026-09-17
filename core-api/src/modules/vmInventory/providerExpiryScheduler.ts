import { config } from '../../config';
import { logger } from '../../utils/logger';
import { ServerModel } from '../../models/server.model';
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

let tickInProgress = false;

function daysUntil(endDate: Date, now: Date): number {
  const ms = startOfUtcDay(endDate).getTime() - startOfUtcDay(now).getTime();
  return Math.round(ms / 86_400_000);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface ProviderExpiryCheckResult {
  warningDays: number;
  vmsInWindow: number;
  projectsSent: number;
  vmsMarked: number;
  skipped: 'already_sent_today' | 'none_in_window' | 'already_alerted' | 'no_recipients' | 'send_failed' | null;
}

function emptyResult(
  warningDays: number,
  skipped: ProviderExpiryCheckResult['skipped'],
  vmsInWindow = 0
): ProviderExpiryCheckResult {
  return { warningDays, vmsInWindow, projectsSent: 0, vmsMarked: 0, skipped };
}

/**
 * Provider contract alerts: one digest of IP + provider end date.
 *
 * Project VM-ending mail is a separate flow. The hourly tick still mails each
 * VM once per end date; saving alert settings (`force`) sends the current
 * window again.
 */
export async function runProviderExpiryCheck(
  options?: { force?: boolean }
): Promise<ProviderExpiryCheckResult> {
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
    return emptyResult(warningDays, 'already_sent_today');
  }

  const expiring = await ServerModel.find({
    providerEndDate: { $gte: overdueFrom, $lt: until },
  })
    .select('ipAddress providerEndDate providerExpiryAlertSentFor')
    .lean();

  const due = force
    ? expiring.filter((s) => Boolean(s.providerEndDate))
    : expiring.filter(
        (s) =>
          s.providerEndDate &&
          (!s.providerExpiryAlertSentFor ||
            !isSameUtcDay(s.providerExpiryAlertSentFor, s.providerEndDate))
      );
  if (due.length === 0) {
    const skipped = expiring.length > 0 ? 'already_alerted' : 'none_in_window';
    logger.info('[ProviderExpiry] Nothing to send', {
      warningDays,
      today: todayYmd,
      scanned: expiring.length,
      force,
      skipped,
    });
    return emptyResult(warningDays, skipped, expiring.length);
  }

  const recipients = [
    ...new Set(settings.providerExpiryRecipients.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (recipients.length === 0) {
    logger.warn('[ProviderExpiry] Contracts are expiring but no recipients are configured', {
      vms: due.length,
    });
    return emptyResult(warningDays, 'no_recipients', expiring.length);
  }

  const sorted = [...due].sort((a, b) => {
    const byDate = a.providerEndDate!.getTime() - b.providerEndDate!.getTime();
    if (byDate !== 0) return byDate;
    return a.ipAddress.localeCompare(b.ipAddress);
  });

  const resources: ProviderExpiryResourceRow[] = sorted.map((server) => ({
    ipAddress: server.ipAddress,
    expiryDate: isoDate(server.providerEndDate!),
  }));
  const soonestEnd = sorted[0]!.providerEndDate!;

  const inventoryUrl = `${config.FRONTEND_URL.replace(/\/$/, '')}/super-admin-console/vm-inventory`;
  const brand = resolvePlatformEmailBrand();

  const sent = await Promise.all(
    recipients.map((to) =>
      sendProviderExpiryWarningEmail({
        to,
        resources,
        soonestDays: daysUntil(soonestEnd, now),
        soonestDateLabel: formatDateLabel(soonestEnd),
        inventoryUrl,
        brand,
      })
        .then(() => true)
        .catch((err: unknown) => {
          logger.warn('[ProviderExpiry] Email send failed', {
            to,
            error: err instanceof Error ? err.message : String(err),
          });
          return false;
        })
    )
  );

  if (!sent.some(Boolean)) {
    return emptyResult(warningDays, 'send_failed', expiring.length);
  }

  await ServerModel.bulkWrite(
    sorted.map((server) => ({
      updateOne: {
        filter: { _id: server._id },
        update: { $set: { providerExpiryAlertSentFor: server.providerEndDate } },
      },
    }))
  );

  settings.lastProviderExpiryAlertOn = todayYmd;
  await settings.save();

  logger.info('[ProviderExpiry] Sent contract expiry alerts', {
    vmsMarked: sorted.length,
    recipients: recipients.length,
    warningDays,
    today: todayYmd,
    force,
  });

  return {
    warningDays,
    vmsInWindow: expiring.length,
    projectsSent: 1,
    vmsMarked: sorted.length,
    skipped: null,
  };
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
