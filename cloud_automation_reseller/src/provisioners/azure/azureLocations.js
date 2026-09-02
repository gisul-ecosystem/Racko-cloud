import { azureConfig, validateAzureConfig } from '../../config/azure.js';
import { azureArmRequest } from './azureArmClient.js';

let locationsCache = null;
let locationsCacheAt = 0;
const LOCATIONS_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Subscription regions from Azure (not hardcoded).
 */
export async function listAzureSubscriptionLocations() {
  validateAzureConfig();
  if (!azureConfig.subscriptionId) {
    throw Object.assign(new Error('AZURE_SUBSCRIPTION_ID not set'), { statusCode: 503 });
  }

  if (locationsCache && Date.now() - locationsCacheAt < LOCATIONS_TTL_MS) {
    return locationsCache;
  }

  const data = await azureArmRequest(
    `/subscriptions/${azureConfig.subscriptionId}/locations`,
    { apiVersion: '2022-12-01' }
  );

  const rows = (Array.isArray(data?.value) ? data.value : [])
    .map((row) => ({
      name: row.name,
      displayName: row.displayName || row.regionalDisplayName || row.name,
      regionalDisplayName: row.regionalDisplayName || row.displayName || row.name,
    }))
    .filter((row) => row.name)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  locationsCache = rows;
  locationsCacheAt = Date.now();
  return rows;
}
