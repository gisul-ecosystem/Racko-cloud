/**
 * GCP lab service catalog — 25 services with default instance / tier options.
 * Live Compute Engine rates come from Cloud Billing Catalog API when creds exist.
 */

export const CATALOG_CATEGORIES = [
  { name: 'Compute', description: 'Virtual machines and processing', icon: 'cpu' },
  { name: 'Database', description: 'Managed database services', icon: 'database' },
  { name: 'Storage', description: 'Object and block storage', icon: 'storage' },
  { name: 'Container', description: 'Container orchestration', icon: 'container' },
  { name: 'Serverless', description: 'Function and app hosting', icon: 'function' },
  { name: 'Networking', description: 'VPC, DNS, CDN, load balancing', icon: 'network' },
  { name: 'Analytics', description: 'Big data and messaging', icon: 'chart' },
  { name: 'ML', description: 'Machine learning', icon: 'brain' },
  { name: 'Security', description: 'Secrets and encryption', icon: 'shield' },
];

/** @typedef {{ name: string, category: string, gcpServiceCode: string, pricingType: 'instance'|'flat_rate', description: string, instances: Array<{ instanceType: string, label?: string, pricePerHour?: number }> }} CatalogService */

/** @type {CatalogService[]} */
export const CATALOG_SERVICES = [
  {
    name: 'Compute Engine',
    category: 'Compute',
    gcpServiceCode: 'compute.googleapis.com',
    pricingType: 'instance',
    description: 'Virtual machines (VMs)',
    instances: [
      { instanceType: 'e2-micro', label: 'E2 Micro', pricePerHour: 0.0084 },
      { instanceType: 'e2-small', label: 'E2 Small', pricePerHour: 0.0168 },
      { instanceType: 'e2-medium', label: 'E2 Medium', pricePerHour: 0.0335 },
      { instanceType: 'e2-standard-2', label: 'E2 Standard 2 vCPU', pricePerHour: 0.067 },
      { instanceType: 'e2-standard-4', label: 'E2 Standard 4 vCPU', pricePerHour: 0.134 },
      { instanceType: 'e2-standard-8', label: 'E2 Standard 8 vCPU', pricePerHour: 0.268 },
    ],
  },
  {
    name: 'Cloud Run',
    category: 'Serverless',
    gcpServiceCode: 'run.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Fully managed serverless containers',
    instances: [
      { instanceType: 'run-light', label: 'Light' },
      { instanceType: 'run-standard', label: 'Standard' },
      { instanceType: 'run-heavy', label: 'Heavy' },
    ],
  },
  {
    name: 'Cloud Functions',
    category: 'Serverless',
    gcpServiceCode: 'cloudfunctions.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Event-driven serverless functions',
    instances: [
      { instanceType: 'functions-light', label: 'Light' },
      { instanceType: 'functions-standard', label: 'Standard' },
      { instanceType: 'functions-heavy', label: 'Heavy' },
    ],
  },
  {
    name: 'App Engine',
    category: 'Serverless',
    gcpServiceCode: 'appengine.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Managed application platform',
    instances: [
      { instanceType: 'appengine-light', label: 'Light' },
      { instanceType: 'appengine-standard', label: 'Standard' },
    ],
  },
  {
    name: 'Cloud SQL',
    category: 'Database',
    gcpServiceCode: 'sqladmin.googleapis.com',
    pricingType: 'instance',
    description: 'Managed MySQL, PostgreSQL, SQL Server',
    instances: [
      { instanceType: 'db-f1-micro', label: 'db-f1-micro', pricePerHour: 0.015 },
      { instanceType: 'db-g1-small', label: 'db-g1-small', pricePerHour: 0.035 },
      { instanceType: 'db-custom-2-7680', label: 'db-custom-2-7680', pricePerHour: 0.095 },
    ],
  },
  {
    name: 'Firestore',
    category: 'Database',
    gcpServiceCode: 'firestore.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Serverless document database',
    instances: [
      { instanceType: 'firestore-light', label: 'Light' },
      { instanceType: 'firestore-standard', label: 'Standard' },
    ],
  },
  {
    name: 'Cloud Spanner',
    category: 'Database',
    gcpServiceCode: 'spanner.googleapis.com',
    pricingType: 'instance',
    description: 'Globally distributed relational DB',
    instances: [
      { instanceType: 'spanner-1-node', label: '1 node', pricePerHour: 0.9 },
      { instanceType: 'spanner-3-node', label: '3 nodes', pricePerHour: 2.7 },
    ],
  },
  {
    name: 'Memorystore',
    category: 'Database',
    gcpServiceCode: 'redis.googleapis.com',
    pricingType: 'instance',
    description: 'Managed Redis and Memcached',
    instances: [
      { instanceType: 'redis-basic-m1', label: 'Basic M1', pricePerHour: 0.049 },
      { instanceType: 'redis-standard-m1', label: 'Standard M1', pricePerHour: 0.068 },
    ],
  },
  {
    name: 'Bigtable',
    category: 'Database',
    gcpServiceCode: 'bigtable.googleapis.com',
    pricingType: 'instance',
    description: 'Wide-column NoSQL database',
    instances: [
      { instanceType: 'bigtable-1-node', label: '1 node cluster', pricePerHour: 0.65 },
    ],
  },
  {
    name: 'Cloud Storage',
    category: 'Storage',
    gcpServiceCode: 'storage.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Object storage',
    instances: [
      { instanceType: 'gcs-light', label: 'Light (~5 GB/day)' },
      { instanceType: 'gcs-standard', label: 'Standard (~20 GB/day)' },
      { instanceType: 'gcs-heavy', label: 'Heavy (~50 GB/day)' },
    ],
  },
  {
    name: 'Filestore',
    category: 'Storage',
    gcpServiceCode: 'file.googleapis.com',
    pricingType: 'instance',
    description: 'Managed NFS file storage',
    instances: [
      { instanceType: 'filestore-basic-1tb', label: 'Basic 1 TB', pricePerHour: 0.2 },
    ],
  },
  {
    name: 'GKE',
    category: 'Container',
    gcpServiceCode: 'container.googleapis.com',
    pricingType: 'instance',
    description: 'Google Kubernetes Engine',
    instances: [
      { instanceType: 'gke-small', label: 'Small cluster (3 nodes)', pricePerHour: 0.2 },
      { instanceType: 'gke-standard', label: 'Standard cluster (3 nodes)', pricePerHour: 0.4 },
    ],
  },
  {
    name: 'Artifact Registry',
    category: 'Container',
    gcpServiceCode: 'artifactregistry.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Container and artifact storage',
    instances: [{ instanceType: 'artifact-standard', label: 'Standard' }],
  },
  {
    name: 'VPC',
    category: 'Networking',
    gcpServiceCode: 'compute.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Virtual Private Cloud networking',
    instances: [
      { instanceType: 'vpc-light', label: 'Light' },
      { instanceType: 'vpc-standard', label: 'Standard' },
    ],
  },
  {
    name: 'Cloud DNS',
    category: 'Networking',
    gcpServiceCode: 'dns.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Managed DNS',
    instances: [{ instanceType: 'dns-standard', label: 'Standard zone' }],
  },
  {
    name: 'Cloud CDN',
    category: 'Networking',
    gcpServiceCode: 'cloudcdn.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Content delivery network',
    instances: [
      { instanceType: 'cdn-light', label: 'Light' },
      { instanceType: 'cdn-standard', label: 'Standard' },
    ],
  },
  {
    name: 'Cloud Load Balancing',
    category: 'Networking',
    gcpServiceCode: 'compute.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Global and regional load balancers',
    instances: [{ instanceType: 'lb-standard', label: 'Standard' }],
  },
  {
    name: 'BigQuery',
    category: 'Analytics',
    gcpServiceCode: 'bigquery.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Serverless data warehouse',
    instances: [
      { instanceType: 'bq-light', label: 'Light queries' },
      { instanceType: 'bq-standard', label: 'Standard queries' },
    ],
  },
  {
    name: 'Dataflow',
    category: 'Analytics',
    gcpServiceCode: 'dataflow.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Stream and batch processing',
    instances: [{ instanceType: 'dataflow-standard', label: 'Standard workers' }],
  },
  {
    name: 'Dataproc',
    category: 'Analytics',
    gcpServiceCode: 'dataproc.googleapis.com',
    pricingType: 'instance',
    description: 'Managed Spark and Hadoop',
    instances: [
      { instanceType: 'dataproc-n1-standard-2', label: 'n1-standard-2 cluster', pricePerHour: 0.15 },
    ],
  },
  {
    name: 'Pub/Sub',
    category: 'Analytics',
    gcpServiceCode: 'pubsub.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Messaging and event ingestion',
    instances: [
      { instanceType: 'pubsub-light', label: 'Light' },
      { instanceType: 'pubsub-standard', label: 'Standard' },
    ],
  },
  {
    name: 'Vertex AI',
    category: 'ML',
    gcpServiceCode: 'aiplatform.googleapis.com',
    pricingType: 'instance',
    description: 'Unified ML platform',
    instances: [
      { instanceType: 'n1-standard-4', label: 'n1-standard-4', pricePerHour: 0.19 },
      { instanceType: 'n1-standard-8', label: 'n1-standard-8', pricePerHour: 0.38 },
    ],
  },
  {
    name: 'Cloud Vision',
    category: 'ML',
    gcpServiceCode: 'vision.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Image analysis API',
    instances: [{ instanceType: 'vision-standard', label: 'Standard API usage' }],
  },
  {
    name: 'Secret Manager',
    category: 'Security',
    gcpServiceCode: 'secretmanager.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Secrets storage and access',
    instances: [{ instanceType: 'secrets-standard', label: 'Standard' }],
  },
  {
    name: 'Cloud KMS',
    category: 'Security',
    gcpServiceCode: 'cloudkms.googleapis.com',
    pricingType: 'flat_rate',
    description: 'Key management service',
    instances: [{ instanceType: 'kms-standard', label: 'Standard' }],
  },
];

export const COMPUTE_MACHINE_TYPES = [
  'e2-micro',
  'e2-small',
  'e2-medium',
  'e2-standard-2',
  'e2-standard-4',
  'e2-standard-8',
  'e2-standard-16',
  'n1-standard-4',
  'n1-standard-8',
];

export const MACHINE_RESOURCES = {
  'e2-micro': { vcpu: 0.25, ramGb: 1 },
  'e2-small': { vcpu: 0.5, ramGb: 2 },
  'e2-medium': { vcpu: 1, ramGb: 4 },
  'e2-standard-2': { vcpu: 2, ramGb: 8 },
  'e2-standard-4': { vcpu: 4, ramGb: 16 },
  'e2-standard-8': { vcpu: 8, ramGb: 32 },
  'e2-standard-16': { vcpu: 16, ramGb: 64 },
  'n1-standard-4': { vcpu: 4, ramGb: 15 },
  'n1-standard-8': { vcpu: 8, ramGb: 30 },
};
