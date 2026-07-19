import cron from 'node-cron';
import Request from '../models/Request.js';
import { updateRequestSpend } from '../services/costTrackingService.js';

let isRunning = false;

function isCostExplorerEnabled() {
  const value = String(process.env.COST_EXPLORER_ENABLED ?? 'true').trim().toLowerCase();
  return value !== 'false' && value !== '0' && value !== 'no';
}

export async function runCostTrackingSync() {
  if (isRunning) {
    console.log('[CostScheduler] Previous run still in progress, skipping');
    return;
  }

  if (!isCostExplorerEnabled()) {
    return;
  }

  isRunning = true;

  try {
    console.log('[CostScheduler] Running spend update for all active requests');

    const activeRequests = await Request.find({
      status: { $in: ['Completed', 'Provisioning'] },
      endDate: { $gte: new Date() },
    }).select('_id');

    console.log(`[CostScheduler] Found ${activeRequests.length} active requests`);

    for (const request of activeRequests) {
      try {
        await updateRequestSpend(String(request._id));
      } catch (err) {
        console.error(`[CostScheduler] Failed for request ${request._id}:`, err.message);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error('[CostScheduler] Scheduler error:', err.message);
  } finally {
    isRunning = false;
  }
}

export function startCostTrackingScheduler() {
  if (!isCostExplorerEnabled()) {
    console.log('[CostScheduler] Disabled — COST_EXPLORER_ENABLED is false');
    return;
  }

  cron.schedule('*/15 * * * *', () => {
    void runCostTrackingSync();
  });

  console.log('[CostScheduler] Cost tracking scheduler started — runs every 15 minutes');
  void runCostTrackingSync();
}
