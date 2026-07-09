const AppError = require('../utils/AppError');
const { calculateEstimate } = require('./estimatePricingService');

const calculatePricing = async (payload = {}) => {
  const result = await calculateEstimate({
    accountCount: payload.accountCount,
    serviceIds: payload.serviceIds,
    location: payload.location,
    startDate: payload.startDate,
    endDate: payload.endDate,
    selectedInstances: payload.selectedInstances,
    selectedRoles: payload.selectedRoles,
    costingMode: payload.costingMode,
    usageWindows: payload.usageWindows
  });

  return {
    success: true,
    services: result.services,
    baseHourlyPrice: result.baseHourlyPrice,
    basePrice: result.basePrice,
    durationHours: result.durationHours,
    calendarHours: result.calendarHours,
    billableHours: result.billableHours,
    usesUsageWindows: result.usesUsageWindows,
    duration: result.duration,
    accounts: result.accounts,
    totalPrice: result.totalPrice,
    currency: result.currency,
    roleCount: result.roleCount,
    costingMode: result.costingMode,
    portalHourlyTotal: result.portalHourlyTotal,
    infraHourlyTotal: result.infraHourlyTotal,
    estimatedPrice: result.totalPrice
  };
};

module.exports = {
  calculatePricing
};
