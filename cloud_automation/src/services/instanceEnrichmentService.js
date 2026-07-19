const { resolveInstanceGuide } = require('../config/instanceCatalog');
const { getServiceRegionalHourlyPrices } = require('./estimatePricingService');

const DEFAULT_PRICE_REGION = 'eastus';

const enrichInstances = async (instances, servicesById, location = '') => {
  const normalizedLocation = String(location || '').trim().toLowerCase();
  const priceRegion = normalizedLocation || DEFAULT_PRICE_REGION;
  const priceIsEstimate = !normalizedLocation;

  return Promise.all(
    instances.map(async (instance) => {
      const serviceId = Number(instance.serviceId ?? instance.service_id);
      const service = servicesById.get(serviceId);
      const optionName = String(instance.option_name || '').trim();
      const guide = resolveInstanceGuide(service?.name, optionName);

      let hourlyPrice = null;
      let currency = 'USD';

      if (service) {
        try {
          const priceByRegion = await getServiceRegionalHourlyPrices(service, optionName);
          const regionalPrice = priceByRegion.get(priceRegion);

          if (Number.isFinite(regionalPrice)) {
            const portalHourly = Math.max(0, Number(service.price_per_user || 0));
            hourlyPrice = regionalPrice + portalHourly;
          }
        } catch {
          hourlyPrice = null;
        }
      }

      return {
        ...instance,
        guide,
        hourlyPrice,
        dailyPrice: hourlyPrice != null ? hourlyPrice * 24 : null,
        currency,
        priceRegion,
        priceIsEstimate
      };
    })
  );
};

module.exports = {
  enrichInstances,
  resolveInstanceGuide
};
