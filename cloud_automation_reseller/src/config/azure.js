import { DefaultAzureCredential, ClientSecretCredential } from '@azure/identity';

export const azureConfig = {
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID || '',
  resourceGroup: process.env.AZURE_RESOURCE_GROUP || '',
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
  if (
    forProvision &&
    (!azureConfig.resourceGroup || !azureConfig.vnetName || !azureConfig.subnetName)
  ) {
    throw new Error(
      'Azure provision requires AZURE_RESOURCE_GROUP, AZURE_VNET_NAME, and AZURE_SUBNET_NAME'
    );
  }
}
