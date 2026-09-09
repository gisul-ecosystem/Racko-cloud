import * as XLSX from 'xlsx';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { ServerModel } from '../../models/server.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import { getVmInventorySettings } from '../../models/vmInventorySettings.model';
import { sendProviderExpiryWarningEmail, type EmailAttachment } from '../../utils/email/sender';
import { resolvePlatformEmailBrand } from '../../utils/email/templates/emailBrand';
import {
  addUtcDays,
  formatProjectDateLabel as formatDateLabel,
  startOfUtcDay,
} from '../projects/projectExpiryDates';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let tickInProgress = false;

function daysUntil(endDate: Date, now: Date): number {
  const ms = startOfUtcDay(endDate).getTime() - startOfUtcDay(now).getTime();
  return Math.round(ms / 86_400_000);
}

/** YYYY-MM-DD, matching the import template so the sheet can be edited and re-imported. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

interface SheetRow {
  IP: string;
  Username: string;
  'VM Spec': string;
  'Plan Duration': string;
  'Expiry Date': string;
}

function buildWorkbook(rows: SheetRow[]): EmailAttachment {
  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: ['IP', 'Username', 'VM Spec', 'Plan Duration', 'Expiry Date'],
  });
  sheet['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 38 }, { wch: 14 }, { wch: 12 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Expiring VMs');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return {
    filename: `expiring-vms-${isoDate(new Date())}.xlsx`,
    content: buffer.toString('base64'),
    mimeType: XLSX_MIME,
  };
}

/**
 * Alerts the configured recipients about provider contracts about to lapse.
 *
 * One email covers the whole batch, with the machines in an attached sheet —
 * an operator renewing with a vendor works from that list, not from an inbox.
 *
 * A VM is reported once per end date. Extending the date re-arms the alert,
 * because the stored marker no longer matches the new value.
 */
export async function runProviderExpiryCheck(): Promise<void> {
  const now = new Date();
  const warningDays = config.INVENTORY_PROVIDER_EXPIRY_WARNING_DAYS;

  // The whole window, not just the exact day: a scheduler that was down must
  // not silently swallow the only warning a contract gets.
  const from = startOfUtcDay(now);
  const until = addUtcDays(now, warningDays + 1);

  const expiring = await ServerModel.find({
    providerEndDate: { $gte: from, $lt: until },
  })
    .select('ipAddress vmSpec planDuration providerEndDate providerExpiryAlertSentFor')
    .lean();

  const due = expiring.filter(
    (s) =>
      s.providerEndDate &&
      s.providerExpiryAlertSentFor?.getTime() !== s.providerEndDate.getTime()
  );
  if (due.length === 0) return;

  const settings = await getVmInventorySettings();
  const recipients = [
    ...new Set(settings.providerExpiryRecipients.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (recipients.length === 0) {
    logger.warn('[ProviderExpiry] Contracts are expiring but no recipients are configured', {
      vms: due.length,
    });
    return;
  }

  const credentials = await ServerCredentialModel.find({
    serverId: { $in: due.map((s) => s._id) },
  })
    .select('serverId username')
    .lean();

  const usernames = new Map<string, string[]>();
  for (const credential of credentials) {
    const key = credential.serverId.toString();
    usernames.set(key, [...(usernames.get(key) ?? []), credential.username]);
  }

  // Sorted by urgency so the top of the sheet is what needs renewing first.
  const ordered = [...due].sort(
    (a, b) => a.providerEndDate!.getTime() - b.providerEndDate!.getTime()
  );

  // One row per login: the same box can carry several, and each is a line the
  // operator has to account for when the contract ends.
  const rows: SheetRow[] = ordered.flatMap((server) => {
    const base = {
      IP: server.ipAddress,
      'VM Spec': server.vmSpec ?? '',
      'Plan Duration': server.planDuration ?? '',
      'Expiry Date': isoDate(server.providerEndDate!),
    };
    const logins = usernames.get(server._id.toString()) ?? [];
    return logins.length > 0
      ? logins.map((username) => ({ ...base, Username: username }))
      : [{ ...base, Username: '' }];
  });

  const soonestEnd = ordered[0]!.providerEndDate!;
  const attachment = buildWorkbook(rows);
  const inventoryUrl = `${config.FRONTEND_URL.replace(/\/$/, '')}/super-admin-console/vm-inventory`;
  const brand = resolvePlatformEmailBrand();

  const sent = await Promise.all(
    recipients.map((to) =>
      sendProviderExpiryWarningEmail({
        to,
        vmCount: ordered.length,
        loginCount: rows.length,
        soonestDays: daysUntil(soonestEnd, now),
        soonestDateLabel: formatDateLabel(soonestEnd),
        inventoryUrl,
        attachment,
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

  // Only remember the alert if someone actually received it, so a mail outage
  // does not consume the one warning these contracts get.
  if (!sent.some(Boolean)) return;

  await ServerModel.bulkWrite(
    due.map((s) => ({
      updateOne: {
        filter: { _id: s._id },
        update: { $set: { providerExpiryAlertSentFor: s.providerEndDate } },
      },
    }))
  );

  logger.info('[ProviderExpiry] Sent contract expiry alert', {
    vms: ordered.length,
    rows: rows.length,
    recipients: recipients.length,
    warningDays,
  });
}

export function startProviderExpiryScheduler(): void {
  const intervalMs = config.INVENTORY_PROVIDER_EXPIRY_CHECK_INTERVAL_MS;

  setInterval(() => {
    if (tickInProgress) return;
    tickInProgress = true;
    void runProviderExpiryCheck()
      .catch((err: unknown) => {
        logger.error('[ProviderExpiry] Scheduler tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        tickInProgress = false;
      });
  }, intervalMs);

  logger.info('[ProviderExpiry] Scheduler started', {
    intervalMs,
    warningDays: config.INVENTORY_PROVIDER_EXPIRY_WARNING_DAYS,
  });
}
