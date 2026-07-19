const COSTING_MODE_SHARED = 'shared';
const COSTING_MODE_PER_USER = 'per_user';
const VALID_COSTING_MODES = new Set([COSTING_MODE_SHARED, COSTING_MODE_PER_USER]);

const normalizeCostingMode = (value) => {
  const normalized = String(value || COSTING_MODE_SHARED).trim().toLowerCase();

  if (!VALID_COSTING_MODES.has(normalized)) {
    return null;
  }

  return normalized;
};

const isPerUserCosting = (costingMode) =>
  normalizeCostingMode(costingMode) === COSTING_MODE_PER_USER;

const isSharedCosting = (costingMode) =>
  normalizeCostingMode(costingMode) !== COSTING_MODE_PER_USER;

const buildSharedResourceGroupName = (requestId) => `RG-CUST-${requestId}`;

const buildPerUserResourceGroupName = (requestId, userNumber) =>
  `RG-CUST-${requestId}-U${userNumber}`;

module.exports = {
  COSTING_MODE_SHARED,
  COSTING_MODE_PER_USER,
  VALID_COSTING_MODES,
  normalizeCostingMode,
  isPerUserCosting,
  isSharedCosting,
  buildSharedResourceGroupName,
  buildPerUserResourceGroupName
};
