import { config } from '../../config';
import { logger } from '../../utils/logger';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { vmCatalogService } from './vmCatalog.service';

let tickInProgress = false;

export async function runCatalogVmExpiryCheck(): Promise<void> {
  const now = new Date();
  const expired = await CatalogVmModel.find({
    autoProvisioned: true,
    status: 'active',
    expiresAt: { $lte: now },
  }).limit(50);

  for (const doc of expired) {
    try {
      await vmCatalogService.terminateExpiredCatalogVm(doc);
    } catch (err) {
      logger.error('[CatalogVmExpiry] Failed to terminate expired catalog VM', {
        requestId: doc._id.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (expired.length > 0) {
    logger.info('[CatalogVmExpiry] Processed expired catalog VMs', { count: expired.length });
  }
}

/**
 * Warn about paid provider terms that are about to end.
 *
 * Deliberately separate from the teardown pass above: that one only touches
 * auto-provisioned cloud VMs it can actually destroy, while this one covers
 * manually fulfilled VMs (Webyne, manual Azure) that a human has to renew or
 * terminate at the provider. Nothing here changes a VM's status.
 */
export async function runCatalogVmExpiryWarnings(): Promise<void> {
  const warningDays = config.CATALOG_VM_EXPIRY_WARNING_DAYS;
  const cutoff = new Date(Date.now() + warningDays * 24 * 60 * 60 * 1000);

  const expiring = await CatalogVmModel.find({
    autoProvisioned: false,
    status: 'active',
    expiresAt: { $ne: null, $lte: cutoff },
    // Unset or stale marker both differ from expiresAt, so extending the end
    // date re-arms the warning for the new date.
    $expr: { $ne: ['$expiryWarningSentFor', '$expiresAt'] },
  }).limit(50);

  let warned = 0;
  for (const doc of expiring) {
    try {
      await vmCatalogService.warnExpiringCatalogVm(doc);
      warned += 1;
    } catch (err) {
      logger.error('[CatalogVmExpiry] Failed to warn about expiring catalog VM', {
        requestId: doc._id.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (warned > 0) {
    logger.info('[CatalogVmExpiry] Sent provider term expiry warnings', {
      count: warned,
      warningDays,
    });
  }
}

export function startCatalogVmExpiryScheduler(): void {
  const intervalMs = config.CATALOG_VM_EXPIRY_CHECK_INTERVAL_MS;

  setInterval(() => {
    if (tickInProgress) {
      logger.debug('[CatalogVmExpiry] Scheduler tick skipped — previous tick still running');
      return;
    }

    tickInProgress = true;
    void runCatalogVmExpiryCheck()
      .then(() => runCatalogVmExpiryWarnings())
      .catch((err: unknown) => {
        logger.error('[CatalogVmExpiry] Scheduler tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        tickInProgress = false;
      });
  }, intervalMs);

  logger.info('[CatalogVmExpiry] Scheduler started', { intervalMs });
}
