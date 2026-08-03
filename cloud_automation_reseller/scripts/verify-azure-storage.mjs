import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import CloudRegionPricing from '../src/models/CloudRegionPricing.js';
import { ensureSpecPricing } from '../src/services/ensureSpecPricing.js';
import { fetchAzureDiskMonthly } from '../src/services/azurePricing.js';

const sizes = [32, 64, 128, 256, 512, 1024];
const diskTypes = ['standard_hdd', 'standard_ssd'];

await connectDB();

const results = [];

for (const diskType of diskTypes) {
  for (const size of sizes) {
    const canonicalSpec = `2vcpu-8gb-${size}gbssd`;
    await ensureSpecPricing({
      canonicalSpec,
      category: 'linux',
      vcpu: 2,
      ramGb: 8,
      diskGb: size,
      diskType,
      providers: ['azure'],
    });

    const row = await CloudRegionPricing.findOne({
      provider: 'azure',
      region: 'centralindia',
      category: 'linux',
      canonicalSpec,
      pricingMode: 'normal',
      diskType,
    }).lean();

    const direct = await fetchAzureDiskMonthly('centralindia', size, diskType);

    results.push({
      diskType,
      size,
      sku: direct.skuCode,
      billedTierGb: direct.tierGb,
      directMonthlyUsd: Number(direct.monthlyPrice.toFixed(6)),
      cachedMonthlyUsd: row ? Number((row.rawStoragePricePerHr * 730).toFixed(6)) : null,
      deltaUsd: row ? Number(((row.rawStoragePricePerHr * 730) - direct.monthlyPrice).toFixed(6)) : null,
      cachedRegion: row?.region ?? null,
    });
  }
}

console.log(JSON.stringify(results, null, 2));

await mongoose.disconnect();
