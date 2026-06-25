import { DescribeRegionsCommand, DescribeInstanceTypesCommand } from '@aws-sdk/client-ec2';
import { DescribeOrderableDBInstanceOptionsCommand } from '@aws-sdk/client-rds';
import { GetProductsCommand } from '@aws-sdk/client-pricing';
import cron from 'node-cron';
import { ec2Client, pricingClient, rdsClient } from '../config/aws.js';
import { provisioningConfig } from '../config/provisioning.js';
import Service from '../models/Service.js';
import ServicePricing from '../models/ServicePricing.js';
import { REGION_NAME_MAP, SYNC_REGIONS } from '../services/catalogSyncService.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function discoverRegions() {
  const response = await ec2Client.send(new DescribeRegionsCommand({ AllRegions: false }));
  return (response.Regions || [])
    .map((region) => region.RegionName)
    .filter(Boolean);
}

async function discoverEc2InstanceTypes() {
  const types = new Set();
  let nextToken;

  do {
    const response = await ec2Client.send(
      new DescribeInstanceTypesCommand({ NextToken: nextToken, MaxResults: 100 })
    );

    for (const entry of response.InstanceTypes || []) {
      if (entry.InstanceType) types.add(entry.InstanceType);
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return [...types];
}

async function discoverRdsInstanceTypes(region) {
  const client = rdsClient;
  const response = await client.send(new DescribeOrderableDBInstanceOptionsCommand({ MaxRecords: 100 }));
  return [...new Set((response.OrderableDBInstanceOptions || []).map((entry) => entry.DBInstanceClass).filter(Boolean))];
}

async function upsertPricingRecord({ service, instanceType, region, pricePerHour, pricePerDay, priceUnit }) {
  await ServicePricing.findOneAndUpdate(
    { serviceId: service._id, instanceType, region },
    {
      serviceId: service._id,
      serviceName: service.name,
      instanceType,
      region,
      pricePerHour,
      pricePerDay,
      priceUnit: priceUnit || 'Hrs',
      currency: 'USD',
      syncedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function syncEc2PricingForRegion(service, region, instanceTypes) {
  const locationName = REGION_NAME_MAP[region];
  if (!locationName) return 0;

  let synced = 0;

  for (const instanceType of instanceTypes.slice(0, 20)) {
    try {
      const data = await pricingClient.send(
        new GetProductsCommand({
          ServiceCode: 'AmazonEC2',
          Filters: [
            { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
            { Type: 'TERM_MATCH', Field: 'location', Value: locationName },
            { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
            { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
            { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
            { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' },
          ],
          MaxResults: 1,
        })
      );

      if (!data.PriceList?.length) continue;

      const product = JSON.parse(data.PriceList[0]);
      const onDemand = product.terms?.OnDemand;
      const termKey = Object.keys(onDemand || {})[0];
      const dims = onDemand?.[termKey]?.priceDimensions;
      const dimKey = Object.keys(dims || {})[0];
      const pricePerHour = parseFloat(dims?.[dimKey]?.pricePerUnit?.USD || '0');
      if (pricePerHour <= 0) continue;

      await upsertPricingRecord({
        service,
        instanceType,
        region,
        pricePerHour,
        pricePerDay: pricePerHour * 24,
        priceUnit: dims?.[dimKey]?.unit || 'Hrs',
      });

      synced += 1;
      await sleep(100);
    } catch (err) {
      console.error(`catalogScheduler EC2 ${instanceType} ${region}:`, err.message);
    }
  }

  return synced;
}

export async function runIncrementalCatalogSync() {
  const startedAt = Date.now();
  const results = { regions: 0, instances: 0, pricingUpserts: 0, duration: 0 };

  const regions = await discoverRegions();
  results.regions = regions.length;

  const ec2Service = await Service.findOne({ name: 'EC2' }).lean();
  const ec2InstanceTypes = await discoverEc2InstanceTypes();
  results.instances = ec2InstanceTypes.length;

  const targetRegions = SYNC_REGIONS.filter((region) => regions.includes(region));

  if (ec2Service) {
    for (const region of targetRegions) {
      const synced = await syncEc2PricingForRegion(ec2Service, region, ec2InstanceTypes);
      results.pricingUpserts += synced;
    }
  }

  try {
    await discoverRdsInstanceTypes(process.env.AWS_REGION || 'ap-south-1');
  } catch (err) {
    console.error('catalogScheduler RDS discovery skipped:', err.message);
  }

  results.duration = Date.now() - startedAt;
  console.log(`catalogScheduler completed: ${JSON.stringify(results)}`);
  return results;
}

export function startCatalogScheduler() {
  if (!provisioningConfig.enableCatalogScheduler) {
    console.log('Catalog scheduler disabled (ENABLE_CATALOG_SCHEDULER=false)');
    return null;
  }

  const task = cron.schedule(provisioningConfig.catalogSyncCron, () => {
    void runIncrementalCatalogSync().catch((err) => {
      console.error('catalogScheduler failed:', err.message);
    });
  });

  console.log(`Catalog scheduler registered (${provisioningConfig.catalogSyncCron})`);
  return task;
}
