import { DefaultAzureCredential, ClientSecretCredential } from '@azure/identity';

export const azureConfig = {
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID || '',
  /** RG where the shared VNet/subnet live — not where VMs are created. */
  vnetResourceGroup:
    process.env.AZURE_VNET_RESOURCE_GROUP ||
    process.env.AZURE_NETWORK_RESOURCE_GROUP ||
    process.env.AZURE_RESOURCE_GROUP ||
    '',
  /** @deprecated Use vnetResourceGroup — kept for legacy env names. */
  resourceGroup: process.env.AZURE_RESOURCE_GROUP || '',
  networkResourceGroup:
    process.env.AZURE_VNET_RESOURCE_GROUP ||
    process.env.AZURE_NETWORK_RESOURCE_GROUP ||
    process.env.AZURE_RESOURCE_GROUP ||
    '',
  location: process.env.AZURE_LOCATION || 'centralindia',
  vnetName: process.env.AZURE_VNET_NAME || '',
  subnetName: process.env.AZURE_SUBNET_NAME || '',
  adminUsername: process.env.AZURE_ADMIN_USERNAME || 'rackoadmin',
  linuxImage: {
    publisher: process.env.AZURE_LINUX_IMAGE_PUBLISHER || 'Canonical',
    offer: process.env.AZURE_LINUX_IMAGE_OFFER || '0001-com-ubuntu-server-jammy',
    sku: process.env.AZURE_LINUX_IMAGE_SKU || '22_04-lts-gen2',
    version: process.env.AZURE_LINUX_IMAGE_VERSION || 'latest',
  },
  windowsImage: {
    publisher: process.env.AZURE_WINDOWS_IMAGE_PUBLISHER || 'MicrosoftWindowsServer',
    offer: process.env.AZURE_WINDOWS_IMAGE_OFFER || 'WindowsServer',
    sku: process.env.AZURE_WINDOWS_IMAGE_SKU || '2022-datacenter-azure-edition',
    version: process.env.AZURE_WINDOWS_IMAGE_VERSION || 'latest',
  },
  /** Optional RG filter when listing custom templates/images. */
  templateResourceGroup: process.env.AZURE_TEMPLATE_RESOURCE_GROUP || '',
};

export function getAzureCredential() {
  if (
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET
  ) {
    return new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );
  }
  return new DefaultAzureCredential();
}

export function validateAzureConfig({ forProvision = false } = {}) {
  if (!azureConfig.subscriptionId) {
    console.warn('[azure] AZURE_SUBSCRIPTION_ID not set — pricing/provision may fail');
  }
  const vnetRg = azureConfig.vnetResourceGroup;
  if (forProvision && (!vnetRg || !azureConfig.vnetName || !azureConfig.subnetName)) {
    throw new Error(
      'Azure provision requires AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP (VNet location), AZURE_VNET_NAME, and AZURE_SUBNET_NAME'
    );
  }
}

/** Live Retail pricing region — defaults to AZURE_LOCATION (home / VNet region). */
export function resolveAzurePricingRegion(override) {
  const region = String(
    override || azureConfig.location || process.env.AZURE_PRICING_REGION || ''
  ).trim();
  if (!region) {
    throw Object.assign(
      new Error('Set AZURE_LOCATION (or AZURE_PRICING_REGION) for Azure SKU pricing lookups.'),
      { statusCode: 503 }
    );
  }
  return region;
}
