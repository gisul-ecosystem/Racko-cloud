import { ResourceManagementClient } from '@azure/arm-resources';
import { azureConfig, getAzureCredential } from '../../config/azure.js';

/** Azure RG naming rules (simplified). */
export function sanitizeAzureResourceGroupName(name) {
  let s = String(name || '')
    .trim()
    .replace(/\.$/, '')
    .replace(/[^A-Za-z0-9-_.()]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
  if (s.endsWith('.')) s = s.slice(0, -1);
  if (!s) {
    throw Object.assign(new Error('Invalid Azure resource group name'), { statusCode: 400 });
  }
  return s;
}

/**
 * Create RG when missing; reuse when present in subscription.
 */
export async function ensureAzureResourceGroup({ name, location }) {
  const resourceGroup = sanitizeAzureResourceGroupName(name);
  const region = String(location || azureConfig.location || 'centralindia').trim();
  const credential = getAzureCredential();
  const client = new ResourceManagementClient(credential, azureConfig.subscriptionId);

  try {
    await client.resourceGroups.get(resourceGroup);
    return { resourceGroup, created: false, location: region };
  } catch (err) {
    const status = err?.statusCode ?? err?.response?.status;
    if (status !== 404) {
      throw err;
    }
  }

  await client.resourceGroups.createOrUpdate(resourceGroup, { location: region });
  return { resourceGroup, created: true, location: region };
}
