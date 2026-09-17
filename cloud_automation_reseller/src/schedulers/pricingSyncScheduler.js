import cron from 'node-cron';
import { syncAllPricing } from '../services/pricingSync.js';

let running = false;

async function runSync(label) {
  if (running) {
    console.log(`[pricingSync] skipped (${label}) — already running`);
    return;
  }
  running = true;
  console.log(`[pricingSync] starting (${label})`);
  try {
    const { providersUsed, results } = await syncAllPricing();
    console.log('[pricingSync] done', JSON.stringify({ providersUsed, results }));
  } catch (err) {
    console.error('[pricingSync] failed', err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

export function startPricingSyncScheduler() {
  const expression = process.env.PRICING_SYNC_CRON || '0 */6 * * *';

  if (!cron.validate(expression)) {
    console.warn(`[pricingSync] invalid cron "${expression}", using 0 */6 * * *`);
  }

  cron.schedule(cron.validate(expression) ? expression : '0 */6 * * *', () => {
    void runSync('cron');
  });

  if (process.env.PRICING_SYNC_ON_START !== 'false') {
    setTimeout(() => {
      void runSync('startup').catch((err) => {
        console.error(
          '[pricingSync] unhandled startup failure',
          err instanceof Error ? err.message : err
        );
      });
    }, 5_000);
  }

  console.log(`[pricingSync] scheduler started — cron=${expression}`);
}
