import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import { selectProvider } from '../src/services/providerSelector.js';

const cliSizes = process.argv
  .slice(2)
  .map((value) => Number(value))
  .filter((value) => Number.isFinite(value) && value > 0);
const sizes = cliSizes.length > 0 ? cliSizes : [32, 64, 128, 254, 512, 1024];

function toQuote(selection) {
  const hourlyUsd = selection.rawStoragePricePerHr ?? selection.rawTotalPricePerHr ?? null;
  const monthlyUsd = hourlyUsd == null ? null : hourlyUsd * 730;
  return {
    provider: selection.provider,
    region: selection.region,
    reason: selection.reason,
    canonicalSpec: selection.canonicalSpec,
    hourlyUsd: hourlyUsd == null ? null : Number(hourlyUsd.toFixed(8)),
    monthlyUsd: monthlyUsd == null ? null : Number(monthlyUsd.toFixed(4)),
  };
}

await connectDB();

const results = [];

for (const size of sizes) {
  const ssd = await selectProvider({
    category: 'linux',
    mode: 'storage_only',
    durationDays: 1,
    specs: { disk: size, diskType: 'standard_ssd' },
  });
  const hdd = await selectProvider({
    category: 'linux',
    mode: 'storage_only',
    durationDays: 1,
    specs: { disk: size, diskType: 'standard_hdd' },
  });
  const oci = await selectProvider({
    category: 'linux',
    mode: 'storage_only',
    durationDays: 1,
    specs: { disk: size },
    providers: ['oci'],
  });

  results.push({
    sizeGb: size,
    storageOnlySsd: toQuote(ssd),
    storageOnlyHdd: toQuote(hdd),
    ociBlockVolume: toQuote(oci),
  });
}

console.log(JSON.stringify(results, null, 2));

await mongoose.disconnect();
