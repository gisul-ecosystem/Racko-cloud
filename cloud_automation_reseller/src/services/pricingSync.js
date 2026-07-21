import { syncAwsPricing } from '../services/awsPricing.js';
import { syncAzurePricing } from '../services/azurePricing.js';
import { syncOciPricing } from '../services/ociPricing.js';
import { syncGcpPricing } from '../services/gcpPricing.js';
import { normalizeProviders } from '../config/cloudProviders.js';

export async function syncAllPricing({ providers } = {}) {
  const providersUsed = normalizeProviders(providers);
  const results = [];

  if (providersUsed.includes('aws')) {
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
  }

  if (providersUsed.includes('azure')) {
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
  }

  if (providersUsed.includes('oci')) {
    try {
      results.push(await syncOciPricing());
    } catch (err) {
      results.push({
        provider: 'oci',
        written: 0,
        errorCount: 1,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  if (providersUsed.includes('gcp')) {
    try {
      results.push(await syncGcpPricing());
    } catch (err) {
      results.push({
        provider: 'gcp',
        written: 0,
        errorCount: 1,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return { providersUsed, results };
}
