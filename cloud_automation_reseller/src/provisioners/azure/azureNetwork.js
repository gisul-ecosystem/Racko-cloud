import { NetworkManagementClient } from '@azure/arm-network';
import { ResourceManagementClient } from '@azure/arm-resources';
import { azureConfig, getAzureCredential } from '../../config/azure.js';
import { normalizeAzureRegion } from './azureSkuAvailability.js';
import { listAzureSubscriptionLocations } from './azureLocations.js';

const DEFAULT_ADDRESS_PREFIX = '10.0.0.0/16';
const DEFAULT_SUBNET_PREFIX = '10.0.1.0/24';

function networkNamesForRegion(location) {
  const home = normalizeAzureRegion(azureConfig.location);
  const target = normalizeAzureRegion(location);
  if (target === home) {
    return {
      vnetName: azureConfig.vnetName,
      subnetName: azureConfig.subnetName,
    };
  }
  const suffix = target.replace(/[^a-z0-9]/g, '');
  return {
    vnetName: `${azureConfig.vnetName}-${suffix}`.slice(0, 64),
    subnetName: `${azureConfig.subnetName}-${suffix}`.slice(0, 80),
  };
}

/**
 * Resolve (and optionally create) shared VNet/subnet for a deploy region.
 * Private IP VMs use the home region network only; public IP VMs may use per-region networks.
 */
export async function ensureAzureNetwork({ location, assignPublicIp = false } = {}) {
  const region = String(location || azureConfig.location || 'centralindia').trim();
  const home = normalizeAzureRegion(azureConfig.location);
  const target = normalizeAzureRegion(region);

  if (!assignPublicIp && target !== home) {
    throw Object.assign(
      new Error(
        `Private IP VMs must deploy in ${azureConfig.location} where ${azureConfig.vnetName} exists. Enable public IP to deploy in the cheapest subscription region.`
      ),
      { statusCode: 400 }
    );
  }

  const networkRg = azureConfig.vnetResourceGroup;
  const { vnetName, subnetName } = networkNamesForRegion(region);
  if (!networkRg || !vnetName || !subnetName) {
    throw Object.assign(new Error('Azure network env is not configured.'), { statusCode: 503 });
  }

  const credential = getAzureCredential();
  const subscriptionId = azureConfig.subscriptionId;
  const resources = new ResourceManagementClient(credential, subscriptionId);
  const network = new NetworkManagementClient(credential, subscriptionId);

  try {
    await resources.resourceGroups.get(networkRg);
  } catch (err) {
    const status = err?.statusCode ?? err?.response?.status;
    if (status === 404) {
      await resources.resourceGroups.createOrUpdate(networkRg, { location: region });
    } else {
      throw err;
    }
  }

  let vnetExists = true;
  try {
    await network.virtualNetworks.get(networkRg, vnetName);
  } catch (err) {
    const status = err?.statusCode ?? err?.response?.status;
    if (status === 404) vnetExists = false;
    else throw err;
  }

  if (!vnetExists) {
    await network.virtualNetworks.beginCreateOrUpdateAndWait(networkRg, vnetName, {
      location: region,
      addressSpace: { addressPrefixes: [DEFAULT_ADDRESS_PREFIX] },
      subnets: [{ name: subnetName, addressPrefix: DEFAULT_SUBNET_PREFIX }],
    });
  } else {
    try {
      await network.subnets.get(networkRg, vnetName, subnetName);
    } catch (err) {
      const status = err?.statusCode ?? err?.response?.status;
      if (status !== 404) throw err;
      await network.subnets.beginCreateOrUpdateAndWait(networkRg, vnetName, subnetName, {
        addressPrefix: DEFAULT_SUBNET_PREFIX,
      });
    }
  }

  const subnetId = `/subscriptions/${subscriptionId}/resourceGroups/${networkRg}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/${subnetName}`;

  return {
    networkResourceGroup: networkRg,
    vnetName,
    subnetName,
    subnetId,
    location: region,
  };
}

let publicPlacementRegionsCache = null;
let publicPlacementRegionsCacheAt = 0;
const PUBLIC_REGIONS_TTL_MS = 6 * 60 * 60 * 1000;

const FALLBACK_PUBLIC_PLACEMENT_REGIONS = [
  'centralindia',
  'southindia',
  'westindia',
  'eastus',
  'eastus2',
  'westus2',
  'westus3',
  'centralus',
  'southcentralus',
  'northcentralus',
  'westcentralus',
  'northeurope',
  'westeurope',
  'uksouth',
  'southeastasia',
  'eastasia',
  'australiaeast',
];

async function listPublicPlacementRegions() {
  if (publicPlacementRegionsCache && Date.now() - publicPlacementRegionsCacheAt < PUBLIC_REGIONS_TTL_MS) {
    return publicPlacementRegionsCache;
  }
  try {
    const rows = await listAzureSubscriptionLocations();
    publicPlacementRegionsCache = rows.map((row) => normalizeAzureRegion(row.name));
    publicPlacementRegionsCacheAt = Date.now();
    return publicPlacementRegionsCache;
  } catch (err) {
    console.warn(
      '[azure] subscription locations unavailable — using fallback region list:',
      err instanceof Error ? err.message : err
    );
    publicPlacementRegionsCache = [...FALLBACK_PUBLIC_PLACEMENT_REGIONS];
    publicPlacementRegionsCacheAt = Date.now();
    return publicPlacementRegionsCache;
  }
}

/**
 * Private IP → home region (AZURE_LOCATION). Public IP → all subscription regions (cheapest picked later).
 */
export async function resolvePlacementRegionsForAzure({
  assignPublicIp = false,
  regionFilter = '',
} = {}) {
  const home = normalizeAzureRegion(azureConfig.location);
  const filter = String(regionFilter || '')
    .trim()
    .toLowerCase();

  if (!assignPublicIp) {
    if (filter && filter !== home) {
      return { regions: [], cheapestRegionOnly: false };
    }
    return { regions: [home], cheapestRegionOnly: false };
  }

  const subscriptionRegions = await listPublicPlacementRegions();
  if (filter) {
    if (!subscriptionRegions.some((r) => normalizeAzureRegion(r) === filter)) {
      return { regions: [], cheapestRegionOnly: true };
    }
    return { regions: [filter], cheapestRegionOnly: true };
  }
  return { regions: subscriptionRegions, cheapestRegionOnly: true };
}
