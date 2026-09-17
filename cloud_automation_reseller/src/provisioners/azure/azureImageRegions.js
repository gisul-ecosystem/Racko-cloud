import { ComputeManagementClient } from '@azure/arm-compute';
import { azureConfig, getAzureCredential, validateAzureConfig } from '../../config/azure.js';

function asResourceList(result) {
  return Array.isArray(result) ? result : [];
}

/**
 * Quick check: image publisher/offer/sku has at least one version in region.
 */
export async function isAzureImageAvailableInRegion(client, location, publisher, offer, sku) {
  try {
    const rows = await client.virtualMachineImages.list(location, publisher, offer, sku);
    return asResourceList(rows).some((row) => row?.name);
  } catch {
    return false;
  }
}

/**
 * Regions where this marketplace image can deploy.
 * Checks are batched; transient ARM/network errors skip a region instead of failing the whole call.
 */
export async function listAzureImageAvailabilityRegions({
  publisher,
  offer,
  sku,
  regions = [azureConfig.location],
} = {}) {
  validateAzureConfig();
  const pub = String(publisher || '').trim();
  const off = String(offer || '').trim();
  const skuName = String(sku || '').trim();
  if (!pub || !off || !skuName) return [];

  const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);
  const regionList = [...new Set((regions || []).map((r) => String(r).trim()).filter(Boolean))];
  const batchSize = Math.max(1, Number(process.env.AZURE_IMAGE_REGION_CHECK_CONCURRENCY) || 6);
  const available = [];

  for (let i = 0; i < regionList.length; i += batchSize) {
    const chunk = regionList.slice(i, i + batchSize);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (location) => {
        const ok = await isAzureImageAvailableInRegion(client, location, pub, off, skuName);
        return ok ? location : null;
      })
    );
    for (const result of chunkResults) {
      if (result.status === 'fulfilled' && result.value) {
        available.push(result.value);
      }
    }
  }

  return available;
}
