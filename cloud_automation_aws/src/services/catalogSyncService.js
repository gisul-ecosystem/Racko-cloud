import { GetProductsCommand } from '@aws-sdk/client-pricing';
import { pricingClient } from '../config/aws.js';
import Service from '../models/Service.js';
import ServicePricing from '../models/ServicePricing.js';

export const REGION_NAME_MAP = {
  'ap-south-1': 'Asia Pacific (Mumbai)',
  'us-east-1': 'US East (N. Virginia)',
  'us-west-2': 'US West (Oregon)',
  'eu-west-1': 'EU (Ireland)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
};

export const SYNC_REGIONS = Object.keys(REGION_NAME_MAP);

export const INSTANCE_FILTERS = {
  EC2: ['t3.micro', 't3.small', 't3.medium', 't3.large', 'm5.large', 'm5.xlarge', 'm5.2xlarge', 'c5.large', 'c5.xlarge'],
  RDS: ['db.t3.micro', 'db.t3.small', 'db.t3.medium', 'db.m5.large', 'db.m5.xlarge'],
  EKS: ['t3.medium', 't3.large', 'm5.large', 'm5.xlarge'],
  ElastiCache: ['cache.t3.micro', 'cache.t3.small', 'cache.t3.medium', 'cache.m5.large'],
  Redshift: ['dc2.large', 'dc2.8xlarge', 'ra3.xlplus', 'ra3.4xlarge'],
  OpenSearch: ['t3.small.search', 't3.medium.search', 'm5.large.search', 'm5.xlarge.search'],
  EMR: ['m5.xlarge', 'm5.2xlarge', 'c5.xlarge', 'r5.xlarge'],
  SageMaker: ['ml.t3.medium', 'ml.t3.large', 'ml.m5.large', 'ml.m5.xlarge', 'ml.p3.2xlarge'],
  Lightsail: ['nano', 'micro', 'small', 'medium', 'large', 'xlarge'],
  Lambda: null,
  S3: null,
  CloudFront: null,
  SQS: null,
  SNS: null,
  Kinesis: null,
  DynamoDB: null,
  VPC: null,
};

