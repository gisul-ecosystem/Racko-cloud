/** Normalize Azure region names for comparison (e.g. "Central India" → "centralindia"). */
export function normalizeAzureRegion(location) {
  return String(location || '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

const HARD_BLOCK_REASONS = new Set([
  'Capacity',
  'NotAvailableForSubscription',
  'NotAvailableForResourceGroup',
]);

/**
 * Parse location-level blocks from Azure Resource SKUs API payload.
 * @returns {Record<string, string[]>}
 */
export function parseSkuBlockedLocations(sku) {
  /** @type {Map<string, Set<string>>} */
  const blocked = new Map();

  const addBlock = (location, reasonCode) => {
    const loc = normalizeAzureRegion(location);
    if (!loc) return;
    if (!blocked.has(loc)) blocked.set(loc, new Set());
    blocked.get(loc).add(String(reasonCode || 'Restricted'));
  };

  for (const restriction of sku.restrictions || []) {
    const code = restriction.reasonCode || 'Restricted';
    if (restriction.type === 'Location' && Array.isArray(restriction.values)) {
      for (const value of restriction.values) {
        addBlock(value, code);
      }
      continue;
    }
    if (code === 'NotAvailableForSubscription' && Array.isArray(restriction.values)) {
      for (const value of restriction.values) {
        addBlock(value, code);
      }
    }
  }

  for (const locationInfo of sku.locationInfo || []) {
    const baseLocation = locationInfo.location;
    for (const restriction of locationInfo.restrictions || []) {
      const code = restriction.reasonCode || 'Restricted';
      if (restriction.type === 'Location' && Array.isArray(restriction.values)) {
        for (const value of restriction.values) {
          addBlock(value, code);
        }
      } else if (baseLocation) {
        addBlock(baseLocation, code);
      }
    }
  }

  return Object.fromEntries(
    [...blocked.entries()].map(([loc, reasons]) => [loc, [...reasons]])
  );
}

export function skuRecordAvailableInRegion(skuRecord, region) {
  if (!skuRecord) return false;
  const normRegion = normalizeAzureRegion(region);
  const locations = skuRecord.locations || [];
  if (
    locations.length > 0 &&
    !locations.some((loc) => normalizeAzureRegion(loc) === normRegion)
  ) {
    return false;
  }

  const blocks = skuRecord.blockedLocations?.[normRegion] || [];
  return !blocks.some((code) => HARD_BLOCK_REASONS.has(code));
}

export function skuAvailabilityMessage(skuRecord, region) {
  const normRegion = normalizeAzureRegion(region);
  const blocks = skuRecord?.blockedLocations?.[normRegion] || [];
  const hard = blocks.filter((code) => HARD_BLOCK_REASONS.has(code));
  if (hard.length > 0) {
    return `${skuRecord.name} is blocked in ${region} (${hard.join(', ')}). Choose another VM size.`;
  }
  if (
    skuRecord?.locations?.length &&
    !skuRecord.locations.some((loc) => normalizeAzureRegion(loc) === normRegion)
  ) {
    return `${skuRecord.name} is not offered in ${region}.`;
  }
  return null;
}
