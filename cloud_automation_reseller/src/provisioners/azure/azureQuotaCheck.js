import { ComputeManagementClient } from '@azure/arm-compute';
import { azureConfig, getAzureCredential, validateAzureConfig } from '../../config/azure.js';
import { normalizeAzureRegion } from './azureSkuAvailability.js';

/**
 * Azure compute usage names for VM families look like "standardNVSv4Family".
 * Resource SKUs expose `family` on each size; fall back to a best-effort parse.
 */
export function azureFamilyUsageName(familyOrSize) {
  const raw = String(familyOrSize || '').trim();
  if (!raw) return null;
  if (/family$/i.test(raw)) return raw;
  // Standard_NV16as_v4 → NV16as_v4 → NVSv4 → standardNVSv4Family (best effort)
  const withoutPrefix = raw.replace(/^Standard_/i, '');
  const m = withoutPrefix.match(/^([A-Za-z]+)(\d+)[A-Za-z]*_?(v\d+)?/i);
  if (!m) return `standard${withoutPrefix.replace(/[^A-Za-z0-9]/g, '')}Family`;
  const series = m[1];
  const version = m[3] || '';
  return `standard${series}${version}Family`;
}

/**
 * Check subscription vCPU quota for the selected VM size in a region.
 * Uses Azure Compute Usage API (same source as the portal quota blade).
 */
export async function checkAzureVmFamilyQuota({ region, vmSize, vcpu, family } = {}) {
  validateAzureConfig();

  const location = normalizeAzureRegion(region);
  const size = String(vmSize || '').trim();
  const needCores = Math.max(1, Number(vcpu) || 0);
  if (!location || !size) {
    return {
      valid: false,
      message: 'Region and VM size are required for quota check.',
    };
  }
  if (!needCores) {
    return {
      valid: false,
      message: 'vCPU count is required for quota check.',
    };
  }

  const familyName = String(family || '').trim() || azureFamilyUsageName(size);
  if (!familyName) {
    return {
      valid: false,
      message: `Could not determine Azure quota family for ${size}.`,
    };
  }

  try {
    const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);
    // @azure/arm-compute v22+: usage → usageOperations
    const usageApi = client.usageOperations || client.usage;
    if (!usageApi?.list) {
      return {
        valid: false,
        family: familyName,
        requiredCores: needCores,
        message:
          'Azure SDK usage API is unavailable (expected client.usageOperations.list). Update @azure/arm-compute.',
      };
    }
    let familyUsage = null;
    let coresUsage = null;

    for await (const item of usageApi.list(location)) {
      const name = String(item?.name?.value || '').trim();
      if (!name) continue;
      if (name.toLowerCase() === familyName.toLowerCase()) {
        familyUsage = item;
      }
      if (name.toLowerCase() === 'cores' || name.toLowerCase() === 'totalregionalvcpus') {
        coresUsage = item;
      }
    }

    if (!familyUsage) {
      // Unknown family name in usage list — do not block; Azure may still accept/reject at create.
      return {
        valid: true,
        skipped: true,
        family: familyName,
        requiredCores: needCores,
        message: `Quota family "${familyName}" was not returned for ${location}; Azure will validate at create time.`,
      };
    }

    const limit = Number(familyUsage.limit);
    const current = Number(familyUsage.currentValue) || 0;
    // Unlimited / not tracked
    if (!Number.isFinite(limit) || limit < 0 || limit >= 100000) {
      return {
        valid: true,
        family: familyName,
        limit,
        current,
        requiredCores: needCores,
        remaining: null,
        message: `Quota for ${familyName} in ${location} is unrestricted.`,
      };
    }

    const remaining = Math.max(0, limit - current);
    if (remaining < needCores) {
      return {
        valid: false,
        family: familyName,
        limit,
        current,
        requiredCores: needCores,
        remaining,
        message:
          `Azure quota too low for ${size} in ${location}. ` +
          `Family ${familyName}: limit ${limit}, used ${current}, remaining ${remaining}, required ${needCores}. ` +
          `Request a quota increase in Azure Portal for this subscription/region before creating the VM.`,
      };
    }

    if (coresUsage) {
      const coreLimit = Number(coresUsage.limit);
      const coreCurrent = Number(coresUsage.currentValue) || 0;
      if (Number.isFinite(coreLimit) && coreLimit >= 0 && coreLimit < 100000) {
        const coreRemaining = Math.max(0, coreLimit - coreCurrent);
        if (coreRemaining < needCores) {
          return {
            valid: false,
            family: familyName,
            limit: coreLimit,
            current: coreCurrent,
            requiredCores: needCores,
            remaining: coreRemaining,
            message:
              `Azure regional vCPU quota too low in ${location}. ` +
              `Total cores: limit ${coreLimit}, used ${coreCurrent}, remaining ${coreRemaining}, required ${needCores}. ` +
              `Request a quota increase before creating the VM.`,
          };
        }
      }
    }

    return {
      valid: true,
      family: familyName,
      limit,
      current,
      requiredCores: needCores,
      remaining,
      message: `Quota OK for ${size}: ${familyName} has ${remaining} of ${limit} cores free in ${location} (need ${needCores}).`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      family: familyName,
      requiredCores: needCores,
      message: `Could not check Azure quota: ${message}`,
    };
  }
}
