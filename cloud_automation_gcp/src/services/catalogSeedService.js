import ServiceCategory from '../models/ServiceCategory.js';
import Service from '../models/Service.js';
import ServicePricing from '../models/ServicePricing.js';
import { CATALOG_CATEGORIES, CATALOG_SERVICES } from '../config/serviceCatalog.js';
import { GCP_SYNC_REGIONS, GCP_REGION_NAMES, hasGcpPricingAuth } from '../config/gcp.js';
import { getLivePricingForService } from './gcpLivePricingService.js';

async function upsertCategory(category) {
  const existing = await ServiceCategory.findOne({ name: category.name });
  if (existing) return existing._id;
  const created = await ServiceCategory.create(category);
  return created._id;
}

async function seedPricingRows(serviceDoc, serviceDef) {
  for (const region of GCP_SYNC_REGIONS) {
    for (const instance of serviceDef.instances) {
      let pricePerHour = instance.pricePerHour;
      let pricePerDay = pricePerHour != null ? Number((pricePerHour * 24).toFixed(4)) : 0;

      if (serviceDoc.pricingType === 'flat_rate') {
        const tier = serviceDef.instances.find((i) => i.instanceType === instance.instanceType);
        const flatDaily = tier?.pricePerDay;
        if (flatDaily != null) {
          pricePerDay = flatDaily;
          pricePerHour = Number((flatDaily / 24).toFixed(6));
        }
      }

      if (hasGcpPricingAuth()) {
        try {
          const live = await getLivePricingForService(
            serviceDoc,
            instance.instanceType,
            region
          );
          if (live?.pricePerHour) {
            pricePerHour = live.pricePerHour;
            pricePerDay = live.pricePerDay ?? Number((pricePerHour * 24).toFixed(4));
          }
        } catch {
          // keep seed defaults when live API unavailable
        }
      }

      await ServicePricing.findOneAndUpdate(
        {
          serviceId: serviceDoc._id,
          instanceType: instance.instanceType,
          region,
        },
        {
          serviceId: serviceDoc._id,
          serviceName: serviceDoc.name,
          instanceType: instance.instanceType,
          region,
          pricePerHour: pricePerHour || 0,
          pricePerDay: pricePerDay || 0,
          unitPrice: pricePerHour || 0,
          priceUnit: serviceDoc.pricingType === 'flat_rate' ? 'day' : 'hour',
          currency: 'USD',
          syncedAt: new Date(),
        },
        { upsert: true, returnDocument: 'after' }
      );
    }
  }
}

export async function ensureDefaultCatalog() {
  const categoryMap = new Map();

  for (const category of CATALOG_CATEGORIES) {
    categoryMap.set(category.name, await upsertCategory(category));
  }

  let created = 0;
  let updated = 0;

  for (const service of CATALOG_SERVICES) {
    const categoryId = categoryMap.get(service.category);
    if (!categoryId) continue;

    const existing = await Service.findOne({ name: service.name });
    const serviceDoc = await Service.findOneAndUpdate(
      { name: service.name },
      {
        name: service.name,
        categoryId,
        description: service.description,
        gcpServiceCode: service.gcpServiceCode,
        pricingType: service.pricingType,
        regions: GCP_SYNC_REGIONS,
      },
      { upsert: true, returnDocument: 'after' }
    );

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }

    await seedPricingRows(serviceDoc, service);
  }

  const categoryCount = await ServiceCategory.countDocuments();
  const serviceCount = await Service.countDocuments();
  console.log(
    `[gcp catalog] ${categoryCount} categories, ${serviceCount} services (created ${created}, updated ${updated})`
  );

  return { categories: categoryCount, services: serviceCount, created, updated };
}

export function listRegionNames() {
  return GCP_SYNC_REGIONS.map((code) => ({
    code,
    name: GCP_REGION_NAMES[code] || code,
  }));
}
