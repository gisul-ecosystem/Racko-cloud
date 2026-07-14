const { findInstancePolicyRule, mapAksNodeVmSize } = require('../utils/instancePolicyRules');
const { isVirtualMachineService, normalizeVmSize } = require('../utils/vmSize');
const {
  getRegionsSupportingVmSize,
  isExactVmSizeDeployableInLocation
} = require('./vmInstanceAvailabilityService');
const { getServiceRegionalHourlyPrices } = require('./estimatePricingService');
const { logAzureEvent } = require('../utils/azureLogger');

const LOG_SERVICE = 'instance-region-availability';

const regionsFromPriceMap = (priceByRegion) => {
  if (!priceByRegion || priceByRegion.size === 0) {
    return null;
  }

  return new Set([...priceByRegion.keys()].map((region) => region.toLowerCase()));
};

const getVmBackedRegions = async (service, optionName) => {
  const vmSize = normalizeVmSize(optionName);

  return getRegionsSupportingVmSize(vmSize).catch((error) => {
    logAzureEvent(LOG_SERVICE, 'warn', 'vm_region_lookup_failed', {
      serviceName: service?.name,
      optionName,
      vmSize,
      message: error?.message
    });
    return new Set();
  });
};

/**
 * Returns regions where the selected instance option can be deployed for a service.
 * VMs/AKS use the Compute Resource SKUs API; other instance-backed services use
 * instance-scoped Azure retail pricing filters.
 */
const getRegionsSupportingInstance = async (service, optionName) => {
  const normalizedOption = String(optionName || '').trim();
  if (!service || !normalizedOption) {
    return null;
  }

  const rule = findInstancePolicyRule(service.name);

  if (!rule && !isVirtualMachineService(service.name)) {
    return null;
  }

  if (rule?.policyType === 'allowed_vm_sku' || isVirtualMachineService(service.name)) {
    return getVmBackedRegions(service, normalizedOption);
  }

  if (rule?.policyType === 'allowed_aks_node_vm_sku') {
    return getVmBackedRegions(service, mapAksNodeVmSize(normalizedOption));
  }

  const priceByRegion = await getServiceRegionalHourlyPrices(service, normalizedOption).catch(
    (error) => {
      logAzureEvent(LOG_SERVICE, 'warn', 'instance_pricing_region_lookup_failed', {
        serviceName: service?.name,
        optionName: normalizedOption,
        message: error?.message
      });
      return new Map();
    }
  );

  return regionsFromPriceMap(priceByRegion);
};

const isInstanceAvailableInLocation = async (service, optionName, location) => {
  const normalizedLocation = String(location || '').trim().toLowerCase();
  if (!normalizedLocation) {
    return true;
  }

  const rule = findInstancePolicyRule(service?.name);

  if (rule?.policyType === 'allowed_vm_sku' || isVirtualMachineService(service?.name)) {
    return isExactVmSizeDeployableInLocation(normalizedLocation, optionName);
  }

  if (rule?.policyType === 'allowed_aks_node_vm_sku') {
    return isExactVmSizeDeployableInLocation(normalizedLocation, mapAksNodeVmSize(optionName));
  }

  const regions = await getRegionsSupportingInstance(service, optionName);
  if (!regions || regions.size === 0) {
    return true;
  }

  return regions.has(normalizedLocation);
};

module.exports = {
  getRegionsSupportingInstance,
  isInstanceAvailableInLocation,
  regionsFromPriceMap
};
