import crypto from 'crypto';
import { ComputeManagementClient } from '@azure/arm-compute';
import { NetworkManagementClient } from '@azure/arm-network';
import { azureConfig, getAzureCredential, validateAzureConfig } from '../../config/azure.js';
import { resolveAzureVmRef, resolveAzureSubscriptionId } from './azureVmRef.js';
import { azureSpecMap, parseCanonicalSpec } from '../../config/specMap.js';
import { ensureSkuMappings } from '../../services/dynamicSkuResolver.js';
import { ensureAzureResourceGroup } from './azureResourceGroup.js';
import { ensureAzureNetwork } from './azureNetwork.js';
import { listAzureVmSkus } from './azureCatalogLookup.js';

function randomPassword(length = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
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
 * VM + NIC live in `resourceGroup` (project RG). Subnet comes from shared network RG.
 */
export async function launchAzureVm({
  region,
  canonicalSpec,
  category = 'linux',
  catalogVmId,
  resourceGroup,
  assignPublicIp = false,
  vmSize: vmSizeOverride,
  imageReference: imageReferenceOverride,
} = {}) {
  validateAzureConfig({ forProvision: true });

  const parsed = parseCanonicalSpec(canonicalSpec);
  if (!parsed) {
    throw Object.assign(new Error(`Invalid canonicalSpec: ${canonicalSpec}`), {
      statusCode: 400,
    });
  }

  let resolvedVmSize;
  let diskGb = parsed.diskGb || 50;

  if (vmSizeOverride?.trim()) {
    const skus = await listAzureVmSkus();
    const found = skus.find(
      (s) => s.name.toLowerCase() === String(vmSizeOverride).trim().toLowerCase()
    );
    if (!found) {
      throw Object.assign(new Error(`Unknown Azure VM size: ${vmSizeOverride}`), {
        statusCode: 400,
      });
    }
    resolvedVmSize = found.name;
  } else {
    let mapping = azureSpecMap[canonicalSpec];
    if (!mapping?.vmSize) {
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
    resolvedVmSize = mapping.vmSize;
    diskGb = mapping.diskGb || diskGb;
  }

  const credential = getAzureCredential();
  const subscriptionId = azureConfig.subscriptionId;
  const location = region || azureConfig.location;
  const compute = new ComputeManagementClient(credential, subscriptionId);
  const network = new NetworkManagementClient(credential, subscriptionId);

  if (!resourceGroup?.trim()) {
    throw Object.assign(
      new Error('resourceGroup is required — use the project name as the Azure resource group.'),
      { statusCode: 400 }
    );
  }
  const ensured = await ensureAzureResourceGroup({ name: resourceGroup, location });
  const rg = ensured.resourceGroup;

  const azureNetwork = await ensureAzureNetwork({ location, assignPublicIp });
  const subnetId = azureNetwork.subnetId;

  const isWindows = imageReferenceOverride?.id
    ? /windows/i.test(String(imageReferenceOverride.osType || ''))
    : imageReferenceOverride?.publisher
      ? /windows/i.test(
          `${imageReferenceOverride.publisher || ''} ${imageReferenceOverride.offer || ''}`
        )
      : category === 'windows';
  const username = azureConfig.adminUsername || 'rackoadmin';
  const password = randomPassword(24);
  const vmName = safeName('rvm', catalogVmId);
  const nicName = safeName('rnic', catalogVmId);
  const pipName = safeName('rpip', catalogVmId);

  let pip = null;
  if (assignPublicIp) {
    pip = await network.publicIPAddresses.beginCreateOrUpdateAndWait(rg, pipName, {
      location,
      publicIPAllocationMethod: 'Static',
      sku: { name: 'Standard' },
      tags: { ManagedBy: 'cloud-automation-reseller', CatalogVmId: String(catalogVmId || '') },
    });
  }

  const nicParams = {
    location,
    ipConfigurations: [
      {
        name: 'ipconfig1',
        subnet: { id: subnetId },
        ...(pip ? { publicIPAddress: { id: pip.id } } : {}),
      },
    ],
    tags: { ManagedBy: 'cloud-automation-reseller', CatalogVmId: String(catalogVmId || '') },
  };

  const nic = await network.networkInterfaces.beginCreateOrUpdateAndWait(rg, nicName, nicParams);

  const imageReference = imageReferenceOverride?.id
    ? { id: imageReferenceOverride.id }
    : imageReferenceOverride?.publisher
      ? {
          publisher: imageReferenceOverride.publisher,
          offer: imageReferenceOverride.offer,
          sku: imageReferenceOverride.sku,
          version: imageReferenceOverride.version || 'latest',
        }
      : isWindows
        ? azureConfig.windowsImage
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
    hardwareProfile: { vmSize: resolvedVmSize },
    storageProfile: {
      imageReference,
      osDisk: {
        createOption: 'FromImage',
        managedDisk: { storageAccountType: 'Premium_LRS' },
        diskSizeGB: diskGb,
        deleteOption: 'Delete',
      },
    },
    osProfile,
    networkProfile: {
      networkInterfaces: [{ id: nic.id, primary: true }],
    },
    tags: { ManagedBy: 'cloud-automation-reseller', CatalogVmId: String(catalogVmId || '') },
  });

  const nicFresh = await network.networkInterfaces.get(rg, nicName);
  const privateIp = nicFresh.ipConfigurations?.[0]?.privateIPAddress || null;

  let ip = privateIp;
  if (assignPublicIp && pip) {
    const pipFresh = await network.publicIPAddresses.get(rg, pipName);
    ip = pipFresh.ipAddress || privateIp;
  }

  return {
    provider: 'azure',
    providerInstanceId: vmName,
    region: location,
    ip,
    privateIp,
    hostname: vmName,
    username,
    password,
    protocol: isWindows ? 'rdp' : 'ssh',
    meta: {
      nicName,
      pipName: assignPublicIp ? pipName : null,
      vmName,
      resourceGroup: rg,
      assignPublicIp: Boolean(assignPublicIp),
      vmSize: resolvedVmSize,
    },
  };
}

