import { config } from '../../config';
import { logger } from '../../utils/logger';
import { VmHostLeaseModel } from './vmHostLease.model';
import { sendVmHostLeaseExpiryEmail } from '../../utils/email/sender';

let tickInProgress = false;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runVmHostLeaseExpiryWarningCheck(): Promise<void> {
  const now = new Date();
  const warningMs = config.VM_HOST_LEASE_WARNING_DAYS * 24 * 60 * 60 * 1000;
  const warningUntil = new Date(now.getTime() + warningMs);

  const candidates = await VmHostLeaseModel.find({
    deleted: false,
    dueDate: { $gt: now, $lte: warningUntil },
  });

  const toNotify = candidates.filter((lease) => {
    if (!lease.expiryWarningFor) return true;
    return lease.expiryWarningFor.getTime() !== lease.dueDate.getTime();
  });

  if (toNotify.length === 0) {
    return;
  }

  const payload = toNotify.map((lease) => {
    const msLeft = lease.dueDate.getTime() - now.getTime();
    const daysRemaining = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return {
      lease,
      emailRow: {
        ipAddress: lease.ipAddress,
        provider: lease.provider,
        assignedTo: lease.assignedTo,
        invoiceDate: formatDate(lease.invoiceDate),
        dueDate: formatDate(lease.dueDate),
        daysRemaining,
      },
    };
  });

  try {
    await sendVmHostLeaseExpiryEmail({
      to: config.SUPER_ADMIN_EMAIL,
      leases: payload.map((p) => p.emailRow),
      warningDays: config.VM_HOST_LEASE_WARNING_DAYS,
    });

    await Promise.all(
      payload.map(async ({ lease }) => {
        lease.expiryWarningFor = lease.dueDate;
        await lease.save();
      })
    );

    logger.info('[VmHostLeaseExpiry] Reminder email sent', {
      to: config.SUPER_ADMIN_EMAIL,
      leaseCount: payload.length,
      warningDays: config.VM_HOST_LEASE_WARNING_DAYS,
    });
  } catch (err) {
    logger.error('[VmHostLeaseExpiry] Failed to send reminder email', {
      error: err instanceof Error ? err.message : String(err),
      leaseCount: payload.length,
    });
  }
}

export function startVmHostLeaseExpiryWarningScheduler(): void {
  const intervalMs = config.VM_HOST_LEASE_WARNING_CHECK_INTERVAL_MS;

  setInterval(() => {
    if (tickInProgress) {
      logger.debug('[VmHostLeaseExpiry] Scheduler tick skipped — previous tick still running');
      return;
    }

    tickInProgress = true;
    void runVmHostLeaseExpiryWarningCheck()
      .catch((err: unknown) => {
        logger.error('[VmHostLeaseExpiry] Scheduler tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        tickInProgress = false;
      });
  }, intervalMs);

  logger.info('[VmHostLeaseExpiry] Scheduler started', {
    intervalMs,
    warningDays: config.VM_HOST_LEASE_WARNING_DAYS,
    notifyEmail: config.SUPER_ADMIN_EMAIL,
  });
}
