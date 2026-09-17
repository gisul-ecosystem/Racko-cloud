import { ComputeManagementClient } from '@azure/arm-compute';
import { getAzureCredential } from '../../config/azure.js';
import { resolveAzureSubscriptionId, resolveAzureVmRef } from './azureVmRef.js';
import { terminateAzureVm } from './vmLaunch.js';

const ALLOWED_ACTIONS = new Set(['start', 'stop', 'reboot', 'terminate']);

/**
 * Start / stop (deallocate) / restart / terminate an existing Azure VM.
 */
export async function powerAzureVm(input = {}) {
  const action = String(input.action || '').toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) {
    const err = new Error(`Unsupported Azure power action: ${action}`);
    err.statusCode = 400;
    throw err;
  }

  const { resourceGroup, vmName } = resolveAzureVmRef(input);
  const subscriptionId = resolveAzureSubscriptionId(input);
  const providerInstanceId = `${resourceGroup}/${vmName}`;

  if (action === 'terminate') {
    return terminateAzureVm({
      providerInstanceId,
      subscriptionId,
      resourceGroup,
      vmName,
    });
  }

  const credential = getAzureCredential();
  const compute = new ComputeManagementClient(credential, subscriptionId);

  switch (action) {
    case 'start':
      await compute.virtualMachines.beginStartAndWait(resourceGroup, vmName);
      break;
    case 'stop':
      await compute.virtualMachines.beginDeallocateAndWait(resourceGroup, vmName);
      break;
    case 'reboot':
      await compute.virtualMachines.beginRestartAndWait(resourceGroup, vmName);
      break;
    default:
      break;
  }

  return {
    provider: 'azure',
    action,
    resourceGroup,
    vmName,
    providerInstanceId,
  };
}
