import crypto from 'crypto';
import { InstancesClient, ZoneOperationsClient, ImagesClient } from '@google-cloud/compute';
import {
  gcpConfig,
  gcpClientOptions,
  validateGcpConfig,
  zoneToRegion,
} from '../../config/gcp.js';
import { gcpSpecMap, parseCanonicalSpec } from '../../config/specMap.js';
import { ensureSkuMappings } from '../../services/dynamicSkuResolver.js';

function randomPassword(length = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitZoneOp(opsClient, project, zone, operation) {
  let op = operation;
  for (let i = 0; i < 90; i += 1) {
    if (op.status === 'DONE') {
      if (op.error?.errors?.length) {
        throw new Error(
          `GCP zone op failed: ${op.error.errors.map((e) => e.message).join('; ')}`
        );
      }
      return op;
    }
    await sleep(4000);
    const [latest] = await opsClient.get({ project, zone, operation: op.name });
    op = latest;
  }
  throw new Error('GCP zone operation timed out');
}

async function resolveUbuntuImage(imagesClient) {
  const [image] = await imagesClient.getFromFamily({
    project: gcpConfig.imageProject,
    family: gcpConfig.imageFamily,
  });
  if (!image?.selfLink) {
    throw new Error(
      `No image for family ${gcpConfig.imageFamily} in ${gcpConfig.imageProject}`
    );
  }
  return image.selfLink;
}

/**
 * Launch a GCE instance for reseller catalog.
 * providerInstanceId format: `{zone}/{instanceName}`
 */
export async function launchGcpVm({
  region,
  canonicalSpec,
  category = 'linux',
  catalogVmId,
} = {}) {
  validateGcpConfig({ forProvision: true });

  let mapping = gcpSpecMap[canonicalSpec];
  if (!mapping?.machineType) {
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
    mapping = gcpSpecMap[canonicalSpec];
  }
  if (!mapping?.machineType) {
    throw Object.assign(new Error(`Could not resolve GCP machine type for: ${canonicalSpec}`), {
      statusCode: 400,
    });
  }

  const opts = gcpClientOptions();
  const instancesClient = new InstancesClient(opts);
  const opsClient = new ZoneOperationsClient(opts);
  const imagesClient = new ImagesClient(opts);

  const project = gcpConfig.projectId;
  // Prefer configured zone; if select returned a region, map to `{region}-a`.
  let zone = gcpConfig.zone;
  if (region && region !== zoneToRegion(zone)) {
    zone = `${region}-a`;
  }

  const isWindows = category === 'windows';
  const username = isWindows ? 'rackoadmin' : 'ubuntu';
  const password = randomPassword(24);
  const name = `racko-r-${String(catalogVmId || crypto.randomBytes(4).toString('hex'))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40)}`;

  const imageLink = await resolveUbuntuImage(imagesClient);
  const startupScript = isWindows
    ? `#ps1\nnet user ${username} "${password}" /add\nnet localgroup administrators ${username} /add\n`
    : `#!/bin/bash
set -e
echo '${username}:${password}' | chpasswd
sed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config || true
systemctl restart sshd || service ssh restart || true
`;

  const networkInterface = {
    network: `projects/${project}/global/networks/${gcpConfig.network}`,
    accessConfigs: [{ name: 'External NAT', type: 'ONE_TO_ONE_NAT' }],
  };
  if (gcpConfig.subnetwork) {
    const regionCode = zoneToRegion(zone);
    networkInterface.subnetwork = `projects/${project}/regions/${regionCode}/subnetworks/${gcpConfig.subnetwork}`;
  }

  const metadataItems = [{ key: 'startup-script', value: startupScript }];
  if (gcpConfig.sshPublicKey) {
    metadataItems.push({
      key: 'ssh-keys',
      value: `${username}:${gcpConfig.sshPublicKey}`,
    });
  }

  const instanceResource = {
    name,
    machineType: `zones/${zone}/machineTypes/${mapping.machineType}`,
    disks: [
      {
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: imageLink,
          diskSizeGb: String(mapping.diskGb || 50),
          diskType: `zones/${zone}/diskTypes/pd-balanced`,
        },
      },
    ],
    networkInterfaces: [networkInterface],
    metadata: { items: metadataItems },
    labels: {
      managed_by: 'cloud-automation-reseller',
      catalog_vm_id: String(catalogVmId || 'na')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 63),
    },
    tags: { items: ['racko-reseller'] },
  };

  if (mapping.acceleratorType && mapping.acceleratorCount > 0) {
    instanceResource.guestAccelerators = [
      {
        acceleratorType: `zones/${zone}/acceleratorTypes/${mapping.acceleratorType}`,
        acceleratorCount: mapping.acceleratorCount,
      },
    ];
    instanceResource.scheduling = {
      onHostMaintenance: 'TERMINATE',
      automaticRestart: true,
    };
  }

  const [op] = await instancesClient.insert({
    project,
    zone,
    instanceResource,
  });
  await waitZoneOp(opsClient, project, zone, op);

  const [instance] = await instancesClient.get({ project, zone, instance: name });
  const ip =
    instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ||
    instance.networkInterfaces?.[0]?.networkIP ||
    null;

  return {
    provider: 'gcp',
    providerInstanceId: `${zone}/${name}`,
    region: zoneToRegion(zone),
    ip,
    hostname: ip,
    username,
    password,
    protocol: isWindows ? 'rdp' : 'ssh',
  };
}

export async function terminateGcpVm({ region, providerInstanceId } = {}) {
  if (!providerInstanceId) {
    throw Object.assign(new Error('providerInstanceId is required'), { statusCode: 400 });
  }
  validateGcpConfig({ forProvision: true });

  let zone = gcpConfig.zone;
  let name = providerInstanceId;
  if (providerInstanceId.includes('/')) {
    const parts = providerInstanceId.split('/');
    zone = parts[0];
    name = parts.slice(1).join('/');
  } else if (region) {
    zone = `${region}-a`;
  }

  const opts = gcpClientOptions();
  const instancesClient = new InstancesClient(opts);
  const opsClient = new ZoneOperationsClient(opts);
  const project = gcpConfig.projectId;

  const [op] = await instancesClient.delete({ project, zone, instance: name });
  await waitZoneOp(opsClient, project, zone, op);

  return { provider: 'gcp', providerInstanceId, terminated: true };
}
