import { syncAwsPricing } from '../services/awsPricing.js';
import { syncAzurePricing } from '../services/azurePricing.js';

export async function syncAllPricing() {
  const results = [];
  try {
    results.push(await syncAwsPricing());
  } catch (err) {
    results.push({
      provider: 'aws',
      written: 0,
      errorCount: 1,
      errors: [err instanceof Error ? err.message : String(err)],
    });
  }
  try {
    results.push(await syncAzurePricing());
  } catch (err) {
    results.push({
      provider: 'azure',
      written: 0,
      errorCount: 1,
      errors: [err instanceof Error ? err.message : String(err)],
    });
  }
  return results;
}
