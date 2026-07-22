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

export function startCatalogVmExpiryScheduler(): void {
  const intervalMs = config.CATALOG_VM_EXPIRY_CHECK_INTERVAL_MS;

  setInterval(() => {
    if (tickInProgress) {
      logger.debug('[CatalogVmExpiry] Scheduler tick skipped — previous tick still running');
      return;
    }

    tickInProgress = true;
    void runCatalogVmExpiryCheck()
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
