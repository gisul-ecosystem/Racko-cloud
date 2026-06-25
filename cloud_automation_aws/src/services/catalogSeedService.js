import ServiceCategory from '../models/ServiceCategory.js';
import Service from '../models/Service.js';

const categories = [
  { name: 'Compute', description: 'Virtual machines and processing', icon: 'cpu' },
  { name: 'Database', description: 'Managed database services', icon: 'database' },
  { name: 'Storage', description: 'Object and block storage', icon: 'storage' },
  { name: 'Container', description: 'Container orchestration', icon: 'container' },
  { name: 'Serverless', description: 'Function-based compute', icon: 'function' },
  { name: 'Networking', description: 'VPC and connectivity', icon: 'network' },
  { name: 'CDN', description: 'Content delivery', icon: 'globe' },
  { name: 'Messaging', description: 'Queues, notifications, streaming', icon: 'message' },
  { name: 'Analytics', description: 'Big data and data processing', icon: 'chart' },
  { name: 'Search', description: 'Search and analytics engine', icon: 'search' },
  { name: 'ML', description: 'Machine learning infrastructure', icon: 'brain' },
];

const services = [
  { name: 'EC2', category: 'Compute', awsServiceCode: 'AmazonEC2', pricingType: 'instance', description: 'Virtual servers in the cloud' },
  { name: 'Lightsail', category: 'Compute', awsServiceCode: 'AmazonLightsail', pricingType: 'instance', description: 'Simple virtual private servers' },
  { name: 'RDS', category: 'Database', awsServiceCode: 'AmazonRDS', pricingType: 'instance', description: 'Managed relational databases' },
  { name: 'DynamoDB', category: 'Database', awsServiceCode: 'AmazonDynamoDB', pricingType: 'flat_rate', description: 'Managed NoSQL database' },
  { name: 'ElastiCache', category: 'Database', awsServiceCode: 'AmazonElastiCache', pricingType: 'instance', description: 'In-memory caching service' },
  { name: 'Redshift', category: 'Database', awsServiceCode: 'AmazonRedshift', pricingType: 'instance', description: 'Cloud data warehouse' },
  { name: 'S3', category: 'Storage', awsServiceCode: 'AmazonS3', pricingType: 'flat_rate', description: 'Scalable object storage' },
  { name: 'EKS', category: 'Container', awsServiceCode: 'AmazonEKS', pricingType: 'instance', description: 'Managed Kubernetes service' },
  { name: 'Lambda', category: 'Serverless', awsServiceCode: 'AWSLambda', pricingType: 'flat_rate', description: 'Run code without servers' },
  { name: 'VPC', category: 'Networking', awsServiceCode: 'AmazonVPC', pricingType: 'flat_rate', description: 'Isolated cloud network' },
  { name: 'CloudFront', category: 'CDN', awsServiceCode: 'AmazonCloudFront', pricingType: 'flat_rate', description: 'Global content delivery network' },
  { name: 'SQS', category: 'Messaging', awsServiceCode: 'AWSQueueService', pricingType: 'flat_rate', description: 'Managed message queues' },
  { name: 'SNS', category: 'Messaging', awsServiceCode: 'AmazonSNS', pricingType: 'flat_rate', description: 'Managed pub/sub notifications' },
  { name: 'Kinesis', category: 'Messaging', awsServiceCode: 'AmazonKinesis', pricingType: 'flat_rate', description: 'Real-time data streaming' },
  { name: 'EMR', category: 'Analytics', awsServiceCode: 'ElasticMapReduce', pricingType: 'instance', description: 'Big data processing clusters' },
  { name: 'OpenSearch', category: 'Search', awsServiceCode: 'AmazonES', pricingType: 'instance', description: 'Managed search and analytics' },
  { name: 'SageMaker', category: 'ML', awsServiceCode: 'AmazonSageMaker', pricingType: 'instance', description: 'Machine learning platform' },
];

export async function ensureDefaultCatalog() {
  const existingServices = await Service.countDocuments();
  if (existingServices > 0) {
    return { seeded: false, categories: await ServiceCategory.countDocuments(), services: existingServices };
  }

  const categoryMap = new Map();

  for (const category of categories) {
    const existing = await ServiceCategory.findOne({ name: category.name });
    if (existing) {
      categoryMap.set(category.name, existing._id);
      continue;
    }

    const created = await ServiceCategory.create(category);
    categoryMap.set(category.name, created._id);
  }

  for (const service of services) {
    const existing = await Service.findOne({ name: service.name });
    if (existing) continue;

    const categoryId = categoryMap.get(service.category);
    if (!categoryId) continue;

    await Service.create({
      name: service.name,
      categoryId,
      description: service.description,
      awsServiceCode: service.awsServiceCode,
      pricingType: service.pricingType,
      regions: [],
    });
  }

  const categoryCount = await ServiceCategory.countDocuments();
  const serviceCount = await Service.countDocuments();
  console.log(`AWS catalog seeded — ${categoryCount} categories, ${serviceCount} services`);

  return { seeded: true, categories: categoryCount, services: serviceCount };
}
