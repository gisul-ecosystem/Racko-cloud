const isVirtualMachineService = (serviceName) => /virtual machine/i.test(String(serviceName || ''));

const normalizeVmSize = (instanceOption) => {
  const raw = String(instanceOption || '').trim();
  if (!raw) {
    return 'Standard_B1s';
  }

  const compact = raw.replace(/\s+/g, '_');
  if (compact.startsWith('Standard_')) {
    if (/^Standard_B1$/i.test(compact)) {
      return 'Standard_B1s';
    }
    return compact;
  }

  if (/^b1$/i.test(raw)) {
    return 'Standard_B1s';
  }

  return `Standard_${compact}`;
};

const getVmSizeFamilyPattern = (primarySku) => {
  const primary = String(primarySku || '').trim();
  if (/^Standard_B1/i.test(primary)) {
    return /^Standard_B1/i;
  }
  if (/^Standard_B2/i.test(primary)) {
    return /^Standard_B2/i;
  }
  if (/^Standard_D/i.test(primary)) {
    return /^Standard_D/i;
  }
  if (/^Standard_E/i.test(primary)) {
    return /^Standard_E/i;
  }

  return null;
};

const getVmPolicyAllowedSkus = async (instanceOption, location) => {
  const primary = normalizeVmSize(instanceOption);
  const chain = getVmSizeFallbackChain(instanceOption);
  const familyPattern = getVmSizeFamilyPattern(primary);

  let candidates = familyPattern
    ? chain.filter((sku) => familyPattern.test(sku))
    : chain.slice(0, 4);

  const normalizedLocation = String(location || '').trim().toLowerCase();
  if (!normalizedLocation) {
    return Array.from(new Set(candidates));
  }

  const { getDeployableVmSizesForLocation } = require('../services/vmInstanceAvailabilityService');
  const deployable = await getDeployableVmSizesForLocation(normalizedLocation);

  let allowed = candidates.filter((sku) => deployable.has(sku));

  if (allowed.length === 0 && familyPattern) {
    allowed = [...deployable].filter((sku) => familyPattern.test(sku));
  } else if (familyPattern && /^Standard_B1/i.test(primary)) {
    allowed = Array.from(
      new Set([
        ...allowed,
        ...[...deployable].filter((sku) => /^Standard_B1/i.test(sku))
      ])
    );
  }

  if (allowed.length === 0) {
    allowed = [primary];
  }

  return Array.from(new Set(allowed));
};

const VM_SIZE_FALLBACKS = {
  Standard_B1s: ['Standard_B1ms', 'Standard_B2s', 'Standard_B2ms', 'Standard_D2s_v5'],
  Standard_B1ms: ['Standard_B2s', 'Standard_B2ms', 'Standard_D2s_v5'],
  Standard_B2s: ['Standard_B2ms', 'Standard_D2s_v5', 'Standard_D4s_v5'],
  Standard_B2ms: ['Standard_D2s_v5', 'Standard_D4s_v5'],
  Standard_D2s_v5: ['Standard_D4s_v5', 'Standard_E2s_v5'],
  Standard_D4s_v5: ['Standard_D8s_v5', 'Standard_E4s_v5'],
  Standard_D8s_v5: ['Standard_E8s_v5'],
  Standard_E2s_v5: ['Standard_E4s_v5', 'Standard_D4s_v5'],
  Standard_E4s_v5: ['Standard_E8s_v5', 'Standard_D8s_v5'],
  Standard_E8s_v5: ['Standard_D8s_v5']
};

const getVmSizeFallbackChain = (instanceOption) => {
  const primary = normalizeVmSize(instanceOption);
  const fallbacks = VM_SIZE_FALLBACKS[primary] || [];
  return [primary, ...fallbacks];
};

const isVmCapacityError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('capacity restriction') ||
    message.includes('capacity restrictions') ||
    message.includes('skunotavailable') ||
    message.includes('sku is currently not available') ||
    message.includes('not available in location')
  );
};

module.exports = {
  isVirtualMachineService,
  normalizeVmSize,
  getVmSizeFallbackChain,
  getVmPolicyAllowedSkus,
  isVmCapacityError
};
