import { config } from '../../config';
import { logger } from '../../utils/logger';
import { vmAutomationService } from './vmAutomation.service';

let tickInProgress = false;

/**
 * Checks every minute for automations due to resume or hibernate VMs.
 */
export function startVmAutomationScheduler(): void {
  const intervalMs = config.VM_AUTOMATION_TICK_INTERVAL_MS;

  setInterval(() => {
    if (tickInProgress) {
      logger.debug('[Automation] Scheduler tick skipped — previous tick still running');
      return;
    }

    tickInProgress = true;
    void vmAutomationService
      .runDueAutomations()
      .catch((err: unknown) => {
        logger.error('[Automation] Scheduler tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        tickInProgress = false;
      });
  }, intervalMs);

  logger.info('[Automation] Scheduler started', { intervalMs });
}
