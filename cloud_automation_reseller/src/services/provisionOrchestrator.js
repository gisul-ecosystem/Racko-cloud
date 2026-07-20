import { launchEc2Vm, terminateEc2Vm } from '../provisioners/aws/ec2Launch.js';
import { launchAzureVm, terminateAzureVm } from '../provisioners/azure/vmLaunch.js';
import { launchOciVm, terminateOciVm } from '../provisioners/oci/instanceLaunch.js';
import { launchGcpVm, terminateGcpVm } from '../provisioners/gcp/instanceLaunch.js';

export async function provisionVm(input = {}) {
  const provider = String(input.provider || '').toLowerCase();

  if (provider === 'aws') {
    return launchEc2Vm(input);
  }
  if (provider === 'azure') {
    return launchAzureVm(input);
  }
  if (provider === 'oci') {
    return launchOciVm(input);
  }
  if (provider === 'gcp') {
    return launchGcpVm(input);
  }

  const err = new Error(`Unsupported provider for auto-provision: ${provider}`);
  err.statusCode = 400;
  throw err;
}

export async function terminateVm(input = {}) {
  const provider = String(input.provider || '').toLowerCase();

  if (provider === 'aws') {
    return terminateEc2Vm(input);
  }
  if (provider === 'azure') {
    return terminateAzureVm(input);
  }
  if (provider === 'oci') {
    return terminateOciVm(input);
  }
  if (provider === 'gcp') {
    return terminateGcpVm(input);
  }

  const err = new Error(`Unsupported provider for terminate: ${provider}`);
  err.statusCode = 400;
  throw err;
}
