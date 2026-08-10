export const COSTING_MODE_SHARED = 'shared';
export const COSTING_MODE_PER_USER = 'per_user';

export function normalizeCostingMode(value) {
  const normalized = String(value || COSTING_MODE_SHARED).trim().toLowerCase();
  if (normalized === COSTING_MODE_SHARED || normalized === COSTING_MODE_PER_USER) {
    return normalized;
  }
  return null;
}

export function isPerUserCosting(costingMode) {
  return normalizeCostingMode(costingMode) === COSTING_MODE_PER_USER;
}

export function isSharedCosting(costingMode) {
  return !isPerUserCosting(costingMode);
}