const FLAT_RATE_INSTANCE_TYPES = {
  Lambda: 'per-GB-second',
  S3: 'per-GB',
  CloudFront: 'per-GB-transferred',
  SQS: 'per-million-requests',
  SNS: 'per-million-notifications',
  Kinesis: 'per-shard-hour',
  DynamoDB: 'per-RCU-WCU',
  VPC: 'per-NAT-gateway-hour',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractPrice = (priceList) => {
  if (!priceList?.length) return null;

  const product = JSON.parse(priceList[0]);
  const onDemandTerms = product.terms?.OnDemand;
  if (!onDemandTerms) return null;

  const termKey = Object.keys(onDemandTerms)[0];
  if (!termKey) return null;

  const priceDimensions = onDemandTerms[termKey]?.priceDimensions;
  if (!priceDimensions) return null;

  const dimKey = Object.keys(priceDimensions)[0];
  if (!dimKey) return null;

  const dimension = priceDimensions[dimKey];
  const unitPrice = parseFloat(dimension.pricePerUnit?.USD ?? '0');
  if (Number.isNaN(unitPrice)) return null;

  return {
    unitPrice,
    priceUnit: dimension.unit || dimension.description || 'unit',
  };
};

const buildInstanceFilters = (serviceName, awsServiceCode, instanceType, locationName) => {
  const base = [
    { Type: 'TERM_MATCH', Field: 'location', Value: locationName },
  ];

  switch (serviceName) {
    case 'EC2':
      return [
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'location', Value: locationName },
        { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
        { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
        { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
        { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' },
      ];
    case 'RDS':
      return [
        ...base,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'databaseEngine', Value: 'MySQL' },
        { Type: 'TERM_MATCH', Field: 'deploymentOption', Value: 'Single-AZ' },
      ];
    case 'ElastiCache':
      return [
        ...base,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'cacheEngine', Value: 'Redis' },
      ];
    case 'Redshift':
      return [
        ...base,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
      ];
    case 'OpenSearch':
      return [
        ...base,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
      ];
    case 'EMR':
      return [
        ...base,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
      ];
    case 'SageMaker':
      return [
        ...base,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'component', Value: 'Notebook' },
      ];
    case 'Lightsail':
      return [
        ...base,
        { Type: 'TERM_MATCH', Field: 'bundleType', Value: instanceType },
      ];
    case 'EKS':
      return [
        ...base,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
      ];
    default:
      return [
        ...base,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
      ];
  }
};

const fetchPricing = async (serviceCode, filters) => {
  const command = new GetProductsCommand({
    ServiceCode: serviceCode,
    Filters: filters,
    MaxResults: 1,
  });

  const data = await pricingClient.send(command);
  return extractPrice(data.PriceList);
};

const upsertPricing = async ({
  serviceId,
  serviceName,
  instanceType,
  region,
  pricePerHour,
  pricePerDay,
  priceUnit,
  unitPrice,
  pricingType,
}) => {
  const update = {
    serviceName,
    pricePerHour: pricingType === 'flat_rate' ? 0 : pricePerHour,
    pricePerDay: pricingType === 'flat_rate' ? 0 : pricePerDay,
    priceUnit,
    currency: 'USD',
    syncedAt: new Date(),
  };

  if (pricingType === 'flat_rate') {
    update.unitPrice = unitPrice;
  }

  await ServicePricing.findOneAndUpdate(
    { serviceId, instanceType, region },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const syncAWSCatalog = async () => {
  const results = { synced: 0, skipped: 0, errors: 0, duration: 0 };
  const start = Date.now();

  const dbServices = await Service.find().lean();

  const LIGHTSAIL_BUNDLES = [
    { instanceType: 'nano_3_0', pricePerHour: 0.00521, pricePerDay: 0.125 },
    { instanceType: 'micro_3_0', pricePerHour: 0.01042, pricePerDay: 0.25 },
    { instanceType: 'small_3_0', pricePerHour: 0.02083, pricePerDay: 0.50 },
    { instanceType: 'medium_3_0', pricePerHour: 0.04167, pricePerDay: 1.00 },
    { instanceType: 'large_3_0', pricePerHour: 0.08333, pricePerDay: 2.00 },
    { instanceType: 'xlarge_3_0', pricePerHour: 0.16667, pricePerDay: 4.00 },
  ];

  const lightsailService = dbServices.find((s) => s.name === 'Lightsail');
  if (lightsailService) {
    for (const bundle of LIGHTSAIL_BUNDLES) {
      for (const region of SYNC_REGIONS) {
        await ServicePricing.findOneAndUpdate(
          { serviceId: lightsailService._id, instanceType: bundle.instanceType, region },
          {
            serviceId: lightsailService._id,
            serviceName: 'Lightsail',
            instanceType: bundle.instanceType,
            region,
            pricePerHour: bundle.pricePerHour,
            pricePerDay: bundle.pricePerDay,
            priceUnit: 'Hrs',
            currency: 'USD',
            syncedAt: new Date(),
          },
          { upsert: true, new: true }
        );
        results.synced++;
      }
    }
  }

  for (const service of dbServices) {
    if (service.name === 'Lightsail') continue;

    const instanceTypes = INSTANCE_FILTERS[service.name];

    if (service.pricingType === 'instance') {
      if (service.name === 'EKS') {
        const EKS_INSTANCES = ['t3.medium', 't3.large', 'm5.large', 'm5.xlarge'];
        for (const instanceType of EKS_INSTANCES) {
          for (const region of SYNC_REGIONS) {
            const locationName = REGION_NAME_MAP[region];
            try {
              const command = new GetProductsCommand({
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
              });
              const data = await pricingClient.send(command);
              if (!data.PriceList || data.PriceList.length === 0) {
                results.skipped++;
                continue;
              }
              const product = JSON.parse(data.PriceList[0]);
              const onDemand = product.terms.OnDemand;
              const termKey = Object.keys(onDemand)[0];
              const dims = onDemand[termKey].priceDimensions;
              const dimKey = Object.keys(dims)[0];
              const pricePerHour = parseFloat(dims[dimKey].pricePerUnit.USD) || 0;

              await ServicePricing.findOneAndUpdate(
                { serviceId: service._id, instanceType, region },
                {
                  serviceId: service._id,
                  serviceName: 'EKS',
                  instanceType,
                  region,
                  pricePerHour,
                  pricePerDay: pricePerHour * 24,
                  priceUnit: 'Hrs',
                  currency: 'USD',
                  syncedAt: new Date(),
                },
                { upsert: true, new: true }
              );
              results.synced++;
            } catch (err) {
              console.error(`EKS sync error ${instanceType} ${region}:`, err.message);
              results.errors++;
            }
          }
        }
        continue;
      }

      if (service.name === 'SageMaker') {
        const SAGEMAKER_FALLBACK = {
          'ml.t3.medium': { pricePerHour: 0.0464, pricePerDay: 1.1136 },
          'ml.t3.large': { pricePerHour: 0.0928, pricePerDay: 2.2272 },
          'ml.m5.large': { pricePerHour: 0.1150, pricePerDay: 2.7600 },
          'ml.m5.xlarge': { pricePerHour: 0.2300, pricePerDay: 5.5200 },
          'ml.p3.2xlarge': { pricePerHour: 3.8250, pricePerDay: 91.8000 },
        };

        for (const instanceType of Object.keys(SAGEMAKER_FALLBACK)) {
          for (const region of SYNC_REGIONS) {
            const locationName = REGION_NAME_MAP[region];
            let pricePerHour = SAGEMAKER_FALLBACK[instanceType].pricePerHour;
            let pricePerDay = SAGEMAKER_FALLBACK[instanceType].pricePerDay;

            try {
              const command = new GetProductsCommand({
                ServiceCode: 'AmazonSageMaker',
                Filters: [
                  { Type: 'TERM_MATCH', Field: 'instanceName', Value: instanceType },
                  { Type: 'TERM_MATCH', Field: 'location', Value: locationName },
                  { Type: 'TERM_MATCH', Field: 'component', Value: 'Hosting' },
                ],
                MaxResults: 1,
              });
              const data = await pricingClient.send(command);
              if (data.PriceList && data.PriceList.length > 0) {
                const product = JSON.parse(data.PriceList[0]);
                const onDemand = product.terms.OnDemand;
                const termKey = Object.keys(onDemand)[0];
                const dims = onDemand[termKey].priceDimensions;
                const dimKey = Object.keys(dims)[0];
                const apiPrice = parseFloat(dims[dimKey].pricePerUnit.USD);
                if (apiPrice > 0) {
                  pricePerHour = apiPrice;
                  pricePerDay = apiPrice * 24;
                }
              }
            } catch {
              // silently use fallback
            }

            await ServicePricing.findOneAndUpdate(
              { serviceId: service._id, instanceType, region },
              {
                serviceId: service._id,
                serviceName: 'SageMaker',
                instanceType,
                region,
                pricePerHour,
                pricePerDay,
                priceUnit: 'Hrs',
                currency: 'USD',
                syncedAt: new Date(),
              },
              { upsert: true, new: true }
            );
            results.synced++;
          }
        }
        continue;
      }

      if (!instanceTypes?.length) {
        console.warn(`No instance filters for ${service.name}, skipping`);
        continue;
      }

      for (const region of SYNC_REGIONS) {
        const locationName = REGION_NAME_MAP[region];

        for (const instanceType of instanceTypes) {
          try {
            const filters = buildInstanceFilters(
              service.name,
              service.awsServiceCode,
              instanceType,
              locationName
            );

            const price = await fetchPricing(service.awsServiceCode, filters);
            await sleep(100);

            if (!price) {
              console.log(`No price: ${service.name} ${instanceType} ${region}`);
              results.skipped += 1;
              continue;
            }

            const pricePerHour = price.unitPrice;
            const pricePerDay = parseFloat((pricePerHour * 24).toFixed(6));

            await upsertPricing({
              serviceId: service._id,
              serviceName: service.name,
              instanceType,
              region,
              pricePerHour,
              pricePerDay,
              priceUnit: price.priceUnit,
              pricingType: 'instance',
            });

            results.synced += 1;
          } catch (err) {
            console.error(`Sync error ${service.name} ${instanceType} ${region}:`, err.message);
            results.errors += 1;
          }
        }
      }
    } else {
      const instanceType = FLAT_RATE_INSTANCE_TYPES[service.name] || 'flat-rate';

      for (const region of SYNC_REGIONS) {
        const locationName = REGION_NAME_MAP[region];

        try {
          const filters = [{ Type: 'TERM_MATCH', Field: 'location', Value: locationName }];
          const price = await fetchPricing(service.awsServiceCode, filters);
          await sleep(100);

          if (!price) {
            console.log(`No flat rate price: ${service.name} ${region}`);
            results.skipped += 1;
            continue;
          }

          await upsertPricing({
            serviceId: service._id,
            serviceName: service.name,
            instanceType,
            region,
            pricePerHour: 0,
            pricePerDay: 0,
            priceUnit: price.priceUnit,
            unitPrice: price.unitPrice,
            pricingType: 'flat_rate',
          });

          results.synced += 1;
        } catch (err) {
          console.error(`Sync error ${service.name} ${region}:`, err.message);
          results.errors += 1;
        }
      }
    }
  }

  results.duration = Date.now() - start;
  return results;
};
