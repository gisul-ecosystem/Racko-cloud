/** Short, user-friendly blurbs for AWS instance / bundle options in the create-request flow. */
export const INSTANCE_DESCRIPTIONS = {
  // EC2, EKS, EMR (shared instance families)
  't3.micro': '2 vCPU, 1 GiB — burstable; ideal for dev and light testing',
  't3.small': '2 vCPU, 2 GiB — burstable; small apps and low-traffic sites',
  't3.medium': '2 vCPU, 4 GiB — burstable; moderate web apps and APIs',
  't3.large': '2 vCPU, 8 GiB — burstable; larger dev or staging environments',
  'm5.large': '2 vCPU, 8 GiB — balanced general-purpose compute',
  'm5.xlarge': '4 vCPU, 16 GiB — steady performance for production workloads',
  'm5.2xlarge': '8 vCPU, 32 GiB — heavier multi-threaded or distributed jobs',
  'c5.large': '2 vCPU, 4 GiB — compute-optimized for CPU-intensive tasks',
  'c5.xlarge': '4 vCPU, 8 GiB — high CPU for batch jobs and processing',
  'r5.xlarge': '4 vCPU, 32 GiB — memory-optimized for large in-memory datasets',

  // RDS
  'db.t3.micro': '2 vCPU, 1 GiB — smallest managed database for dev/test',
  'db.t3.small': '2 vCPU, 2 GiB — small databases and low-traffic apps',
  'db.t3.medium': '2 vCPU, 4 GiB — moderate database workloads',
  'db.m5.large': '2 vCPU, 8 GiB — production databases with steady load',
  'db.m5.xlarge': '4 vCPU, 16 GiB — larger production databases',

  // ElastiCache
  'cache.t3.micro': '2 vCPU, 0.5 GiB — smallest Redis/Memcached for dev',
  'cache.t3.small': '2 vCPU, 1.4 GiB — light caching for small apps',
  'cache.t3.medium': '2 vCPU, 3.1 GiB — moderate cache workloads',
  'cache.m5.large': '2 vCPU, 6.4 GiB — production-grade in-memory cache',

  // Redshift
  'dc2.large': '160 GB local SSD — entry-level data warehouse node',
  'dc2.8xlarge': '2.56 TB local SSD — large-scale analytics clusters',
  'ra3.xlplus': '4 vCPU, 32 GiB — modern warehouse with managed storage',
  'ra3.4xlarge': '12 vCPU, 96 GiB — high-capacity analytics workloads',

  // OpenSearch
  't3.small.search': '2 vCPU, 2 GiB — dev or small search/index clusters',
  't3.medium.search': '2 vCPU, 4 GiB — small production search workloads',
  'm5.large.search': '2 vCPU, 8 GiB — production search and log analytics',
  'm5.xlarge.search': '4 vCPU, 16 GiB — larger indexing and query loads',

  // SageMaker
  'ml.t3.medium': '2 vCPU, 4 GiB — notebooks and small training jobs',
  'ml.t3.large': '2 vCPU, 8 GiB — lightweight model training',
  'ml.m5.large': '2 vCPU, 8 GiB — general ML training and inference',
  'ml.m5.xlarge': '4 vCPU, 16 GiB — larger model training workloads',
  'ml.p3.2xlarge': '8 vCPU, 61 GiB, 1 GPU — GPU-accelerated deep learning',

  // Lightsail bundles
  nano: '512 MB RAM, 1 vCPU — simplest VPS for static sites',
  micro: '1 GB RAM, 1 vCPU — tiny apps and learning projects',
  small: '2 GB RAM, 1 vCPU — small web applications',
  medium: '4 GB RAM, 2 vCPU — moderate-traffic applications',
  large: '8 GB RAM, 2 vCPU — larger web apps and services',
  xlarge: '16 GB RAM, 4 vCPU — demanding applications',
  nano_3_0: '512 MB RAM, 1 vCPU — simplest VPS for static sites',
  micro_3_0: '1 GB RAM, 1 vCPU — tiny apps and learning projects',
  small_3_0: '2 GB RAM, 1 vCPU — small web applications',
  medium_3_0: '4 GB RAM, 2 vCPU — moderate-traffic applications',
  large_3_0: '8 GB RAM, 2 vCPU — larger web apps and services',
  xlarge_3_0: '16 GB RAM, 4 vCPU — demanding applications',
};

export function getInstanceDescription(instanceType) {
  return INSTANCE_DESCRIPTIONS[instanceType] ?? null;
}
