/**
 * Resolve Azure VM resource group + name from manual or auto-provisioned inputs.
 */
export function resolveAzureVmRef(input = {}) {
  const resourceGroup = String(input.resourceGroup || '').trim();
  const vmNameInput = String(input.vmName || '').trim();
  const providerInstanceId = String(input.providerInstanceId || '').trim();

  if (resourceGroup && vmNameInput) {
    return { resourceGroup, vmName: vmNameInput };
  }

  if (providerInstanceId.includes('/')) {
    const slash = providerInstanceId.indexOf('/');
    const rg = providerInstanceId.slice(0, slash).trim();
    const vmName = providerInstanceId.slice(slash + 1).trim();
    if (rg && vmName) {
      return { resourceGroup: rg, vmName };
    }
  }

  if (resourceGroup && providerInstanceId) {
    return { resourceGroup, vmName: providerInstanceId };
  }

  const err = new Error(
    'Azure VM reference requires resourceGroup + vmName, or providerInstanceId as resourceGroup/vmName.'
  );
  err.statusCode = 400;
  throw err;
}

export function resolveAzureSubscriptionId(input = {}) {
  const fromInput = String(input.subscriptionId || '').trim();
  if (fromInput) return fromInput;
  const fromEnv = String(process.env.AZURE_SUBSCRIPTION_ID || '').trim();
  if (fromEnv) return fromEnv;
  const err = new Error('AZURE_SUBSCRIPTION_ID is not configured.');
  err.statusCode = 500;
  throw err;
}
