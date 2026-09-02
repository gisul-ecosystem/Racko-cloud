import { ComputeManagementClient } from '@azure/arm-compute';
import { azureConfig, getAzureCredential, validateAzureConfig } from '../../config/azure.js';
import {
  buildAzureImagePlanSummary,
  formatAzureImagePlanLabel,
  formatAzureImageVersionLabel,
} from './azureImageSkuLabels.js';

function asResourceList(result) {
  return Array.isArray(result) ? result : [];
}

function latestVersionName(rows) {
  const names = asResourceList(rows)
    .map((row) => row?.name)
    .filter(Boolean);
  if (names.length === 0) return null;
  return [...names].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
}

/**
 * Full Portal-style SKU/version rows for one publisher/offer in a region.
 */
export async function listAzureImageSkuPlans({
  region,
  publisher,
  offer,
  productDisplayName,
} = {}) {
  validateAzureConfig();
  const location = String(region || '').trim();
  const pub = String(publisher || '').trim();
  const off = String(offer || '').trim();
  if (!location || !pub || !off) {
    throw Object.assign(new Error('region, publisher, and offer are required.'), { statusCode: 400 });
  }

  const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);
  const skuRows = await client.virtualMachineImages.listSkus(location, pub, off);
  const plans = [];

  for (const skuRow of asResourceList(skuRows)) {
    const sku = skuRow?.name || '';
    if (!sku) continue;

    let latestVersion = null;
    try {
      const versionRows = await client.virtualMachineImages.list(location, pub, off, sku);
      latestVersion = latestVersionName(versionRows);
    } catch {
      /* SKU may not expose versions in this region */
    }

    const displayName = formatAzureImagePlanLabel({
      publisher: pub,
      offer: off,
      sku,
      productDisplayName,
    });

    plans.push({
      planId: sku,
      sku,
      publisher: pub,
      offer: off,
      displayName,
      version: latestVersion,
      versionLabel: formatAzureImageVersionLabel(latestVersion),
      summary: buildAzureImagePlanSummary({
        publisher: pub,
        offer: off,
        sku,
        version: latestVersion,
      }),
    });
  }

  plans.sort((a, b) => {
    const versionCmp = String(b.version || '').localeCompare(String(a.version || ''), undefined, {
      numeric: true,
    });
    if (versionCmp !== 0) return versionCmp;
    return a.displayName.localeCompare(b.displayName);
  });

  return plans;
}
