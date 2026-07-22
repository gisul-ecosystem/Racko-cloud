import crypto from 'crypto';
import { createRequire } from 'module';
import { ociConfig, validateOciConfig } from '../../config/oci.js';
import { ociSpecMap, parseCanonicalSpec } from '../../config/specMap.js';
import { ensureSkuMappings } from '../../services/dynamicSkuResolver.js';

const require = createRequire(import.meta.url);

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

async function resolveUbuntuImageId(computeClient, compartmentId) {
  if (ociConfig.imageId) return ociConfig.imageId;

  const resp = await computeClient.listImages({
    compartmentId,
    operatingSystem: 'Canonical Ubuntu',
    operatingSystemVersion: '22.04',
    shape: 'VM.Standard.E4.Flex',
    limit: 10,
    sortBy: 'TIMECREATED',
    sortOrder: 'DESC',
  });
  const img = (resp.items || []).find((i) => !/Minimal/i.test(i.displayName || ''));
  if (!img?.id) {
    throw new Error(
      'No Ubuntu 22.04 image found for VM.Standard.E4.Flex — set OCI_IMAGE_OCID'
    );
  }
  return img.id;
}

async function resolveAvailabilityDomain(identityClient, compartmentId) {
  if (ociConfig.availabilityDomain) return ociConfig.availabilityDomain;
  const resp = await identityClient.listAvailabilityDomains({ compartmentId });
  const name = resp.items?.[0]?.name;
  if (!name) throw new Error('No OCI availability domain found');
  return name;
}

/**
 * Launch an OCI Compute instance for reseller catalog.
 */
export async function launchOciVm({
  region,
  canonicalSpec,
  category = 'linux',
  catalogVmId,
} = {}) {
  validateOciConfig({ forProvision: true });

  let mapping = ociSpecMap[canonicalSpec];
  if (!mapping?.shape) {
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
    mapping = ociSpecMap[canonicalSpec];
  }
  if (!mapping?.shape) {
    throw Object.assign(new Error(`Could not resolve OCI shape for: ${canonicalSpec}`), {
      statusCode: 400,
    });
  }

  const core = require('oci-core');
  const identity = require('oci-identity');
  const regionId = region || ociConfig.region;
  const common = require('oci-common');
  const regionProvider = new common.SimpleAuthenticationDetailsProvider(
    ociConfig.tenancyId,
    ociConfig.userId,
    ociConfig.fingerprint,
    ociConfig.privateKey,
    null,
    common.Region.fromRegionId(regionId)
  );

  const computeClient = new core.ComputeClient({ authenticationDetailsProvider: regionProvider });
  const vcnClient = new core.VirtualNetworkClient({
    authenticationDetailsProvider: regionProvider,
  });
  const identityClient = new identity.IdentityClient({
    authenticationDetailsProvider: regionProvider,
  });

  const isWindows = category === 'windows';
  const username = isWindows ? 'opc' : 'ubuntu';
  const password = randomPassword(24);
  const displayName = `racko-reseller-${String(catalogVmId || crypto.randomBytes(4).toString('hex')).slice(0, 24)}`;

  const availabilityDomain = await resolveAvailabilityDomain(
    identityClient,
    ociConfig.compartmentId
  );
  const imageId = await resolveUbuntuImageId(computeClient, ociConfig.compartmentId);

  const metadata = {
    ...(ociConfig.sshPublicKey ? { ssh_authorized_keys: ociConfig.sshPublicKey } : {}),
    user_data: Buffer.from(
      isWindows
        ? `#ps1_sysnative\nnet user ${username} "${password}"\n`
        : `#!/bin/bash\nset -e\necho '${username}:${password}' | chpasswd\nsed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config || true\nsystemctl restart sshd || true\n`
    ).toString('base64'),
  };

  const launchDetails = {
    compartmentId: ociConfig.compartmentId,
    availabilityDomain,
    displayName,
    shape: mapping.shape,
    shapeConfig: {
      ocpus: mapping.ocpus,
      memoryInGBs: mapping.memoryInGBs,
    },
    sourceDetails: {
      sourceType: 'image',
      imageId,
      bootVolumeSizeInGBs: mapping.bootVolumeGb || 50,
    },
    createVnicDetails: {
      subnetId: ociConfig.subnetId,
      assignPublicIp: true,
    },
    metadata,
    freeformTags: {
      ManagedBy: 'cloud-automation-reseller',
      CatalogVmId: String(catalogVmId || ''),
    },
  };

  const createResp = await computeClient.launchInstance({
    launchInstanceDetails: launchDetails,
  });
  const instanceId = createResp.instance?.id;
  if (!instanceId) throw new Error('OCI LaunchInstance returned no instance id');

  // Wait until RUNNING
  let instance = createResp.instance;
  for (let i = 0; i < 60; i += 1) {
    if (instance.lifecycleState === 'RUNNING') break;
    if (['TERMINATED', 'TERMINATING'].includes(instance.lifecycleState)) {
      throw new Error(`OCI instance entered ${instance.lifecycleState}`);
    }
    await sleep(5000);
    const getResp = await computeClient.getInstance({ instanceId });
    instance = getResp.instance;
  }

  // Public IP via VNIC
  let ip = null;
  const vnics = await computeClient.listVnicAttachments({
    compartmentId: ociConfig.compartmentId,
    instanceId,
  });
  const vnicId = vnics.items?.[0]?.vnicId;
  if (vnicId) {
    const vnic = await vcnClient.getVnic({ vnicId });
    ip = vnic.vnic?.publicIp || vnic.vnic?.privateIp || null;
  }

  return {
    provider: 'oci',
    providerInstanceId: instanceId,
    region: regionId,
    ip,
    hostname: ip,
    username,
    password,
    protocol: isWindows ? 'rdp' : 'ssh',
  };
}

export async function terminateOciVm({ region, providerInstanceId } = {}) {
  if (!providerInstanceId) {
    throw Object.assign(new Error('providerInstanceId is required'), { statusCode: 400 });
  }
  validateOciConfig({ forProvision: true });

  const common = require('oci-common');
  const regionId = region || ociConfig.region;
  const regionProvider = new common.SimpleAuthenticationDetailsProvider(
    ociConfig.tenancyId,
    ociConfig.userId,
    ociConfig.fingerprint,
    ociConfig.privateKey,
    null,
    common.Region.fromRegionId(regionId)
  );
  const core = require('oci-core');
  const computeClient = new core.ComputeClient({ authenticationDetailsProvider: regionProvider });

  await computeClient.terminateInstance({
    instanceId: providerInstanceId,
    preserveBootVolume: false,
  });

  return { provider: 'oci', providerInstanceId, terminated: true };
}
