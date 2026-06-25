import { syncRequestUserSpend } from '../services/costTrackingService.js';
import { checkAndEnforceBudgets } from '../services/budgetEnforcementService.js';
import Request from '../models/Request.js';

let isRunning = false;

function isCostExplorerEnabled() {
  const value = String(process.env.COST_EXPLORER_ENABLED ?? 'true').trim().toLowerCase();
  return value !== 'false' && value !== '0' && value !== 'no';
}

export async function runBudgetSync() {
  if (isRunning) return;
  if (!isCostExplorerEnabled()) return;

  isRunning = true;

  try {
    console.log('[budgetScheduler] Starting cost sync...');

    const activeRequests = await Request.find({
      status: 'Completed',
      endDate: { $gte: new Date() },
    });

    for (const request of activeRequests) {
      await syncRequestUserSpend(String(request._id));
    }

    await checkAndEnforceBudgets();

    console.log(`[budgetScheduler] Sync complete for ${activeRequests.length} requests`);
  } catch (err) {
    console.error('[budgetScheduler] Error:', err.message);
  } finally {
    isRunning = false;
  }
}

export function startBudgetScheduler() {
  if (!isCostExplorerEnabled()) {
    console.log('[budgetScheduler] Disabled — COST_EXPLORER_ENABLED is false');
    return;
  }

  const intervalMinutes = Number(process.env.BUDGET_POLL_INTERVAL_MINUTES || 15);
  const INTERVAL_MS = intervalMinutes * 60 * 1000;

  console.log(`[budgetScheduler] Started — polling every ${intervalMinutes} minutes`);
  setInterval(runBudgetSync, INTERVAL_MS);

  runBudgetSync();
}
