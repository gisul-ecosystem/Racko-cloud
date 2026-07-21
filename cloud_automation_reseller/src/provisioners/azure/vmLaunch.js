import crypto from 'crypto';
import { ComputeManagementClient } from '@azure/arm-compute';
import { NetworkManagementClient } from '@azure/arm-network';
import { azureConfig, getAzureCredential, validateAzureConfig } from '../../config/azure.js';
import { azureSpecMap, parseCanonicalSpec } from '../../config/specMap.js';
import { ensureSkuMappings } from '../../services/dynamicSkuResolver.js';

function randomPassword(length = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  // Azure password complexity
  return `Aa1!${out}`.slice(0, length);
}

function safeName(prefix, id) {
  const raw = `${prefix}${String(id || crypto.randomBytes(4).toString('hex'))}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 60);
  return raw || `${prefix}${Date.now()}`;
}

/**
 * Launch an Azure VM for reseller catalog.
 */
export async function launchAzureVm({
  region,
  canonicalSpec,
  category = 'linux',
  catalogVmId,
} = {}) {
  validateAzureConfig({ forProvision: true });

  let mapping = azureSpecMap[canonicalSpec];
  if (!mapping?.vmSize) {
    const parsed = parseCanonicalSpec(canonicalSpec);
    if (!parsed) {
      throw Object.assign(new Error(`Invalid canonicalSpec: ${canonicalSpec}`), {
        statusCode: 400,
      });
    }
    await ensureSkuMappings({
      canonicalSpec,
      vcpu: parsed.vcpu,
      ramGb: parsed.ramGb,
      diskGb: parsed.diskGb,
      gpu: parsed.gpu || category === 'gpu',
    });
    mapping = azureSpecMap[canonicalSpec];
  }
  if (!mapping?.vmSize) {
    throw Object.assign(new Error(`Could not resolve Azure SKU for: ${canonicalSpec}`), {
      statusCode: 400,
    });
  }

  const credential = getAzureCredential();
  const subscriptionId = azureConfig.subscriptionId;
  const rg = azureConfig.resourceGroup;
  const location = region || azureConfig.location;
  const compute = new ComputeManagementClient(credential, subscriptionId);
  const network = new NetworkManagementClient(credential, subscriptionId);

  const isWindows = category === 'windows';
  const username = azureConfig.adminUsername || 'rackoadmin';
  const password = randomPassword(24);
  const vmName = safeName('rvm', catalogVmId);
  const nicName = safeName('rnic', catalogVmId);
  const pipName = safeName('rpip', catalogVmId);

  const subnetId = `/subscriptions/${subscriptionId}/resourceGroups/${rg}/providers/Microsoft.Network/virtualNetworks/${azureConfig.vnetName}/subnets/${azureConfig.subnetName}`;

  const pip = await network.publicIPAddresses.beginCreateOrUpdateAndWait(rg, pipName, {
    location,
    publicIPAllocationMethod: 'Static',
    sku: { name: 'Standard' },
    tags: { ManagedBy: 'cloud-automation-reseller', CatalogVmId: String(catalogVmId || '') },
  });

  const nic = await network.networkInterfaces.beginCreateOrUpdateAndWait(rg, nicName, {
    location,
    ipConfigurations: [
      {
        name: 'ipconfig1',
        subnet: { id: subnetId },
        publicIPAddress: { id: pip.id },
      },
    ],
    tags: { ManagedBy: 'cloud-automation-reseller', CatalogVmId: String(catalogVmId || '') },
  });

  const imageReference = isWindows
    ? {
        publisher: 'MicrosoftWindowsServer',
        offer: 'WindowsServer',
        sku: '2022-datacenter-azure-edition',
        version: 'latest',
      }
    : azureConfig.linuxImage;

  const osProfile = {
    computerName: vmName.slice(0, 15),
    adminUsername: username,
    adminPassword: password,
  };

  if (!isWindows) {
    osProfile.linuxConfiguration = {
      disablePasswordAuthentication: false,
    };
  }

  await compute.virtualMachines.beginCreateOrUpdateAndWait(rg, vmName, {
    location,
    hardwareProfile: { vmSize: mapping.vmSize },
    storageProfile: {
      imageReference,
      osDisk: {
        createOption: 'FromImage',
        managedDisk: { storageAccountType: 'Premium_LRS' },
        diskSizeGB: mapping.diskGb || 50,
      },
    },
    osProfile,
    networkProfile: {
      networkInterfaces: [{ id: nic.id, primary: true }],
    },
    tags: { ManagedBy: 'cloud-automation-reseller', CatalogVmId: String(catalogVmId || '') },
  });

  const pipFresh = await network.publicIPAddresses.get(rg, pipName);
  const ip = pipFresh.ipAddress || null;

  return {
    provider: 'azure',
    providerInstanceId: `${rg}/${vmName}`,
    region: location,
    ip,
    hostname: ip,
    username,
    password,
    protocol: isWindows ? 'rdp' : 'ssh',
    meta: { nicName, pipName, vmName, resourceGroup: rg },
  };
}

export async function terminateAzureVm({ providerInstanceId } = {}) {
  if (!providerInstanceId) {
    throw Object.assign(new Error('providerInstanceId is required'), { statusCode: 400 });
  }

  const [rg, vmName] = String(providerInstanceId).split('/');
  if (!rg || !vmName) {
    throw Object.assign(
      new Error('Azure providerInstanceId must be resourceGroup/vmName'),
      { statusCode: 400 }
    );
  }

  const credential = getAzureCredential();
  const compute = new ComputeManagementClient(credential, azureConfig.subscriptionId);
  const network = new NetworkManagementClient(credential, azureConfig.subscriptionId);

  let nicName = null;
  let pipName = null;
  try {
    const vm = await compute.virtualMachines.get(rg, vmName);
    const nicId = vm.networkProfile?.networkInterfaces?.[0]?.id;
    if (nicId) {
      nicName = nicId.split('/').pop();
      const nic = await network.networkInterfaces.get(rg, nicName);
      const pipId = nic.ipConfigurations?.[0]?.publicIPAddress?.id;
      if (pipId) pipName = pipId.split('/').pop();
    }
  } catch {
    // best-effort cleanup of related NICs/PIPs
  }

  await compute.virtualMachines.beginDeleteAndWait(rg, vmName);

  if (nicName) {
    try {
      await network.networkInterfaces.beginDeleteAndWait(rg, nicName);
    } catch {
      /* ignore */
    }
  }
  if (pipName) {
    try {
      await network.publicIPAddresses.beginDeleteAndWait(rg, pipName);
    } catch {
      /* ignore */
    }
  }

  return { provider: 'azure', providerInstanceId, terminated: true };
}
