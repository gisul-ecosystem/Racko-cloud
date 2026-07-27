import {
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
  waitUntilInstanceRunning,
} from '@aws-sdk/client-ec2';
import crypto from 'crypto';
import { awsConfig, ec2ClientForRegion, validateAwsConfig } from '../../config/aws.js';
import { awsSpecMap, parseCanonicalSpec } from '../../config/specMap.js';
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

/**
 * Launch an EC2 instance for reseller catalog.
 */
export async function launchEc2Vm({
  region,
  canonicalSpec,
  category = 'linux',
  catalogVmId,
} = {}) {
  validateAwsConfig({ forProvision: true });

  let mapping = awsSpecMap[canonicalSpec];
  if (!mapping?.instanceType) {
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
    mapping = awsSpecMap[canonicalSpec];
  }
  if (!mapping?.instanceType) {
    throw Object.assign(new Error(`Could not resolve AWS SKU for: ${canonicalSpec}`), {
      statusCode: 400,
    });
  }

  const regionCode = region || awsConfig.defaultRegion;
  const client = ec2ClientForRegion(regionCode);
  const isWindows = category === 'windows';
  const username = isWindows ? 'Administrator' : 'ubuntu';
  const password = randomPassword();

  const userData = isWindows
    ? Buffer.from(
        `<powershell>
$Password = ConvertTo-SecureString '${password}' -AsPlainText -Force
$User = Get-LocalUser -Name 'Administrator' -ErrorAction SilentlyContinue
if ($User) { Set-LocalUser -Name 'Administrator' -Password $Password }
else { net user Administrator '${password}' }
</powershell>`
      ).toString('base64')
    : Buffer.from(
        `#!/bin/bash
set -e
echo 'ubuntu:${password}' | chpasswd
sed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config || true
systemctl restart sshd || service ssh restart || true
`
      ).toString('base64');

  const params = {
    ImageId: awsConfig.defaultAmiId,
    InstanceType: mapping.instanceType,
    MinCount: 1,
    MaxCount: 1,
    SubnetId: awsConfig.subnetId,
    SecurityGroupIds: [awsConfig.securityGroupId],
    UserData: userData,
    BlockDeviceMappings: [
      {
        DeviceName: '/dev/sda1',
        Ebs: {
          VolumeSize: mapping.ebsGb || 50,
          VolumeType: 'gp3',
          DeleteOnTermination: true,
        },
      },
    ],
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: [
          { Key: 'Name', Value: `racko-reseller-${catalogVmId || 'vm'}` },
          { Key: 'ManagedBy', Value: 'cloud-automation-reseller' },
          { Key: 'CatalogVmId', Value: String(catalogVmId || '') },
        ],
      },
    ],
  };

  if (awsConfig.keyName) {
    params.KeyName = awsConfig.keyName;
  }
  if (awsConfig.instanceProfileArn) {
    params.IamInstanceProfile = { Arn: awsConfig.instanceProfileArn };
  }

  const runRes = await client.send(new RunInstancesCommand(params));
  const instanceId = runRes.Instances?.[0]?.InstanceId;
  if (!instanceId) {
    throw new Error('AWS RunInstances returned no InstanceId');
  }

  await waitUntilInstanceRunning(
    { client, maxWaitTime: 300 },
    { InstanceIds: [instanceId] }
  );

  const desc = await client.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] })
  );
  const inst = desc.Reservations?.[0]?.Instances?.[0];
  const ip = inst?.PublicIpAddress || inst?.PrivateIpAddress || null;

  return {
    provider: 'aws',
    providerInstanceId: instanceId,
    region: regionCode,
    ip,
    hostname: ip,
    username,
    password,
    protocol: isWindows ? 'rdp' : 'ssh',
  };
}

export async function terminateEc2Vm({ region, providerInstanceId } = {}) {
  if (!providerInstanceId) {
    throw Object.assign(new Error('providerInstanceId is required'), { statusCode: 400 });
  }
  const regionCode = region || awsConfig.defaultRegion;
  const client = ec2ClientForRegion(regionCode);
  await client.send(
    new TerminateInstancesCommand({ InstanceIds: [providerInstanceId] })
  );
  return { provider: 'aws', providerInstanceId, terminated: true };
}