function resourceNameFromId(id) {
  if (!id) return null;
  const parts = String(id).split('/');
  return parts[parts.length - 1] || null;
}

async function deleteResourceQuietly(deleteFn) {
  try {
    await deleteFn();
    return true;
  } catch (err) {
    const status = err?.statusCode ?? err?.response?.status;
    if (status === 404) return false;
    throw err;
  }
}

/**
 * Delete VM and all Racko-created attachments: OS/data disks, NICs, public IPs.
 */
export async function terminateAzureVm({
  providerInstanceId,
  subscriptionId,
  resourceGroup,
  vmName,
} = {}) {
  const { resourceGroup: rg, vmName: name } = resolveAzureVmRef({
    providerInstanceId,
    resourceGroup,
    vmName,
  });
  const subId = resolveAzureSubscriptionId({ subscriptionId });

  const credential = getAzureCredential();
  const compute = new ComputeManagementClient(credential, subId);
  const network = new NetworkManagementClient(credential, subId);

  const diskNames = new Set();
  const nicNames = new Set();
  const pipNames = new Set();

  try {
    const vm = await compute.virtualMachines.get(rg, name);

    const osDiskName = resourceNameFromId(vm.storageProfile?.osDisk?.managedDisk?.id);
    if (osDiskName) diskNames.add(osDiskName);

    for (const dataDisk of vm.storageProfile?.dataDisks || []) {
      const diskName = resourceNameFromId(dataDisk.managedDisk?.id);
      if (diskName) diskNames.add(diskName);
    }

    for (const nicRef of vm.networkProfile?.networkInterfaces || []) {
      const nicName = resourceNameFromId(nicRef.id);
      if (!nicName) continue;
      nicNames.add(nicName);
      try {
        const nic = await network.networkInterfaces.get(rg, nicName);
        for (const ipConfig of nic.ipConfigurations || []) {
          const pipName = resourceNameFromId(ipConfig.publicIPAddress?.id);
          if (pipName) pipNames.add(pipName);
        }
      } catch {
        /* best-effort PIP discovery */
      }
    }
  } catch (err) {
    const status = err?.statusCode ?? err?.response?.status;
    if (status === 404) {
      return {
        provider: 'azure',
        providerInstanceId: `${rg}/${name}`,
        terminated: true,
        alreadyDeleted: true,
        cleanedUp: { vm: false, disks: [], nics: [], publicIps: [] },
      };
    }
    throw err;
  }

  await compute.virtualMachines.beginDeleteAndWait(rg, name);

  const deletedNics = [];
  for (const nicName of nicNames) {
    if (
      await deleteResourceQuietly(async () => {
        await network.networkInterfaces.beginDeleteAndWait(rg, nicName);
      })
    ) {
      deletedNics.push(nicName);
    }
  }

  const deletedPublicIps = [];
  for (const pipName of pipNames) {
    if (
      await deleteResourceQuietly(async () => {
        await network.publicIPAddresses.beginDeleteAndWait(rg, pipName);
      })
    ) {
      deletedPublicIps.push(pipName);
    }
  }

  const deletedDisks = [];
  for (const diskName of diskNames) {
    if (
      await deleteResourceQuietly(async () => {
        await compute.disks.beginDeleteAndWait(rg, diskName);
      })
    ) {
      deletedDisks.push(diskName);
    }
  }

  return {
    provider: 'azure',
    providerInstanceId: `${rg}/${name}`,
    terminated: true,
    cleanedUp: {
      vm: name,
      disks: deletedDisks,
      nics: deletedNics,
      publicIps: deletedPublicIps,
    },
  };
}
