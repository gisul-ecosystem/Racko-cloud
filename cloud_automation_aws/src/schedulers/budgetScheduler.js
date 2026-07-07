import { checkAndEnforceBudgets } from '../services/budgetEnforcementService.js';

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
    console.log('[budgetScheduler] Enforcing budgets after cost sync...');
    await checkAndEnforceBudgets();
    console.log('[budgetScheduler] Budget enforcement complete');
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

  console.log(`[budgetScheduler] Started — enforcing budgets every ${intervalMinutes} minutes`);
  setInterval(runBudgetSync, INTERVAL_MS);

  runBudgetSync();
}
